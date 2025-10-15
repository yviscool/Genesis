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

// --- 常量定义 ---
const DEFAULTS: Required<Omit<GenesisConfig, 'compiler' | 'compilerFlags'>> = {
  solution: 'std.cpp',
  outputDir: 'data',
  startFrom: 1,
};

const SOLUTION_FALLBACKS = ['std.cpp', 'main.cpp', 'solution.cpp'];
const TEMP_DIR = '.genesis';
const CACHE_FILE = path.join(TEMP_DIR, 'cache.json');

// --- 类型定义 ---
interface CacheMetadata {
  [cacheKey: string]: {
    hash: string;
    executablePath: string;
  };
}

// --- 核心实现 ---
class GenesisMaker {
  private config: GenesisConfig & Required<Omit<GenesisConfig, 'compiler' | 'compilerFlags'>>;
  private caseQueue: Case[] = [];

  constructor() {
    this.config = { ...DEFAULTS };
  }

  /**
   * 配置生成器实例。
   * @param userConfig 用户提供的配置对象
   */
  public configure(userConfig: GenesisConfig): this {
    this.config = { ...this.config, ...userConfig };
    return this;
  }

  /**
   * 添加一个测试用例到生成队列。
   * 支持带标签和匿名两种形式。
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
   */
  public cases(count: number, generator: () => any): this {
    for (let i = 0; i < count; i++) {
      this.caseQueue.push({ generator });
    }
    return this;
  }

  /**
   * 启动整个测试数据生成流程。
   * 采用并行处理以提升性能，并使用优雅的UI进行反馈。
   */
  public async generate(): Promise<void> {
    consola.start('Genesis starting...');

    // 在所有操作开始前清理整个输出目录
    const cleanupOk = await this.cleanupOutputDirectory();
    if (!cleanupOk) {
      consola.warn('Generation process stopped due to cleanup safety checks.');
      return;
    }

    await this.cleanupStaleCache();

    const executablePath = await this.compileSolutionWithCache();
    if (!executablePath) return;

    await fs.mkdir(this.config.outputDir, { recursive: true });

    const concurrencyLimit = os.cpus().length;
    const totalCases = this.caseQueue.length;
    let completedCases = 0;
    const results: { name: string; success: boolean; error?: string }[] = [];

    const spinner = ora(`Generating cases (0/${totalCases})`).start();

    const taskPool = this.caseQueue.map((caseItem, i) =>
      this.generateSingleCase(caseItem, this.config.startFrom + i, executablePath)
    );

    for (let i = 0; i < totalCases; i += concurrencyLimit) {
      const batch = taskPool.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(batch);

      for (const result of batchResults) {
        results.push(result);
        completedCases++;
        spinner.text = `Generating cases (${completedCases}/${totalCases})`;
      }
    }

    spinner.succeed('All cases processed.');

    let successCount = 0;
    for (const result of results) {
      if (result.success) {
        consola.success(`Generated case ${result.name}`);
        successCount++;
      } else {
        consola.error(`Failed to generate case ${result.name}`);
        consola.error('Error details:', result.error);
      }
    }

    if (successCount === totalCases) {
      consola.success(`✨ Generation complete! All ${totalCases} cases created successfully in '${this.config.outputDir}/'.`);
    } else {
      consola.warn(`Generation finished with ${totalCases - successCount} errors. ${successCount}/${totalCases} cases were successful.`);
    }
  }

  /**
   * 生成单个测试用例的原子操作。
   */
  private async generateSingleCase(caseItem: Case, caseNumber: number, executablePath: string): Promise<{ name: string; success: boolean; error?: string }> {
    const caseName = caseItem.label ? `(#${caseNumber}: ${caseItem.label})` : `(#${caseNumber})`;
    try {
      const rawInput = caseItem.generator();
      const formattedInput = formatData(rawInput);

      const inFile = path.join(this.config.outputDir, `${caseNumber}.in`);
      await fs.writeFile(inFile, formattedInput);

      const { stdout } = await execa(executablePath, { input: formattedInput });

      const outFile = path.join(this.config.outputDir, `${caseNumber}.out`);
      await fs.writeFile(outFile, stdout);

      return { name: caseName, success: true };
    } catch (error: any) {
      return { name: caseName, success: false, error: error.stderr || error.message };
    }
  }

  /**
   * 自动按顺序查找解决方案源文件。
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

  // --- 编译流程重构 ---

  /**
   * (协调器) 智能编译模块：处理缓存、并在需要时重新编译。
   * 这是重构后的主方法，它将复杂的编译逻辑委托给多个职责单一的辅助方法。
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
      consola.info(`Hash match for compilation profile. Using cached executable.`);
      return cachedExecutable;
    }

    return this.executeCompilation(sourceFile, compilerCommand, profile, cacheKey);
  }

  /**
   * (辅助) 确定要使用的编译器命令。
   * 优先使用用户在 configure 中指定的编译器，否则自动探测系统中的 g++ 或 clang++。
   * @returns {Promise<string | null>} 返回找到的编译器命令字符串，如果找不到则返回 null。
   */
  private async resolveCompiler(): Promise<string | null> {
    return this.config.compiler || await findSystemCompiler();
  }

  /**
   * (辅助) 计算当前编译配置的唯一特征信息。
   * 这包括最终的编译器标志和基于源文件内容、编译器、编译标志的唯一哈希值。
   * @param {string} sourceFile - C++ 解决方案的源文件路径。
   * @param {string} compilerCommand - 将要使用的编译器命令 (e.g., 'g++')。
   * @returns {Promise<{ hash: string, flags: string[] }>} 返回一个包含哈希和最终编译标志数组的对象。
   */
  private async getCompilationProfile(sourceFile: string, compilerCommand: string): Promise<{ hash: string, flags: string[] }> {
    const baseConfig = DEFAULT_COMPILER_CONFIGS[compilerCommand as keyof typeof DEFAULT_COMPILER_CONFIGS]
      || DEFAULT_COMPILER_CONFIGS['g++']; // 对于 g++-12 等变体，使用 g++ 的默认配置
    const finalFlags = [...baseConfig.flags, ...(this.config.compilerFlags || [])];

    await fs.mkdir(TEMP_DIR, { recursive: true });
    const sourceContent = await fs.readFile(sourceFile);
    const uniqueProfile = sourceContent.toString() + compilerCommand + finalFlags.join('');
    const currentHash = crypto.createHash('sha256').update(uniqueProfile).digest('hex');

    return { hash: currentHash, flags: finalFlags };
  }

  /**
   * (辅助) 检查并返回有效的、依然存在于文件系统中的缓存可执行文件路径。
   * @param {string} cacheKey - 由源文件名和编译器组成的缓存键。
   * @param {string} currentHash - 当前编译配置的哈希值。
   * @returns {Promise<string | null>} 如果找到有效缓存则返回可执行文件路径，否则返回 null。
   */
  private async findCachedExecutable(cacheKey: string, currentHash: string): Promise<string | null> {
    let cache: CacheMetadata = {};
    try { cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')); } catch { }

    const entry = cache[cacheKey];
    if (entry && entry.hash === currentHash) {
      try {
        await fs.access(entry.executablePath); // 确认文件物理上还存在
        return entry.executablePath;
      } catch {
        consola.warn('Cached executable not found. Forcing recompilation.');
      }
    }
    return null;
  }

  /**
   * (辅助) 执行编译命令，并在成功后更新缓存文件。
   * @param {string} sourceFile - C++ 解决方案的源文件路径。
   * @param {string} compilerCommand - 使用的编译器命令。
   * @param {object} profile - 包含哈希和编译标志的编译配置对象。
   * @param {string} profile.hash - 当前配置的哈希值。
   * @param {string[]} profile.flags - 要传递给编译器的参数。
   * @param {string} cacheKey - 用于写入缓存的键。
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
    let executablePath = path.join(TEMP_DIR, `${executableName}-${profile.hash.substring(0, 8)}`);
    if (process.platform === 'win32') {
      executablePath += '.exe';
    }

    try {
      await execa(compilerCommand, [sourceFile, '-o', executablePath, ...profile.flags]);
      spinner.succeed(`Compiled solution: ${sourceFile}`);

      let cache: CacheMetadata = {};
      try { cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')); } catch { }
      cache[cacheKey] = { hash: profile.hash, executablePath };
      await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));

      return executablePath;
    } catch (error: any) {
      spinner.fail(`Failed to compile ${sourceFile}`);
      consola.error('Compiler error:', error.stderr);
      return null;
    }
  }

  /**
   * 清理整个输出目录，并增加安全检查。
   * @returns {Promise<boolean>} 如果清理成功或无需清理则返回 true，如果因安全检查失败则返回 false。
   */
  private async cleanupOutputDirectory(): Promise<boolean> {
    const dir = this.config.outputDir;

    // --- 安全检查 ---
    const FORBIDDEN_NAMES = ['src', 'node_modules', '.git', '.', '..', '/'];
    // 检查目录名称本身是否危险
    if (FORBIDDEN_NAMES.includes(path.basename(dir))) {
        consola.error(`Safety check failed: Deleting '${dir}' is forbidden. Please choose a different output directory.`);
        return false;
    }

    const absoluteOutputDir = path.resolve(dir);
    const projectRoot = process.cwd();

    // 检查是否企图删除项目根目录
    if (absoluteOutputDir === projectRoot) {
        consola.error(`Safety check failed: outputDir ('${dir}') resolves to the project root. Aborting.`);
        return false;
    }

    // 检查目录是否在项目文件夹之外
    if (!absoluteOutputDir.startsWith(projectRoot)) {
        consola.error(`Safety check failed: outputDir ('${dir}') is outside the project directory. Aborting.`);
        return false;
    }

    // --- 执行删除 ---
    consola.info(`Attempting to clean output directory: '${dir}'`);
    try {
        // force: true 表示如果目录不存在也不抛出错误
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

      for (const fileName of allFilesInCacheDir) {
        if (fileName === 'cache.json') continue;

        const fullPath = path.join(TEMP_DIR, fileName);
        if (!validExecutables.has(fullPath)) {
          await fs.unlink(fullPath);
          consola.debug(`Cleaned up stale cache file: ${fileName}`);
        }
      }
    } catch (error) {
      consola.debug('Cache cleanup skipped (e.g., no cache file yet).', error);
    }
  }
}

// --- 统一入口 ---

const handler: ProxyHandler<any> = {
  /**
   * 每次访问 Maker 的一个方法 (如 Maker.case) 时，此 get 陷阱被触发。
   * 这个实现是“隐式工厂”的关键：它创建一个全新的 GenesisMaker 实例，
   * 然后返回该实例上对应的方法。
   *
   * 因为方法本身（例如 configure）返回的是 `this` (即那个新创建的实例)，
   * 所以后续的链式调用 (如 .case().generate()) 会在该实例上继续，
   * 而不会再次触发 Proxy 的 get 陷阱。
   *
   */
  get(target, prop, receiver) {
    const instance = new GenesisMaker();
    const method = (instance as any)[prop];

    if (typeof method === 'function') {
      return method.bind(instance);
    }
    // 允许访问非函数属性，虽然在本设计中不太可能发生
    return Reflect.get(target, prop, receiver);
  },
};

export const Maker = new Proxy({}, handler) as GenesisMaker;