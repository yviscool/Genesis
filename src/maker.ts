// src/maker.ts

import { consola } from 'consola';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { type GenesisConfig, type Case } from './types';
import { formatData } from './formatter';
import {
  findSystemCompiler,
  DEFAULT_COMPILER_CONFIGS,
  getCompilerHelpMessage
} from './compiler';

// =============================================================================
// --- 常量与默认配置 (Constants & Defaults) ---
// =============================================================================

const DEFAULTS: Required<Omit<GenesisConfig, 'compiler' | 'compilerFlags'>> = {
  solution: 'std.cpp',
  outputDir: 'data',
  startFrom: 1,
};

const SOLUTION_FALLBACKS = ['std.cpp', 'main.cpp', 'solution.cpp'];
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
// --- 核心实现类 (Core Implementation Class) ---
// =============================================================================

class GenesisMaker {
  private config: GenesisConfig & Required<Omit<GenesisConfig, 'compiler' | 'compilerFlags'>>;
  private caseQueue: Case[] = [];

  constructor() {
    this.config = { ...DEFAULTS };
  }

  // ---------------------------------------------------------------------------
  // --- 公共 API (Public API) ---
  // ---------------------------------------------------------------------------

  /**
   * 配置生成器实例。
   * @param userConfig 用户提供的配置对象
   * @returns {this} 返回实例以支持链式调用
   */
  public configure(userConfig: GenesisConfig): this {
    this.config = { ...this.config, ...userConfig };
    return this;
  }

  /**
   * 添加一个测试用例到生成队列。
   * @param labelOrGenerator - 测试用例的标签（可选）或生成器函数
   * @param generator - 测试用例的生成器函数
   * @returns {this} 返回实例以支持链式调用
   */
  public case(label: string, generator: () => any): this;
  public case(generator: () => any): this;
  public case(...args: any[]): this {
    const [labelOrGenerator, generator] = args;
    if (typeof labelOrGenerator === 'function') {
      this.caseQueue.push({ generator: labelOrGenerator });
    } else {
      this.caseQueue.push({ label: labelOrGenerator, generator });
    }
    return this;
  }

  /**
   * 批量添加多个匿名的、相似的测试用例。
   * @param count - 要添加的测试用例数量
   * @param generator - 用于所有测试用例的生成器函数
   * @returns {this} 返回实例以支持链式调用
   */
  public cases(count: number, generator: () => any): this {
    for (let i = 0; i < count; i++) {
      this.caseQueue.push({ generator });
    }
    return this;
  }

  /**
   * 启动整个测试数据生成流程。
   * 这是所有操作的入口点，它协调预处理、编译和并行生成任务。
   */
  public async generate(): Promise<void> {
    consola.start('Genesis starting...');

    if (!await this.prepareEnvironment()) {
      consola.warn('Generation process stopped due to environment preparation failure.');
      return;
    }

    const executablePath = await this.compileSolutionWithCache();
    if (!executablePath) return;

    await this.runGenerationTasks(executablePath);
  }

  // ---------------------------------------------------------------------------
  // --- 核心流程协调器 (Core Flow Orchestrators) ---
  // ---------------------------------------------------------------------------

  /**
   * 准备生成环境，包括清理输出目录和过时缓存。
   * @returns {Promise<boolean>} 如果环境准备就绪则返回 true，否则返回 false。
   */
  private async prepareEnvironment(): Promise<boolean> {
    // 清理整个输出目录，这是一个关键步骤，因此我们首先执行
    const cleanupOk = await this.cleanupOutputDirectory();
    if (!cleanupOk) return false;

    // 清理缓存目录中未被引用的旧编译产物
    await this.cleanupStaleCache();
    
    // 确保输出目录存在
    await fs.mkdir(this.config.outputDir, { recursive: true });

    return true;
  }

  /**
   * 执行所有测试用例的并行生成任务。
   * @param executablePath - 解决方案编译后的可执行文件路径。
   */
  private async runGenerationTasks(executablePath: string): Promise<void> {
    const totalCases = this.caseQueue.length;
    if (totalCases === 0) {
      consola.info('No cases to generate.');
      return;
    }

    // 使用系统 CPU 核心数作为并行上限，避免资源过度消耗
    const concurrencyLimit = os.cpus().length;
    let completedCases = 0;
    const results: { name: string; success: boolean; error?: string }[] = [];
    const spinner = ora(`Generating cases (0/${totalCases})`).start();

    // 创建一个任务池，每个任务都是一个返回 Promise 的函数
    const taskPool = this.caseQueue.map((caseItem, i) =>
      () => this.generateSingleCase(caseItem, this.config.startFrom + i, executablePath)
    );

    // 分批并行执行任务
    for (let i = 0; i < totalCases; i += concurrencyLimit) {
      const batchPromises = taskPool.slice(i, i + concurrencyLimit).map(task => task());
      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        results.push(result);
        completedCases++;
        spinner.text = `Generating cases (${completedCases}/${totalCases})`;
      }
    }

    spinner.succeed('All cases processed.');
    this.reportResults(results);
  }

  /**
   * 汇总并报告生成结果。
   * @param results - 所有测试用例的生成结果数组。
   */
  private reportResults(results: { name: string; success: boolean; error?: string }[]): void {
    const totalCases = results.length;
    let successCount = 0;

    for (const result of results) {
      if (result.success) {
        consola.success(`Generated case ${result.name}`);
        successCount++;
      } else {
        consola.error(`Failed to generate case ${result.name}`);
        consola.error('  └─ Error details:', result.error);
      }
    }

    if (successCount === totalCases) {
      consola.success(`✨ Generation complete! All ${totalCases} cases created successfully in '${this.config.outputDir}/'.`);
    } else {
      consola.warn(`Generation finished with ${totalCases - successCount} errors. ${successCount}/${totalCases} cases were successful.`);
    }
  }

  // ---------------------------------------------------------------------------
  // --- 编译子系统 (Compilation Subsystem) ---
  // ---------------------------------------------------------------------------

  /**
   * (协调器) 智能编译模块：处理缓存、并在需要时重新编译。
   * 这是编译逻辑的主入口，它将复杂流程委托给多个职责单一的辅助方法。
   * @returns {Promise<string | null>} 编译成功返回可执行文件路径，失败则返回 null。
   */
  private async compileSolutionWithCache(): Promise<string | null> {
    const sourceFile = await this.findSolutionFile();
    if (!sourceFile) {
      consola.error(`Solution file not found. Tried: ${this.config.solution || SOLUTION_FALLBACKS.join(', ')}`);
      return null;
    }

    const compilerCommand = await this.resolveCompiler();
    if (!compilerCommand) {
      consola.error(getCompilerHelpMessage());
      return null;
    }
    consola.info(`Using compiler: ${compilerCommand}`);

    const profile = await this.getCompilationProfile(sourceFile, compilerCommand);
    const cacheKey = `${sourceFile}-${compilerCommand}`;

    const cachedExecutable = await this.findCachedExecutable(cacheKey, profile.hash);
    if (cachedExecutable) {
      consola.info(`Hash match. Using cached executable.`);
      return cachedExecutable;
    }

    return this.executeCompilation(sourceFile, compilerCommand, profile, cacheKey);
  }

  /**
   * (辅助) 确定要使用的编译器命令。
   * @returns {Promise<string | null>} 返回找到的编译器命令，否则返回 null。
   */
  private async resolveCompiler(): Promise<string | null> {
    return this.config.compiler || await findSystemCompiler();
  }

  /**
   * (辅助) 计算当前编译配置的唯一特征信息（哈希和编译标志）。
   * @param sourceFile - 解决方案的源文件路径。
   * @param compilerCommand - 使用的编译器命令。
   * @returns {Promise<{ hash: string, flags: string[] }>} 包含哈希和最终编译标志的对象。
   */
  private async getCompilationProfile(sourceFile: string, compilerCommand: string): Promise<{ hash: string, flags: string[] }> {
    const baseConfig = DEFAULT_COMPILER_CONFIGS[compilerCommand as keyof typeof DEFAULT_COMPILER_CONFIGS]
      || DEFAULT_COMPILER_CONFIGS['g++'];
    const finalFlags = [...baseConfig.flags, ...(this.config.compilerFlags || [])];

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
  private async findCachedExecutable(cacheKey: string, currentHash: string): Promise<string | null> {
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
  private async executeCompilation(
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
      spinner.succeed(`Compiled solution: ${sourceFile}`);

      await this.updateCache(cacheKey, profile.hash, executablePath);
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
  private async updateCache(cacheKey: string, hash: string, executablePath: string): Promise<void> {
    let cache: CacheMetadata = {};
    try {
      cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
    } catch {} // 忽略读取错误，我们将创建一个新的
    
    cache[cacheKey] = { hash, executablePath };
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  }


  // ---------------------------------------------------------------------------
  // --- 文件系统与辅助工具 (Filesystem & Utilities) ---
  // ---------------------------------------------------------------------------

  /**
   * 生成单个测试用例的原子操作。包括生成输入、执行标程、保存输出。
   * @param caseItem - 包含生成器和标签的用例对象。
   * @param caseNumber - 当前用例的编号。
   * @param executablePath - 解决方案的可执行文件路径。
   * @returns {Promise<{ name: string; success: boolean; error?: string }>} 操作结果。
   */
  private async generateSingleCase(caseItem: Case, caseNumber: number, executablePath: string): Promise<{ name: string; success: boolean; error?: string }> {
    const caseName = caseItem.label ? `(#${caseNumber}: ${caseItem.label})` : `(#${caseNumber})`;
    try {
      const rawInput = caseItem.generator();
      const formattedInput = formatData(rawInput);

      const inFile = path.join(this.config.outputDir, `${caseNumber}.in`);
      await fs.writeFile(inFile, formattedInput);

      // 使用输入字符串执行，比重读文件性能更好
      const { stdout } = await execa(executablePath, { input: formattedInput });

      const outFile = path.join(this.config.outputDir, `${caseNumber}.out`);
      await fs.writeFile(outFile, stdout);

      return { name: caseName, success: true };
    } catch (error: any) {
      // 提供更具体的错误信息
      const errorMessage = error.stderr || error.message || 'An unknown error occurred.';
      return { name: caseName, success: false, error: errorMessage };
    }
  }

  /**
   * 按顺序自动查找解决方案源文件。
   * @returns {Promise<string | null>} 找到的文件路径或 null。
   */
  private async findSolutionFile(): Promise<string | null> {
    const filesToTry = this.config.solution === DEFAULTS.solution
      ? SOLUTION_FALLBACKS
      : [this.config.solution];

    for (const file of filesToTry) {
      try {
        await fs.access(file);
        return file;
      } catch { }
    }
    return null;
  }

  /**
   * 清理整个输出目录，并执行严格的安全检查以防止误删。
   * @returns {Promise<boolean>} 清理成功返回 true，因安全检查或错误失败则返回 false。
   */
  private async cleanupOutputDirectory(): Promise<boolean> {
    const dir = this.config.outputDir;

    // --- 安全检查 ---
    const FORBIDDEN_NAMES = ['src', 'node_modules', '.git', '.', '..', '/'];
    if (FORBIDDEN_NAMES.includes(path.basename(dir))) {
      consola.error(`Safety check failed: Deleting '${dir}' is forbidden. Please choose a different output directory.`);
      return false;
    }

    const absoluteOutputDir = path.resolve(dir);
    const projectRoot = process.cwd();

    if (absoluteOutputDir === projectRoot) {
      consola.error(`Safety check failed: outputDir ('${dir}') resolves to the project root. Aborting.`);
      return false;
    }

    if (!absoluteOutputDir.startsWith(projectRoot)) {
      consola.error(`Safety check failed: outputDir ('${dir}') is outside the project directory. Aborting.`);
      return false;
    }

    // --- 执行删除 ---
    consola.info(`Cleaning output directory: '${dir}'`);
    try {
      await fs.rm(dir, { recursive: true, force: true });
      consola.success(`Cleaned output directory: '${dir}'`);
      return true;
    } catch (error: any) {
      consola.error(`Failed to remove directory '${dir}':`, error);
      return false;
    }
  }

  /**
   * 自动清理 .genesis 目录中过时的（未被缓存记录引用的）可执行文件。
   */
  private async cleanupStaleCache(): Promise<void> {
    try {
      const cache: CacheMetadata = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
      const validExecutables = new Set(Object.values(cache).map(entry => entry.executablePath));
      const allFilesInCacheDir = await fs.readdir(TEMP_DIR);

      const cleanupPromises = allFilesInCacheDir
        .filter(fileName => fileName !== 'cache.json')
        .map(fileName => {
          const fullPath = path.join(TEMP_DIR, fileName);
          if (!validExecutables.has(fullPath)) {
            consola.debug(`Cleaning up stale cache file: ${fileName}`);
            return fs.unlink(fullPath);
          }
          return Promise.resolve();
        });
      
      await Promise.all(cleanupPromises);
    } catch (error: any) {
      if (error.code !== 'ENOENT') { // 如果不是 "文件不存在" 错误，则提示
        consola.debug('Cache cleanup skipped due to an error:', error.message);
      }
    }
  }
}

// =============================================================================
// --- 统一入口代理 (Unified Entrypoint Proxy) ---
// =============================================================================

const handler: ProxyHandler<any> = {
  /**
   * Proxy 的 `get` 陷阱，实现了“隐式工厂”模式。
   *
   * 1. 当访问 `Maker` 的任何属性时 (如 `Maker.configure`)，此函数被触发。
   * 2. 它会 **立即创建一个全新的 `GenesisMaker` 实例**。
   * 3. 然后，它获取该实例上的同名方法 (如 `instance.configure`) 并返回它。
   * 4. 关键点：由于 `configure` 等方法返回 `this` (即新创建的 `instance`)，
   *    后续的链式调用 (如 `.case(...)`) 都是在该 `instance` 上进行的，
   *    **不会** 再次触发 Proxy 的 `get` 陷阱。
   *
   * 这种模式使得 API 调用干净利落 (Maker.case(...))，同时保证了每次调用链
   * 都是从一个干净、隔离的实例开始的。
   */
  get(target, prop) {
    const instance = new GenesisMaker();
    const method = (instance as any)[prop];

    if (typeof method === 'function') {
      return method.bind(instance);
    }
    // 对于非函数属性的罕见情况，也进行处理
    return Reflect.get(instance, prop);
  },
};

// 1. 直接导出 GenesisMaker 类本身
export { GenesisMaker };

// 2. (可选) 提供一个清晰的工厂函数，作为语法糖
export function createMaker(): GenesisMaker {
    return new GenesisMaker();
}

// 3. (推荐) 使用 Proxy 提供一个更灵活的统一入口
export const Maker = new Proxy({}, handler) as unknown as GenesisMaker;