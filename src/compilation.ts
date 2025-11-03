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

// =============================================================================
// --- 常量与默认配置 (Constants & Defaults) ---
// =============================================================================

const TEMP_DIR = '.genesis';
const CACHE_FILE = path.join(TEMP_DIR, 'cache.json');

// =============================================================================
// --- 类型定义 (Type Definitions) ---
// =============================================================================

/** 缓存元数据结构，用于存储编译产物的信息 */
interface CacheMetadata {
  [cacheKey: string]: {
    hash: string;
    executablePath: string;
  };
}

// =============================================================================
// --- 编译服务 (Compilation Service) ---
// =============================================================================

/**
 * (协调器) 智能编译模块：处理缓存、并在需要时重新编译。
 * 这是编译逻辑的主入口，它将复杂流程委托给多个职责单一的辅助方法。
 * @returns {Promise<string | null>} 编译成功返回可执行文件路径，失败则返回 null。
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
  consola.info(`Using compiler: ${compilerCommand}`);

  const profile = await getCompilationProfile(sourceFile, compilerCommand, config.compilerFlags);
  const cacheKey = `${sourceFile}-${compilerCommand}`;

  const cachedExecutable = await findCachedExecutable(cacheKey, profile.hash);
  if (cachedExecutable) {
    consola.info(`Hash match. Using cached executable for ${sourceFile}.`);
    return cachedExecutable;
  }

  return executeCompilation(sourceFile, compilerCommand, profile, cacheKey);
}

/**
 * (辅助) 确定要使用的编译器命令。
 * @returns {Promise<string | null>} 返回找到的编译器命令，否则返回 null。
 */
async function resolveCompiler(userCompiler?: string): Promise<string | null> {
  return userCompiler || await findSystemCompiler();
}

/**
 * (辅助) 计算当前编译配置的唯一特征信息（哈希和编译标志）。
 * @param sourceFile - 解决方案的源文件路径。
 * @param compilerCommand - 使用的编译器命令。
 * @returns {Promise<{ hash: string, flags: string[] }>} 包含哈希和最终编译标志的对象。
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
 * (辅助) 检查并返回有效的、依然存在于文件系统中的缓存可执行文件路径。
 * @param cacheKey - 由源文件名和编译器组成的缓存键。
 * @param currentHash - 当前编译配置的哈希值。
 * @returns {Promise<string | null>} 如果找到有效缓存则返回可执行文件路径，否则返回 null。
 */
async function findCachedExecutable(cacheKey: string, currentHash: string): Promise<string | null> {
  let cache: CacheMetadata = {};
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
  } catch {
    return null; // 缓存文件不存在或无法解析
  }

  const entry = cache[cacheKey];
  if (entry && entry.hash === currentHash) {
    try {
      await fs.access(entry.executablePath); // 确认文件物理上还存在
      return entry.executablePath;
    } catch {
      consola.warn('Cached executable record found, but the file is missing. Forcing recompilation.');
    }
  }
  return null;
}

/**
 * (辅助) 执行编译命令，并在成功后更新缓存文件。
 * @param sourceFile - C++ 解决方案的源文件路径。
 * @param compilerCommand - 使用的编译器命令。
 * @param profile - 包含哈希和编译标志的编译配置对象。
 * @param cacheKey - 用于写入缓存的键。
 * @returns {Promise<string | null>} 编译成功返回可执行文件路径，失败则返回 null。
 */
async function executeCompilation(
  sourceFile: string,
  compilerCommand: string,
  profile: { hash: string, flags: string[] },
  cacheKey: string
): Promise<string | null> {
  const spinner = ora(`Compiling ${sourceFile} with ${compilerCommand}...`).start();
  const executableName = path.parse(sourceFile).name;
  const executableSuffix = process.platform === 'win32' ? '.exe' : '';
  const executablePath = path.join(TEMP_DIR, `${executableName}-${profile.hash.substring(0, 8)}${executableSuffix}`);

  try {
    await execa(compilerCommand, [sourceFile, '-o', executablePath, ...profile.flags]);
    spinner.succeed(`Compiled: ${sourceFile}`);

    await updateCache(cacheKey, profile.hash, executablePath);
    return executablePath;
  } catch (error: any) {
    spinner.fail(`Failed to compile ${sourceFile}`);
    consola.error('Compiler error:', error.stderr || error.message);
    return null;
  }
}

/**
 * (辅助) 更新缓存文件。这是一个原子操作，以提高代码清晰度。
 * @param cacheKey
 * @param hash
 * @param executablePath
 */
async function updateCache(cacheKey: string, hash: string, executablePath: string): Promise<void> {
  let cache: CacheMetadata = {};
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
  } catch {} // 忽略读取错误，我们将创建一个新的
  
  cache[cacheKey] = { hash, executablePath };
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}
