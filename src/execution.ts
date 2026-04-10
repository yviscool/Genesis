import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { consola } from 'consola';
import { execa } from 'execa';
import ora from 'ora';
import { green } from 'picocolors';
import { detectLanguage, type LanguageInfo } from './language';
import { t } from './i18n';
import { type GenesisConfig, type OjProfile } from './types';

export const GENESIS_CACHE_DIR = '.genesis';
const CACHE_FILE = path.join(GENESIS_CACHE_DIR, 'cache.json');
const DEFAULT_WINDOWS_CPP_STACK_SIZE_BYTES = 16 * 1024 * 1024;

const DEFAULT_COMPILER_FLAGS: Record<string, string[]> = {
  cpp: ['-O2', '-std=c++17', '-Wall'],
  rust: ['-C', 'opt-level=2'],
};

interface CacheMetadata {
  [cacheKey: string]: {
    hash: string;
    executablePath: string;
  };
}

export interface ExecutionConfig extends Pick<GenesisConfig, 'compiler' | 'compilerFlags' | 'ojProfile' | 'stackSizeBytes'> {}

export interface ResolvedCompiler {
  command: string;
  inlineFlags: string[];
  displayName: string;
}

export interface ExecutionResult {
  runArgs: string[];
  executablePath: string;
}

export interface CompilationProfileContext {
  compilerVersion?: string | null;
  platform?: NodeJS.Platform;
  arch?: string;
  ojProfile?: OjProfile;
  stackSizeBytes?: number;
}

type CppToolchain = 'gnu' | 'msvc' | 'unknown';

export async function prepareForExecution(
  sourceFile: string,
  config: ExecutionConfig
): Promise<ExecutionResult | null> {
  const lang = detectLanguage(sourceFile);
  if (!lang) {
    consola.error(`Unsupported language for file: ${sourceFile}`);
    return null;
  }

  if (lang.type === 'interpreted') {
    return handleInterpretedLanguage(sourceFile, lang);
  }

  return handleCompiledLanguage(sourceFile, lang, config);
}

async function handleInterpretedLanguage(sourceFile: string, lang: LanguageInfo): Promise<ExecutionResult | null> {
  let runtime: string | null = null;

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

  return {
    runArgs: [runtime, sourceFile],
    executablePath: sourceFile,
  };
}

async function handleCompiledLanguage(
  sourceFile: string,
  lang: LanguageInfo,
  config: ExecutionConfig
): Promise<ExecutionResult | null> {
  const compiler = await resolveCompiler(lang, config.compiler);
  if (!compiler) {
    consola.error(getCompilerHelpMessage(lang));
    return null;
  }

  const compilerVersion = await getCompilerVersion(compiler);
  if (compilerVersion) {
    consola.info(t('compilation.usingCompiler', `${compiler.displayName} ${green(compilerVersion)}`));
  } else {
    consola.info(t('compilation.usingCompiler', compiler.displayName));
  }

  const profileContext: CompilationProfileContext = {
    compilerVersion,
    platform: process.platform,
    arch: process.arch,
    ojProfile: config.ojProfile,
    stackSizeBytes: config.stackSizeBytes,
  };
  const profile = await getCompilationProfile(sourceFile, compiler, lang, config.compilerFlags, profileContext);
  const cacheKey = `${sourceFile}-${compiler.displayName}-${process.platform}-${process.arch}`;

  const cachedExecutable = await findCachedExecutable(cacheKey, profile.hash);
  if (cachedExecutable) {
    consola.info(t('compilation.hashMatch', sourceFile));
    return {
      runArgs: getRunCommand(cachedExecutable, sourceFile, lang),
      executablePath: cachedExecutable,
    };
  }

  const executablePath = await executeCompilation(sourceFile, compiler, profile, lang, cacheKey);
  if (!executablePath) {
    return null;
  }

  return {
    runArgs: getRunCommand(executablePath, sourceFile, lang),
    executablePath,
  };
}

function getRunCommand(executablePath: string, sourceFile: string, lang: LanguageInfo): string[] {
  if (lang.id === 'java') {
    const className = path.basename(sourceFile, '.java');
    return ['java', '-cp', executablePath, className];
  }

  return [executablePath];
}

export async function resolveCompiler(lang: LanguageInfo, userCompiler?: string): Promise<ResolvedCompiler | null> {
  if (userCompiler) {
    const parts = splitCommandString(userCompiler);
    if (parts.length === 0) {
      return null;
    }

    const [command, ...inlineFlags] = parts;
    return {
      command,
      inlineFlags,
      displayName: parts.join(' '),
    };
  }

  const compilers: Record<string, string[]> = {
    cpp: ['g++', 'clang++'],
    go: ['go'],
    rust: ['rustc'],
    java: ['javac'],
  };

  const command = await findRuntime(compilers[lang.id] || []);
  if (!command) {
    return null;
  }

  return {
    command,
    inlineFlags: [],
    displayName: command,
  };
}

export async function getCompilationProfile(
  sourceFile: string,
  compiler: ResolvedCompiler,
  lang: LanguageInfo,
  userFlags: string[] = [],
  context: CompilationProfileContext = {}
): Promise<{ hash: string, flags: string[] }> {
  const finalFlags = buildCompilerFlags(lang, compiler.command, compiler.inlineFlags, userFlags, context);

  await fs.mkdir(GENESIS_CACHE_DIR, { recursive: true });
  const sourceContent = await fs.readFile(sourceFile, 'utf8');
  const fingerprint = buildCompilationFingerprint(sourceContent, compiler, finalFlags, context);
  const hash = crypto.createHash('sha256').update(fingerprint).digest('hex');

  return { hash, flags: finalFlags };
}

export function buildCompilationFingerprint(
  sourceContent: string,
  compiler: ResolvedCompiler,
  finalFlags: string[],
  context: CompilationProfileContext = {}
): string {
  return [
    sourceContent,
    compiler.displayName,
    context.compilerVersion ?? 'unknown',
    context.platform ?? process.platform,
    context.arch ?? process.arch,
    finalFlags.join('\0'),
  ].join('\0');
}

export function buildCompilerFlags(
  lang: LanguageInfo,
  compilerCommand: string,
  inlineFlags: string[] = [],
  userFlags: string[] = [],
  context: CompilationProfileContext = {}
): string[] {
  const baseFlags = DEFAULT_COMPILER_FLAGS[lang.id] || [];
  const explicitFlags = [...inlineFlags, ...userFlags];
  const automaticFlags = getAutomaticCompilerFlags(lang, compilerCommand, explicitFlags, context);

  return [...baseFlags, ...automaticFlags, ...userFlags];
}

function getAutomaticCompilerFlags(
  lang: LanguageInfo,
  compilerCommand: string,
  explicitFlags: string[],
  context: CompilationProfileContext = {}
): string[] {
  const platform = context.platform ?? process.platform;
  if (lang.id !== 'cpp' || platform !== 'win32') {
    return [];
  }

  if (hasExplicitWindowsStackFlag(explicitFlags)) {
    return [];
  }

  const stackSizeBytes = resolveDesiredStackSizeBytes(context);
  if (!stackSizeBytes) {
    return [];
  }

  return getWindowsStackFlags(compilerCommand, stackSizeBytes);
}

function resolveDesiredStackSizeBytes(context: CompilationProfileContext): number | null {
  if (isValidStackSize(context.stackSizeBytes)) {
    return Math.floor(context.stackSizeBytes!);
  }

  const ojProfile = context.ojProfile ?? 'auto';
  if (ojProfile === 'none' || ojProfile === 'windows') {
    return null;
  }

  return DEFAULT_WINDOWS_CPP_STACK_SIZE_BYTES;
}

function isValidStackSize(stackSizeBytes?: number): boolean {
  return typeof stackSizeBytes === 'number'
    && Number.isFinite(stackSizeBytes)
    && stackSizeBytes > 0;
}

function getWindowsStackFlags(compilerCommand: string, stackSizeBytes: number): string[] {
  const toolchain = detectCppToolchain(compilerCommand);

  if (toolchain === 'msvc') {
    return ['/link', `/STACK:${stackSizeBytes}`];
  }

  if (toolchain === 'gnu') {
    return [`-Wl,--stack,${stackSizeBytes}`];
  }

  return [];
}

function detectCppToolchain(compilerCommand: string): CppToolchain {
  const compilerName = path.basename(compilerCommand).toLowerCase();

  if (
    compilerName === 'cl'
    || compilerName === 'cl.exe'
    || compilerName === 'clang-cl'
    || compilerName === 'clang-cl.exe'
  ) {
    return 'msvc';
  }

  if (
    compilerName === 'g++'
    || compilerName === 'g++.exe'
    || compilerName === 'c++'
    || compilerName === 'c++.exe'
    || compilerName.includes('g++')
    || compilerName.includes('clang++')
  ) {
    return 'gnu';
  }

  return 'unknown';
}

function hasExplicitWindowsStackFlag(flags: string[]): boolean {
  for (let index = 0; index < flags.length; index++) {
    const current = flags[index]?.toLowerCase() || '';
    const next = flags[index + 1]?.toLowerCase() || '';

    if (isWindowsStackFlag(current)) {
      return true;
    }

    if ((current === '-xlinker' || current === '/link') && isWindowsStackFlag(next)) {
      return true;
    }
  }

  return false;
}

function isWindowsStackFlag(flag: string): boolean {
  return /(?:^|,)--stack(?:[=,]|$)/.test(flag) || /^\/stack:/.test(flag);
}

export function splitCommandString(commandLine: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < commandLine.length; index++) {
    const char = commandLine[index];
    const next = commandLine[index + 1];

    if (char === '\\' && next && (next === quote || next === '"' || next === "'" || next === '\\')) {
      current += next;
      index++;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

async function findCachedExecutable(cacheKey: string, currentHash: string): Promise<string | null> {
  const cache = await readCache();
  const entry = cache[cacheKey];

  if (entry && entry.hash === currentHash) {
    try {
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
  compiler: ResolvedCompiler,
  profile: { hash: string, flags: string[] },
  lang: LanguageInfo,
  cacheKey: string
): Promise<string | null> {
  const spinner = ora(t('compilation.compiling', sourceFile, compiler.displayName)).start();
  const { command, args, executablePath } = getCompilationCommand(sourceFile, compiler, profile.flags, lang, profile.hash);

  try {
    if (lang.id === 'java') {
      await fs.mkdir(executablePath, { recursive: true });
    }

    await execa(command, args);
    spinner.succeed(t('compilation.compiled', sourceFile));
    await updateCache(cacheKey, profile.hash, executablePath);
    return executablePath;
  } catch (error: any) {
    spinner.fail(t('compilation.compileFailed', sourceFile));
    const { formatCompilerError } = await import('./error-formatter');
    consola.error(formatCompilerError(error.stderr || error.message, sourceFile));
    return null;
  }
}

function getCompilationCommand(
  sourceFile: string,
  compiler: ResolvedCompiler,
  flags: string[],
  lang: LanguageInfo,
  hash: string
): { command: string, args: string[], executablePath: string } {
  const baseName = path.parse(sourceFile).name;
  const hashSuffix = hash.substring(0, 8);

  if (lang.id === 'java') {
    const outputDir = path.join(GENESIS_CACHE_DIR, `${baseName}-${hashSuffix}`);
    return {
      command: compiler.command,
      args: [...compiler.inlineFlags, ...flags, '-d', outputDir, sourceFile],
      executablePath: outputDir,
    };
  }

  const exeSuffix = process.platform === 'win32' ? '.exe' : '';
  const executablePath = path.join(GENESIS_CACHE_DIR, `${baseName}-${hashSuffix}${exeSuffix}`);

  if (lang.id === 'go') {
    return {
      command: compiler.command,
      args: [...compiler.inlineFlags, 'build', ...flags, '-o', executablePath, sourceFile],
      executablePath,
    };
  }

  return {
    command: compiler.command,
    args: [...compiler.inlineFlags, sourceFile, '-o', executablePath, ...flags],
    executablePath,
  };
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

async function findRuntime(commands: readonly string[]): Promise<string | null> {
  for (const cmd of commands) {
    try {
      if (cmd === 'go') {
        await execa(cmd, ['version']);
      } else {
        try {
          await execa(cmd, ['--version']);
        } catch {
          await execa(cmd, ['-v']);
        }
      }

      return cmd;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

async function getCompilerVersion(compiler: ResolvedCompiler): Promise<string | null> {
  try {
    let stdout: string;
    const compilerName = path.basename(compiler.command).toLowerCase();

    if (compilerName === 'go' || compilerName === 'go.exe') {
      const result = await execa(compiler.command, [...compiler.inlineFlags, 'version']);
      stdout = result.stdout;
      return stdout.match(/go(\d+\.\d+\.\d+)/)?.[1] ?? null;
    }

    if (compilerName === 'javac' || compilerName === 'javac.exe') {
      const result = await execa(compiler.command, [...compiler.inlineFlags, '-version']);
      stdout = result.stdout || result.stderr;
      return stdout.match(/javac\s+(\S+)/)?.[1] ?? null;
    }

    if (compilerName === 'rustc' || compilerName === 'rustc.exe') {
      const result = await execa(compiler.command, [...compiler.inlineFlags, '--version']);
      stdout = result.stdout;
      return stdout.match(/rustc\s+(\S+)/)?.[1] ?? null;
    }

    if (compilerName === 'cl' || compilerName === 'cl.exe') {
      const result = await execa(compiler.command, [...compiler.inlineFlags], { reject: false });
      stdout = `${result.stdout}\n${result.stderr}`;
      return stdout.match(/version\s+(\S+)/i)?.[1] ?? null;
    }

    const result = await execa(compiler.command, [...compiler.inlineFlags, '--version']);
    stdout = result.stdout;
    return stdout.match(/(\d+\.\d+\.\d+|\d+\.\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function getCompilerHelpMessage(lang: LanguageInfo): string {
  const platform = process.platform;

  const installCommands: { [key: string]: { [key: string]: string } } = {
    cpp: {
      win32: 'pacman -S --needed base-devel mingw-w64-ucrt-x86_64-toolchain',
      darwin: 'xcode-select --install',
      linux: 'sudo apt update && sudo apt install build-essential',
    },
    go: {
      default: 'https://golang.org/doc/install',
    },
    rust: {
      default: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
    },
    java: {
      linux: 'sudo apt install default-jdk',
      darwin: 'brew install openjdk',
      default: 'https://adoptium.net/',
    },
  };

  const langCommands = installCommands[lang.id] || {};
  const command = langCommands[platform] || langCommands.linux || langCommands.default || '';

  let message = `\n${t('compiler.notFoundNew', lang.name)}\n\n`;
  message += `${t('compiler.installHint')}\n\n`;

  if (command.startsWith('http')) {
    message += `${t('compiler.installGuideLink', green(command))}\n`;
  } else {
    message += `${t('compiler.copyCommand')}\n\n`;
    message += `   ${green(command)}\n`;
  }

  return message;
}
