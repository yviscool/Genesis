// src/execution.ts

import { consola } from 'consola';
import ora from 'ora';
import { execa, execaCommand } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { green } from 'picocolors';
import { type GenesisConfig } from './types';
import { detectLanguage, type LanguageInfo } from './language';
import { t } from './i18n';

// =============================================================================
// --- Constants & Type Definitions ---
// =============================================================================

const TEMP_DIR = '.genesis';
const CACHE_FILE = path.join(TEMP_DIR, 'cache.json');

interface CacheMetadata {
  [cacheKey: string]: {
    hash: string;
    executablePath: string;
  };
}

export interface ExecutionResult {
  runArgs: string[];
  executablePath: string; // For compiled languages, the path to the binary; for interpreted, the source path.
}

// =============================================================================
// --- Main Execution Orchestrator ---
// =============================================================================

/**
 * (Coordinator) Prepares a source file for execution.
 * For compiled languages, this involves caching and recompilation.
 * For interpreted languages, it identifies the correct runtime.
 * @returns {Promise<ExecutionResult | null>} An object with the command and arguments to run, or null on failure.
 */
export async function prepareForExecution(
  sourceFile: string,
  config: Pick<GenesisConfig, 'compiler' | 'compilerFlags'>
): Promise<ExecutionResult | null> {
  const lang = detectLanguage(sourceFile);
  if (!lang) {
    consola.error(`Unsupported language for file: ${sourceFile}`);
    return null;
  }

  if (lang.type === 'interpreted') {
    return handleInterpretedLanguage(sourceFile, lang);
  } else {
    return handleCompiledLanguage(sourceFile, lang, config);
  }
}

// =============================================================================
// --- Interpreted Language Logic ---
// =============================================================================

async function handleInterpretedLanguage(sourceFile: string, lang: LanguageInfo): Promise<ExecutionResult | null> {
  let runtime: string | null = null;
  const args: string[] = [];

  switch (lang.id) {
    case 'python':
      runtime = await findRuntime(['python3', 'python']);
      break;
    case 'javascript':
      runtime = await findRuntime(['node']);
      break;
    case 'typescript':
      runtime = await findRuntime(['tsx']);
      break;
  }

  if (!runtime) {
    consola.error(`Could not find runtime for ${lang.name}. Please ensure it is installed and in your PATH.`);
    return null;
  }

  args.push(sourceFile);
  return {
    runArgs: [runtime, ...args],
    executablePath: sourceFile,
  };
}

// =============================================================================
// --- Compiled Language Logic ---
// =============================================================================

async function handleCompiledLanguage(
  sourceFile: string,
  lang: LanguageInfo,
  config: Pick<GenesisConfig, 'compiler' | 'compilerFlags'>
): Promise<ExecutionResult | null> {
  const compiler = await resolveCompiler(lang, config.compiler);
  if (!compiler) {
    consola.error(getCompilerHelpMessage(lang));
    return null;
  }
  consola.info(t('compilation.usingCompiler', compiler));

  const profile = await getCompilationProfile(sourceFile, compiler, lang, config.compilerFlags);
  const cacheKey = `${sourceFile}-${compiler}`;

  const cachedExecutable = await findCachedExecutable(cacheKey, profile.hash);
  if (cachedExecutable) {
    consola.info(t('compilation.hashMatch', sourceFile));
    const runArgs = getRunCommand(cachedExecutable, sourceFile, lang);
    return { runArgs, executablePath: cachedExecutable };
  }

  const executablePath = await executeCompilation(sourceFile, compiler, profile, lang, cacheKey);
  if (!executablePath) {
    return null;
  }

  const runArgs = getRunCommand(executablePath, sourceFile, lang);
  return { runArgs, executablePath };
}

function getRunCommand(executablePath: string, sourceFile: string, lang: LanguageInfo): string[] {
  if (lang.id === 'java') {
    const dir = path.dirname(executablePath); // The .class file is in the cache dir
    const className = path.basename(sourceFile, '.java');
    return ['java', '-cp', dir, className];
  }
  return [executablePath];
}

// =============================================================================
// --- Compiler & Profile Helpers ---
// =============================================================================

async function resolveCompiler(lang: LanguageInfo, userCompiler?: string): Promise<string | null> {
  if (userCompiler) return userCompiler;

  const compilers: { [langId: string]: string[] } = {
    cpp: ['g++', 'clang++'],
    go: ['go'],
    rust: ['rustc'],
    java: ['javac'],
  };

  return findRuntime(compilers[lang.id] || []);
}

async function getCompilationProfile(
  sourceFile: string,
  compiler: string,
  lang: LanguageInfo,
  userFlags: string[] = []
): Promise<{ hash: string, flags: string[] }> {
  const defaultFlags: { [langId: string]: string[] } = {
    cpp: ['-O2', '-std=c++17', '-Wall'],
    rust: ['-C', 'opt-level=2'],
  };
  const baseFlags = defaultFlags[lang.id] || [];
  const finalFlags = [...baseFlags, ...userFlags];

  await fs.mkdir(TEMP_DIR, { recursive: true });
  const sourceContent = await fs.readFile(sourceFile);
  const uniqueProfile = sourceContent.toString() + compiler + finalFlags.join('');
  const currentHash = crypto.createHash('sha256').update(uniqueProfile).digest('hex');

  return { hash: currentHash, flags: finalFlags };
}

// =============================================================================
// --- Compilation & Caching ---
// =============================================================================

async function findCachedExecutable(cacheKey: string, currentHash: string): Promise<string | null> {
  const cache = await readCache();
  const entry = cache[cacheKey];
  if (entry && entry.hash === currentHash) {
    try {
      // For Java, the executable path is the directory containing the .class file.
      await fs.access(entry.executablePath);
      return entry.executablePath;
    } catch {
      consola.warn(t('compilation.cacheMissing'));
    }
  }
  return null;
}

async function executeCompilation(
  sourceFile: string,
  compiler: string,
  profile: { hash: string, flags: string[] },
  lang: LanguageInfo,
  cacheKey: string
): Promise<string | null> {
  const spinner = ora(t('compilation.compiling', sourceFile, compiler)).start();

  const getCommand = (): { command: string, args: string[], executablePath: string } => {
    const baseName = path.parse(sourceFile).name;
    const hashSuffix = profile.hash.substring(0, 8);

    if (lang.id === 'java') {
      // For Java, compile into the cache directory, but don't rename the class file.
      const outputDir = path.join(TEMP_DIR, `${baseName}-${hashSuffix}`);
      return {
        command: compiler,
        args: [...profile.flags, '-d', outputDir, sourceFile],
        executablePath: outputDir, // The "executable" is the directory.
      };
    }

    const exeSuffix = process.platform === 'win32' ? '.exe' : '';
    const executablePath = path.join(TEMP_DIR, `${baseName}-${hashSuffix}${exeSuffix}`);
    const args = [sourceFile, '-o', executablePath, ...profile.flags];

    if (lang.id === 'go') {
        return { command: compiler, args: ['build', '-o', executablePath, sourceFile], executablePath };
    }

    return { command: compiler, args, executablePath };
  };

  const { command, args, executablePath } = getCommand();
  try {
    // For Java, we need to ensure the output directory exists before compiling
    if (lang.id === 'java') {
      await fs.mkdir(executablePath, { recursive: true });
    }
    await execa(command, args);
    spinner.succeed(t('compilation.compiled', sourceFile));

    await updateCache(cacheKey, profile.hash, executablePath);
    return executablePath;
  } catch (error: any) {
    spinner.fail(t('compilation.compileFailed', sourceFile));
    consola.error(t('compilation.compilerError', error.stderr || error.message));
    return null;
  }
}

async function readCache(): Promise<CacheMetadata> {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

async function updateCache(cacheKey: string, hash: string, executablePath: string): Promise<void> {
  const cache = await readCache();
  cache[cacheKey] = { hash, executablePath };
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// =============================================================================
// --- System Runtime Utilities ---
// =============================================================================

async function findRuntime(commands: readonly string[]): Promise<string | null> {
  for (const cmd of commands) {
    try {
      // Special handling for 'go' command
      if (cmd === 'go') {
        await execaCommand('go version'); // 'go' expects 'version' as a subcommand
      } else {
        // For other commands, try '--version' first, then '-v'
        try {
          await execaCommand(`${cmd} --version`);
        } catch {
          await execaCommand(`${cmd} -v`); // Fallback to -v
        }
      }
      return cmd;
    } catch (error) {
      // console.error(`Failed to run version check for '${cmd}':`, error); // Keep this for debugging if needed
      // Continue to next command if this one fails
    }
  }
  return null;
}

function getCompilerHelpMessage(lang: LanguageInfo): string {
  let message = `Error: No ${lang.name} compiler found. Please install it and ensure it is in your system PATH.\n`;
  const platform = process.platform;

  const guides: { [key: string]: { [key: string]: string } } = {
    cpp: {
      win32: t('compiler.installGuide.windows', green('pacman -S --needed base-devel mingw-w64-ucrt-x86_64-toolchain')),
      darwin: t('compiler.installGuide.macos', green('xcode-select --install')),
      linux: t('compiler.installGuide.linux.debian', green('sudo apt update && sudo apt install build-essential')),
    },
    go: {
      default: `See ${green('https://golang.org/doc/install')}`,
    },
    rust: {
      default: `See ${green('https://www.rust-lang.org/tools/install')}`,
    },
    java: {
      default: `Install a JDK (e.g., OpenJDK) for your system.`,
    },
  };

  const langGuides = guides[lang.id] || {};
  message += langGuides[platform] || langGuides['linux'] || langGuides['default'] || '';

  return message;
}
