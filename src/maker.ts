// src/maker.ts

import { consola } from 'consola';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { type GenesisConfig, type Case } from './types';
import { formatData } from './formatter';
import { getExecutable } from './compilation';

// =============================================================================
// --- 常量与默认配置 (Constants & Defaults) ---
// =============================================================================

const DEFAULTS: Required<Omit<GenesisConfig, 'compiler' | 'compilerFlags'>> = {
  solution: 'std.cpp',
  outputDir: 'data',
  startFrom: 1,
};

const SOLUTION_FALLBACKS = ['std.cpp', 'main.cpp', 'solution.cpp'];

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

    const sourceFile = await this.findSolutionFile();
    if (!sourceFile) {
      consola.error(`Solution file not found. Tried: ${this.config.solution || SOLUTION_FALLBACKS.join(', ')}`);
      return;
    }

    const executablePath = await getExecutable(sourceFile, this.config);
    if (!executablePath) return;

    await this.runGenerationTasks(executablePath);
  }

  // ---------------------------------------------------------------------------
  // --- 核心流程协调器 (Core Flow Orchestrators) ---
  // ---------------------------------------------------------------------------

  /**
   * 准备生成环境，包括清理输出目录。
   * @returns {Promise<boolean>} 如果环境准备就绪则返回 true，否则返回 false。
   */
  private async prepareEnvironment(): Promise<boolean> {
    const cleanupOk = await this.cleanupOutputDirectory();
    if (!cleanupOk) return false;
    
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

    const concurrencyLimit = os.cpus().length;
    let completedCases = 0;
    const results: { name: string; success: boolean; error?: string }[] = [];
    const spinner = ora(`Generating cases (0/${totalCases})`).start();

    const taskPool = this.caseQueue.map((caseItem, i) =>
      () => this.generateSingleCase(caseItem, this.config.startFrom + i, executablePath)
    );

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

      const { stdout } = await execa(executablePath, { input: formattedInput });

      const outFile = path.join(this.config.outputDir, `${caseNumber}.out`);
      await fs.writeFile(outFile, stdout);

      return { name: caseName, success: true };
    } catch (error: any) {
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