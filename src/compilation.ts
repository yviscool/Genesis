// src/compilation.ts

import { consola } from 'consola';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { type GenesisConfig } from './types';
import {
  findSystemCompiler,
  DEFAULT_COMPILER_CONFIGS,
  getCompilerHelpMessage
} from './compiler';
import { t } from './i18n';

// =============================================================================
// --- Constants & Defaults ---
// =============================================================================

const TEMP_DIR = '.genesis';
const CACHE_FILE = path.join(TEMP_DIR, 'cache.json');

// =============================================================================
// --- Type Definitions ---
// =============================================================================

/** Cache metadata structure for storing compilation artifact information. */
interface CacheMetadata {
  [cacheKey: string]: {
    hash: string;
    executablePath: string;
  };
}

// =============================================================================
// --- Compilation Service ---
// =============================================================================

/**
 * (Coordinator) Smart compilation module: handles caching and recompiles when necessary.
 * This is the main entry point for compilation logic, delegating to single-responsibility helpers.
 * @returns {Promise<string | null>} The path to the executable if compilation is successful, otherwise null.
 */
export async function getExecutable(
  sourceFile: string,
  config: Pick<GenesisConfig, 'compiler' | 'compilerFlags'>
): Promise<string | null> {
  const compilerCommand = await resolveCompiler(config.compiler);
  if (!compilerCommand) {
    consola.error(getCompilerHelpMessage());
    return null;
  }
  consola.info(t('compilation.usingCompiler', compilerCommand));

  const profile = await getCompilationProfile(sourceFile, compilerCommand, config.compilerFlags);
  const cacheKey = `${sourceFile}-${compilerCommand}`;

  const cachedExecutable = await findCachedExecutable(cacheKey, profile.hash);
  if (cachedExecutable) {
    consola.info(t('compilation.hashMatch', sourceFile));
    return cachedExecutable;
  }

  return executeCompilation(sourceFile, compilerCommand, profile, cacheKey);
}

/**
 * (Helper) Determines the compiler command to use.
 * @returns {Promise<string | null>} The resolved compiler command, or null if none is found.
 */
async function resolveCompiler(userCompiler?: string): Promise<string | null> {
  return userCompiler || await findSystemCompiler();
}

/**
 * (Helper) Computes the unique profile (hash and flags) for the current compilation config.
 * @param sourceFile - Path to the solution source file.
 * @param compilerCommand - The compiler command being used.
 * @returns {Promise<{ hash: string, flags: string[] }>} An object containing the hash and final compilation flags.
 */
async function getCompilationProfile(
  sourceFile: string,
  compilerCommand: string,
  userFlags: string[] = []
): Promise<{ hash: string, flags: string[] }> {
  const baseConfig = DEFAULT_COMPILER_CONFIGS[compilerCommand as keyof typeof DEFAULT_COMPILER_CONFIGS]
    || DEFAULT_COMPILER_CONFIGS['g++'];
  const finalFlags = [...baseConfig.flags, ...(userFlags || [])];

  await fs.mkdir(TEMP_DIR, { recursive: true });
  const sourceContent = await fs.readFile(sourceFile);
  const uniqueProfile = sourceContent.toString() + compilerCommand + finalFlags.join('');
  const currentHash = crypto.createHash('sha256').update(uniqueProfile).digest('hex');

  return { hash: currentHash, flags: finalFlags };
}

/**
 * (Helper) Checks for and returns a valid, existing cached executable path.
 * @param cacheKey - The cache key, composed of the source file and compiler.
 * @param currentHash - The hash of the current compilation profile.
 * @returns {Promise<string | null>} The path to the executable if a valid cache is found, otherwise null.
 */
async function findCachedExecutable(cacheKey: string, currentHash: string): Promise<string | null> {
  let cache: CacheMetadata = {};
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
  } catch {
    return null; // Cache file doesn't exist or is unparsable
  }

  const entry = cache[cacheKey];
  if (entry && entry.hash === currentHash) {
    try {
      await fs.access(entry.executablePath); // Verify the file still physically exists
      return entry.executablePath;
    } catch {
      consola.warn(t('compilation.cacheMissing'));
    }
  }
  return null;
}

/**
 * (Helper) Executes the compilation command and updates the cache on success.
 * @param sourceFile - Path to the C++ solution source file.
 * @param compilerCommand - The compiler command to use.
 * @param profile - The compilation profile object, containing the hash and flags.
 * @param cacheKey - The key for writing to the cache.
 * @returns {Promise<string | null>} The path to the executable on success, otherwise null.
 */
async function executeCompilation(
  sourceFile: string,
  compilerCommand: string,
  profile: { hash: string, flags: string[] },
  cacheKey: string
): Promise<string | null> {
  const spinner = ora(t('compilation.compiling', sourceFile, compilerCommand)).start();
  const executableName = path.parse(sourceFile).name;
  const executableSuffix = process.platform === 'win32' ? '.exe' : '';
  const executablePath = path.join(TEMP_DIR, `${executableName}-${profile.hash.substring(0, 8)}${executableSuffix}`);

  try {
    await execa(compilerCommand, [sourceFile, '-o', executablePath, ...profile.flags]);
    spinner.succeed(t('compilation.compiled', sourceFile));

    await updateCache(cacheKey, profile.hash, executablePath);
    return executablePath;
  } catch (error: any) {
    spinner.fail(t('compilation.compileFailed', sourceFile));
    consola.error(t('compilation.compilerError', error.stderr || error.message));
    return null;
  }
}

/**
 * (Helper) Updates the cache file. Made atomic to improve code clarity.
 * @param cacheKey
 * @param hash
 * @param executablePath
 */
async function updateCache(cacheKey: string, hash: string, executablePath: string): Promise<void> {
  let cache: CacheMetadata = {};
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
  } catch {} // Ignore read errors, we'll create a new one
  
  cache[cacheKey] = { hash, executablePath };
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}
