// src/maker.ts

import { consola } from 'consola';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { type GenesisConfig, type Case } from './types';
import { formatData } from './formatter';
import { prepareForExecution, type ExecutionResult } from './execution';
import { t } from './i18n';

// =============================================================================
// --- 常量 & 默认值 ---
// =============================================================================

const DEFAULTS: Required<Omit<GenesisConfig, 'compiler' | 'compilerFlags'>> = {
  solution: 'std.cpp',
  outputDir: 'data',
  startFrom: 1,
};

const SOLUTION_FALLBACKS = [
  'std.cpp', 'main.cpp', 'solution.cpp',
  'std.go', 'main.go',
  'std.rs', 'main.rs',
  'Main.java',
  'std.py', 'main.py',
  'std.js', 'main.js', 'index.js'
];

// =============================================================================
// --- 核心实现类 ---
// =============================================================================

class GenesisMaker {
  private config: GenesisConfig & Required<Omit<GenesisConfig, 'compiler' | 'compilerFlags'>>;
  private caseQueue: Case[] = [];

  constructor() {
    this.config = { ...DEFAULTS };
  }

  // ---------------------------------------------------------------------------
  // --- 公共 API ---
  // ---------------------------------------------------------------------------

  /**
   * 配置生成器实例。
   * @param userConfig 用户提供的配置对象。
   * @returns {this} 返回实例自身以支持链式调用。
   */
  public configure(userConfig: GenesisConfig): this {
    this.config = { ...this.config, ...userConfig };
    return this;
  }

  /**
   * 向生成队列中添加一个测试点。
   * @param labelOrGenerator 测试点的标签（可选）或生成器函数。
   * @param generator 测试点的生成器函数。
   * @returns {this} 返回实例自身以支持链式调用。
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
   * 批量添加多个匿名的、相似的测试点。
   * @param count 要添加的测试点数量。
   * @param generator 用于所有测试点的生成器函数。
   * @returns {this} 返回实例自身以支持链式调用。
   */
  public cases(count: number, generator: () => any): this {
    for (let i = 0; i < count; i++) {
      this.caseQueue.push({ generator });
    }
    return this;
  }

  /**
   * 启动整个测试数据生成流程。
   * 这是所有操作的入口点，负责协调预处理、编译和并行生成任务。
   */
  public async generate(): Promise<void> {
    consola.start(t('maker.starting'));

    if (!await this.prepareEnvironment()) {
      consola.warn(t('maker.envPrepFailed'));
      return;
    }

    const sourceFile = await this.findSolutionFile();
    if (!sourceFile) {
      consola.error(t('maker.solutionNotFound', this.config.solution || SOLUTION_FALLBACKS.join(', ')));
      return;
    }

    const executionResult = await prepareForExecution(sourceFile, this.config);
    if (!executionResult) return;

    await this.runGenerationTasks(executionResult);
  }

  // ---------------------------------------------------------------------------
  // --- 核心流程调度器 ---
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
   * 并行执行所有测试点生成任务。
   * @param executablePath 编译后的标程可执行文件路径。
   */
  private async runGenerationTasks(execResult: ExecutionResult): Promise<void> {
    const totalCases = this.caseQueue.length;
    if (totalCases === 0) {
      consola.info(t('maker.noCases'));
      return;
    }

    const concurrencyLimit = os.cpus().length;
    let completedCases = 0;
    const results: { name: string; success: boolean; error?: string }[] = [];
    const spinner = ora(t('maker.generatingCases', 0, totalCases)).start();

    const taskPool = this.caseQueue.map((caseItem, i) =>
      () => this.generateSingleCase(caseItem, this.config.startFrom + i, execResult.runArgs)
    );

    for (let i = 0; i < totalCases; i += concurrencyLimit) {
      const batchPromises = taskPool.slice(i, i + concurrencyLimit).map(task => task());
      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        results.push(result);
        completedCases++;
        spinner.text = t('maker.generatingCases', completedCases, totalCases);
      }
    }

    spinner.succeed(t('maker.allCasesProcessed'));
    this.reportResults(results);
  }

  /**
   * 汇总并报告生成结果。
   * @param results 所有测试点的生成结果数组。
   */
  private reportResults(results: { name: string; success: boolean; error?: string }[]): void {
    const totalCases = results.length;
    let successCount = 0;

    for (const result of results) {
      if (result.success) {
        consola.success(t('maker.generatedCase', result.name));
        successCount++;
      } else {
        consola.error(t('maker.failedToGenerate', result.name));
        consola.error(t('maker.errorDetails', result.error));
      }
    }

    if (successCount === totalCases) {
      consola.success(t('maker.generationComplete', totalCases, this.config.outputDir));
    } else {
      consola.warn(t('maker.generationFinishedWithErrors', totalCases - successCount, successCount, totalCases));
    }
  }

  // ---------------------------------------------------------------------------
  // --- 文件系统 & 工具函数 ---
  // ---------------------------------------------------------------------------

  /**
   * 原子操作：生成单个测试点，包括生成输入数据、运行标程、保存输出数据。
   * @param caseItem 测试点对象，包含生成器和标签。
   * @param caseNumber 当前测试点编号。
   * @param runArgs 运行标程的命令和参数。
   * @returns {Promise<{ name: string; success: boolean; error?: string }>} 操作结果。
   */
  private async generateSingleCase(caseItem: Case, caseNumber: number, runArgs: string[]): Promise<{ name: string; success: boolean; error?: string }> {
    const caseName = caseItem.label ? `(#${caseNumber}: ${caseItem.label})` : `(#${caseNumber})`;
    try {
      const rawInput = caseItem.generator();
      const formattedInput = formatData(rawInput);

      const inFile = path.join(this.config.outputDir, `${caseNumber}.in`);
      await fs.writeFile(inFile, formattedInput);

      const [command, ...args] = runArgs;
      const { stdout } = await execa(command, args, { input: formattedInput });

      const outFile = path.join(this.config.outputDir, `${caseNumber}.out`);
      await fs.writeFile(outFile, stdout);

      return { name: caseName, success: true };
    } catch (error: any) {
      const errorMessage = error.stderr || error.message || 'An unknown error occurred.';
      return { name: caseName, success: false, error: errorMessage };
    }
  }

  /**
   * 按特定顺序自动查找标程源文件。
   * @returns {Promise<string | null>} 找到的文件路径，未找到则返回 null。
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
   * 清理整个输出目录，包含严格的安全检查以防止误删。
   * @returns {Promise<boolean>} 清理成功返回 true，因安全检查或错误导致失败返回 false。
   */
  private async cleanupOutputDirectory(): Promise<boolean> {
    const dir = this.config.outputDir;

    const FORBIDDEN_NAMES = ['src', 'node_modules', '.git', '.', '..', '/'];
    if (FORBIDDEN_NAMES.includes(path.basename(dir))) {
      consola.error(t('maker.safetyCheckForbidden', dir));
      return false;
    }

    const absoluteOutputDir = path.resolve(dir);
    const projectRoot = process.cwd();

    if (absoluteOutputDir === projectRoot) {
      consola.error(t('maker.safetyCheckRoot', dir));
      return false;
    }

    if (!absoluteOutputDir.startsWith(projectRoot)) {
      consola.error(t('maker.safetyCheckOutside', dir));
      return false;
    }

    consola.info(t('maker.cleaningOutputDir', dir));
    try {
      await fs.rm(dir, { recursive: true, force: true });
      consola.success(t('maker.cleanedOutputDir', dir));
      return true;
    } catch (error: any) {
      consola.error(t('maker.failedToRemoveDir', dir, error));
      return false;
    }
  }
}

// 仅导出类本身，Proxy 逻辑已统一至 index.ts
export { GenesisMaker };
