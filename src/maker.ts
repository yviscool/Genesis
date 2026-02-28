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
  runTimeoutMs: 10000,
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
    const normalizedConfig = { ...userConfig };

    if (
      normalizedConfig.runTimeoutMs !== undefined &&
      (!Number.isFinite(normalizedConfig.runTimeoutMs) || normalizedConfig.runTimeoutMs <= 0)
    ) {
      normalizedConfig.runTimeoutMs = DEFAULTS.runTimeoutMs;
    }

    this.config = { ...this.config, ...normalizedConfig };
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
    let successCount = 0;
    const results: { name: string; success: boolean; error?: string; durationMs?: number; outSize?: number }[] = [];
    const startTime = Date.now();

    const formatProgress = () => {
      const elapsed = Date.now() - startTime;
      const speed = completedCases > 0 ? (completedCases / elapsed * 1000).toFixed(1) : '0';
      const eta = completedCases > 0 ? this.formatTime((elapsed / completedCases) * (totalCases - completedCases)) : '--';
      return t('maker.progress', completedCases, totalCases, speed, eta);
    };

    const spinner = ora(formatProgress()).start();

    const taskPool = this.caseQueue.map((caseItem, i) =>
      () => this.generateSingleCase(caseItem, this.config.startFrom + i, execResult.runArgs)
    );

    for (let i = 0; i < totalCases; i += concurrencyLimit) {
      const batchPromises = taskPool.slice(i, i + concurrencyLimit).map(task => task());
      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        results.push(result);
        completedCases++;
        if (result.success) successCount++;
        spinner.text = formatProgress();
      }
    }

    const elapsed = Date.now() - startTime;
    spinner.succeed(t('maker.complete', successCount, totalCases, this.formatTime(elapsed)));
    await this.reportResults(results);
  }

  /**
   * 格式化时间
   */
  private formatTime(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
  }

  /**
   * 汇总并报告生成结果。
   * @param results 所有测试点的生成结果数组。
   */
  private async reportResults(results: { name: string; success: boolean; error?: string; durationMs?: number; outSize?: number }[]): Promise<void> {
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

    // 输出文件统计信息
    await this.reportFileStats(results);
  }

  /**
   * 格式化文件大小为人类可读格式
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
  }

  /**
   * 报告生成文件的统计信息
   */
  private async reportFileStats(results: { name: string; success: boolean; durationMs?: number; outSize?: number }[]): Promise<void> {
    const successfulCases = results
      .map((r, i) => ({ ...r, caseNumber: this.config.startFrom + i }))
      .filter(r => r.success);

    if (successfulCases.length === 0) return;

    console.log('\n' + '─'.repeat(60));
    console.log('📊 ' + t('maker.fileStats') + '\n');

    let totalInSize = 0;
    let totalOutSize = 0;
    let maxInSize = 0;
    let maxInCase = '';
    let maxDuration = 0;
    let maxDurationCase = '';
    const emptyOutputCases: string[] = [];

    // 表头 (增加 Time 列)
    console.log('  #    │ Input        │ Output       │ Time      │ Case');
    console.log('───────┼──────────────┼──────────────┼───────────┼' + '─'.repeat(20));

    for (const caseItem of successfulCases) {
      const inFile = path.join(this.config.outputDir, `${caseItem.caseNumber}.in`);
      const outFile = path.join(this.config.outputDir, `${caseItem.caseNumber}.out`);

      try {
        const [inStat, outStat] = await Promise.all([
          fs.stat(inFile).catch(() => ({ size: 0 })),
          fs.stat(outFile).catch(() => ({ size: 0 }))
        ]);

        const inSize = inStat.size;
        const outSize = outStat.size;
        const durationMs = caseItem.durationMs ?? 0;

        totalInSize += inSize;
        totalOutSize += outSize;

        if (inSize > maxInSize) {
          maxInSize = inSize;
          maxInCase = caseItem.name;
        }

        if (durationMs > maxDuration) {
          maxDuration = durationMs;
          maxDurationCase = caseItem.name;
        }

        // 检测空输出
        if (outSize === 0) {
          emptyOutputCases.push(caseItem.name);
        }

        const caseNum = String(caseItem.caseNumber).padStart(4, ' ');
        const inSizeStr = this.formatBytes(inSize).padStart(10, ' ');
        const outSizeStr = this.formatBytes(outSize).padStart(10, ' ');
        const timeStr = this.formatTime(durationMs).padStart(7, ' ');
        const caseName = caseItem.name.replace(/^\(#\d+:?\s*/, '').replace(/\)$/, '') || '-';

        console.log(`  ${caseNum} │ ${inSizeStr}   │ ${outSizeStr}   │ ${timeStr}   │ ${caseName}`);
      } catch {
        // 忽略文件读取错误
      }
    }

    // 汇总
    console.log('───────┴──────────────┴──────────────┴───────────┴' + '─'.repeat(20));
    console.log(`\n  📁 ${t('maker.totalFiles')}: ${successfulCases.length * 2} (${successfulCases.length} ${t('maker.pairs')})`);
    console.log(`  📥 ${t('maker.totalInput')}: ${this.formatBytes(totalInSize)}`);
    console.log(`  📤 ${t('maker.totalOutput')}: ${this.formatBytes(totalOutSize)}`);
    console.log(`  📦 ${t('maker.totalSize')}: ${this.formatBytes(totalInSize + totalOutSize)}`);
    if (maxInCase) {
      console.log(`  📈 ${t('maker.maxInput')}: ${maxInCase} (${this.formatBytes(maxInSize)})`);
    }
    if (maxDurationCase) {
      console.log(`  ⏱️  ${t('maker.slowestCase')}: ${maxDurationCase} (${this.formatTime(maxDuration)})`);
    }

    // 空输出警告
    if (emptyOutputCases.length > 0) {
      console.log('');
      for (const caseName of emptyOutputCases) {
        console.log(`  ⚠️  ${t('maker.emptyOutputWarning', caseName)}`);
      }
    }

    console.log('');
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
  private async generateSingleCase(caseItem: Case, caseNumber: number, runArgs: string[]): Promise<{ name: string; success: boolean; error?: string; durationMs?: number; outSize?: number }> {
    const caseName = caseItem.label ? `(#${caseNumber}: ${caseItem.label})` : `(#${caseNumber})`;
    const startTime = Date.now();
    try {
      const rawInput = caseItem.generator();
      const formattedInput = formatData(rawInput);

      const inFile = path.join(this.config.outputDir, `${caseNumber}.in`);
      await fs.writeFile(inFile, formattedInput);

      const [command, ...args] = runArgs;
      const { stdout } = await execa(command, args, {
        input: formattedInput,
        timeout: this.config.runTimeoutMs,
      });

      const outFile = path.join(this.config.outputDir, `${caseNumber}.out`);
      await fs.writeFile(outFile, stdout);

      const durationMs = Date.now() - startTime;
      return { name: caseName, success: true, durationMs, outSize: stdout.length };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error.timedOut
        ? `Execution timed out after ${this.config.runTimeoutMs}ms.`
        : error.stderr || error.message || 'An unknown error occurred.';
      return { name: caseName, success: false, error: errorMessage, durationMs };
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
    const relativePath = path.relative(projectRoot, absoluteOutputDir);

    if (absoluteOutputDir === projectRoot) {
      consola.error(t('maker.safetyCheckRoot', dir));
      return false;
    }

    // Use path.relative to avoid prefix-based false positives such as
    // "/repo/project2" being treated as inside "/repo/project".
    const isOutsideProject = relativePath.startsWith('..') || path.isAbsolute(relativePath);
    if (isOutsideProject) {
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
