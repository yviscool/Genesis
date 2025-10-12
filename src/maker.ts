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

    // 在所有操作开始前，执行垃圾回收**
    await this.cleanupStaleCache();
    
    const executablePath = await this.compileSolutionWithCache();
    if (!executablePath) return; // 编译失败或环境不满足，已打印引导信息

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
      } catch {}
    }
    return null;
  }

  /**
   * 智能编译模块：自动探测编译器、处理缓存、并在需要时重新编译。
   */
  private async compileSolutionWithCache(): Promise<string | null> {
    const sourceFile = await this.findSolutionFile();
    if (!sourceFile) {
        consola.error(`Solution file not found. Tried: ${this.config.solution || SOLUTION_FALLBACKS.join(', ')}`);
        return null;
    }
    
    // 1. 确定编译器命令
    let compilerCommand = this.config.compiler || await findSystemCompiler();
    
    // 2. 如果探测后依然没有，给出引导并退出
    if (!compilerCommand) {
      consola.error(getCompilerHelpMessage());
      return null;
    }
    consola.info(`Using compiler: ${compilerCommand}`);
    
    // 3. 确定最终的编译参数
    const baseConfig = DEFAULT_COMPILER_CONFIGS[compilerCommand as keyof typeof DEFAULT_COMPILER_CONFIGS] 
                       || DEFAULT_COMPILER_CONFIGS['g++']; // 对于 g++-12 等变体，使用 g++ 的默认配置
    const finalFlags = [...baseConfig.flags, ...(this.config.compilerFlags || [])];
    
    // 4. 计算当前编译配置的唯一哈希
    await fs.mkdir(TEMP_DIR, { recursive: true });
    const sourceContent = await fs.readFile(sourceFile);
    const uniqueProfile = sourceContent.toString() + compilerCommand + finalFlags.join('');
    const currentHash = crypto.createHash('sha256').update(uniqueProfile).digest('hex');

    // 5. 检查缓存
    let cache: CacheMetadata = {};
    try { cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')); } catch {}

    const cacheKey = `${sourceFile}-${compilerCommand}`;
    if (cache[cacheKey] && cache[cacheKey].hash === currentHash) {
        try {
            await fs.access(cache[cacheKey].executablePath);
            consola.info(`Hash match for compilation profile. Using cached executable.`);
            return cache[cacheKey].executablePath;
        } catch {
            consola.warn('Cached executable not found. Forcing recompilation.');
        }
    }
    
    // 6. 缓存未命中，执行编译
    const spinner = ora(`Compiling ${sourceFile} with ${compilerCommand}...`).start();
    const executableName = path.parse(sourceFile).name;
    let executablePath = path.join(TEMP_DIR, `${executableName}-${currentHash.substring(0, 8)}`);
    if (process.platform === 'win32') {
        executablePath += '.exe';
    }

    try {
      await execa(compilerCommand, [sourceFile, '-o', executablePath, ...finalFlags]);
      spinner.succeed(`Compiled solution: ${sourceFile}`);

      // 7. 更新缓存
      cache[cacheKey] = { hash: currentHash, executablePath };
      await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));

      return executablePath;
    } catch (error: any) {
      spinner.fail(`Failed to compile ${sourceFile}`);
      consola.error('Compiler error:', error.stderr);
      return null;
    }
  }

  /**
   * **新增：** 自动清理 .genesis 目录中过时的可执行文件。
   */
  private async cleanupStaleCache(): Promise<void> {
    try {
      // 1. 读取当前的缓存记录
      const cache: CacheMetadata = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
      
      // 2. 获取所有被缓存记录引用的、有效的可执行文件路径
      const validExecutables = new Set(Object.values(cache).map(entry => entry.executablePath));
      
      // 3. 读取 .genesis 目录下的所有文件
      const allFilesInCacheDir = await fs.readdir(TEMP_DIR);

      // 4. 遍历并删除未被引用的文件
      for (const fileName of allFilesInCacheDir) {
        // 不要删除我们自己的缓存数据库
        if (fileName === 'cache.json') continue;
        
        const fullPath = path.join(TEMP_DIR, fileName);
        if (!validExecutables.has(fullPath)) {
          // 这个文件是孤儿，删除它
          await fs.unlink(fullPath);
          consola.debug(`Cleaned up stale cache file: ${fileName}`);
        }
      }
    } catch (error) {
      // 如果 cache.json 不存在，或者读取目录失败，这不是致命错误。
      // 静默地忽略，保证核心功能不受影响。
      consola.debug('Cache cleanup skipped (e.g., no cache file yet).', error);
    }
  }
}

// 1. 直接导出 GenesisMaker 类本身
export { GenesisMaker };

// 2. (可选) 提供一个清晰的工厂函数，作为语法糖
export function createMaker(): GenesisMaker {
    return new GenesisMaker();
}

// 3. (推荐) 使用 Proxy 提供一个更灵活的统一入口
const handler: ProxyHandler<any> = {
  /**
   * 当访问 maker.case 或 maker.configure 等属性时，这个 get 陷阱会被触发
   */
  get(target, prop, receiver) {
    // 每次访问，我们都创建一个全新的 GenesisMaker 实例
    const instance = new GenesisMaker();

    // 我们检查用户想要的属性 (比如 'case') 是否是这个新实例上的一个函数
    const method = (instance as any)[prop];
    if (typeof method === 'function') {
      // 如果是，我们就返回这个函数，并确保它的 this 指向我们刚创建的实例
      return method.bind(instance);
    }

    // 如果访问的不是一个方法，就按默认行为处理
    return Reflect.get(target, prop, receiver);
  },
};

// --- 统一入口 ---
export const Maker = new Proxy({}, handler) as GenesisMaker;