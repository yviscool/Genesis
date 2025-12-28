// src/checker.ts
import { consola } from 'consola';
import ora from 'ora';
import pc from 'picocolors';
import { execa, type ExecaError } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type CheckerConfig, type CompareMode } from './types';
import { prepareForExecution } from './execution';
import { compareOutputs } from './differ';
import { formatData } from './formatter';
import { t } from './i18n';
import { highlightDiff } from './diff-highlight';
import { formatRuntimeError, getSignalFromExitCode } from './error-formatter';

// =============================================================================
// --- 常量 & 默认值 ---
// =============================================================================

const DEFAULTS: Required<Omit<CheckerConfig, 'std' | 'target' | 'compiler' | 'compilerFlags'>> = {
  compareMode: 'normalized',
};

const FAIL_ARTIFACTS = {
  in: '_checker_fail.in',
  std: '_checker_std.out',
  my: '_checker_my.out',
};

// 失败记录类型
interface FailureRecord {
  testNumber: number;
  type: 'WA' | 'RE' | 'TLE' | 'RE_STD';
  input: string;
  stdOut: string;
  myOut: string;
}

// =============================================================================
// --- 核心实现类 ---
// =============================================================================

export class GenesisChecker {
  private config: CheckerConfig & { compareMode: CompareMode };
  private generator: (() => any) | null = null;
  private timeoutMs: number = 5000; // 默认超时时间: 5s
  private continueMode: boolean = false; // 继续模式：收集所有失败

  constructor() {
    // @ts-expect-error - std 和 target 是必需的，将在 configure 中设置
    this.config = { ...DEFAULTS };
  }

  // ---------------------------------------------------------------------------
  // --- 公共 API ---
  // ---------------------------------------------------------------------------

  /**
   * 配置 Checker 实例。
   * @param userConfig 用户提供的配置对象。
   * @returns {this} 返回实例自身以支持链式调用。
   */
  public configure(userConfig: CheckerConfig): this {
    if (!userConfig.std || !userConfig.target) {
      consola.error(t('checker.missingStdOrTarget'));
      throw new Error('Missing std or target in checker configuration.');
    }
    this.config = { ...this.config, ...userConfig };
    return this;
  }

  /**
   * 设置用于生成测试数据的生成器函数。
   * @param generator 生成器函数。
   * @returns {this} 返回实例自身以支持链式调用。
   */
  public gen(generator: () => any): this {
    this.generator = generator;
    return this;
  }

  /**
   * 设置目标程序的执行超时时间。
   * @param ms 超时时间（毫秒）。
   * @returns {this} 返回实例自身以支持链式调用。
   */
  public timeout(ms: number): this {
    if (ms > 0) {
      this.timeoutMs = ms;
    }
    return this;
  }

  /**
   * 启用继续模式：即使遇到错误也继续运行，收集所有失败点。
   * @param enabled 是否启用。
   * @returns {this} 返回实例自身以支持链式调用。
   */
  public continue(enabled: boolean = true): this {
    this.continueMode = enabled;
    return this;
  }

  /**
   * 启动对拍流程。
   * @param count 要运行的测试用例数量。
   */
  public async run(count: number = 100): Promise<void> {
    consola.start(t('checker.starting'));

    if (!this.generator) {
      consola.error(t('checker.noGenerator'));
      return;
    }

    const { std, target, ...compilerConfig } = this.config;

    // --- 准备执行环境 ---
    const stdExec = await prepareForExecution(std, compilerConfig);
    if (!stdExec) {
      consola.error(t('checker.compileStdFailed', std));
      return;
    }

    const targetExec = await prepareForExecution(target, compilerConfig);
    if (!targetExec) {
      consola.error(t('checker.compileTargetFailed', target));
      return;
    }

    const [stdCommand, ...stdArgs] = stdExec.runArgs;
    const [targetCommand, ...targetArgs] = targetExec.runArgs;

    // --- 统计变量 ---
    const startTime = Date.now();
    const failures: FailureRecord[] = [];
    let passCount = 0;

    // --- 对拍循环 ---
    const spinner = ora(this.formatProgress(0, count, 0, startTime)).start();

    for (let i = 1; i <= count; i++) {
      spinner.text = this.formatProgress(i, count, passCount, startTime);

      const rawInput = this.generator();
      const formattedInput = formatData(rawInput);

      let stdOutput: string;
      try {
        const { stdout } = await execa(stdCommand, stdArgs, { input: formattedInput });
        stdOutput = stdout;
      } catch (error) {
        spinner.fail(t('checker.stdCrashed', i));
        const failure: FailureRecord = {
          testNumber: i,
          type: 'RE_STD',
          input: formattedInput,
          stdOut: String((error as ExecaError).stderr || ''),
          myOut: ''
        };

        if (this.continueMode) {
          failures.push(failure);
          continue;
        } else {
          await this.reportFailure(failure);
          return;
        }
      }

      try {
        const { stdout: myOutput } = await execa(targetCommand, targetArgs, {
          input: formattedInput,
          timeout: this.timeoutMs,
        });

        const passed = compareOutputs(stdOutput, myOutput, this.config.compareMode);

        if (!passed) {
          const failure: FailureRecord = {
            testNumber: i,
            type: 'WA',
            input: formattedInput,
            stdOut: stdOutput,
            myOut: myOutput
          };

          if (this.continueMode) {
            failures.push(failure);
            spinner.text = this.formatProgress(i, count, passCount, startTime, failures.length);
          } else {
            spinner.fail(t('checker.wrongAnswer', i));
            await this.reportFailure(failure);
            return;
          }
        } else {
          passCount++;
        }

      } catch (error) {
        const execaError = error as ExecaError;
        const failure: FailureRecord = {
          testNumber: i,
          type: execaError.timedOut ? 'TLE' : 'RE',
          input: formattedInput,
          stdOut: stdOutput,
          myOut: execaError.timedOut ? '[Time Limit Exceeded]' : String(execaError.stderr || '[No stderr]')
        };

        if (this.continueMode) {
          failures.push(failure);
          spinner.text = this.formatProgress(i, count, passCount, startTime, failures.length);
        } else {
          spinner.fail(execaError.timedOut ? t('checker.timeLimitExceeded', i) : t('checker.runtimeError', i));
          await this.reportFailure(failure);
          return;
        }
      }
    }

    // --- 结果报告 ---
    const elapsed = Date.now() - startTime;

    if (failures.length === 0) {
      spinner.succeed(pc.green(t('checker.allPassedWithTime', count, this.formatTime(elapsed))));
    } else {
      spinner.fail(pc.red(t('checker.foundErrors', failures.length)) + pc.dim(` ${t('checker.passedCount', passCount, count)}`));

      // 报告所有失败（继续模式）
      consola.log('');
      for (const failure of failures.slice(0, 5)) { // 最多显示前 5 个
        await this.reportFailure(failure, true);
      }

      if (failures.length > 5) {
        consola.info(pc.dim(t('checker.moreErrors', failures.length - 5)));
      }

      // 保存第一个失败的数据
      await this.saveArtifacts(failures[0]);
    }
  }

  // ---------------------------------------------------------------------------
  // --- 辅助方法 ---
  // ---------------------------------------------------------------------------

  /**
   * 格式化进度显示
   */
  private formatProgress(current: number, total: number, passed: number, startTime: number, failures: number = 0): string {
    const elapsed = Date.now() - startTime;
    const speed = current > 0 ? (current / elapsed * 1000).toFixed(1) : '0';
    const eta = current > 0 ? this.formatTime((elapsed / current) * (total - current)) : '--';

    let status = failures > 0
      ? t('checker.progressWithFails', current, total, passed, failures)
      : t('checker.progress', current, total, passed);
    if (failures > 0) {
      status += ` ${pc.red(`✗${failures}`)}`;
    }
    status += pc.dim(` | ${speed} tests/s | ETA: ${eta}`);

    return status;
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
   * 报告错误
   */
  private async reportFailure(failure: FailureRecord, compact: boolean = false): Promise<void> {
    const TYPE_MESSAGES: Record<string, string> = {
      WA: t('checker.wa'),
      RE: t('checker.re'),
      TLE: t('checker.tle'),
      RE_STD: t('checker.re_std'),
    };
    const typeMessage = TYPE_MESSAGES[failure.type] ?? t('checker.unknownError');
    const typeColor = failure.type === 'WA' ? pc.red : failure.type === 'TLE' ? pc.yellow : pc.magenta;

    consola.log('');
    consola.log(typeColor(t('checker.failureAt', failure.type, typeMessage, failure.testNumber)));

    // 输入数据
    consola.log(pc.dim(t('checker.inputLabel')));
    consola.log(this.truncateOutput(failure.input, 10));

    if (failure.type === 'WA') {
      // WA: 显示彩色 Diff
      consola.log('');
      consola.log(highlightDiff(failure.stdOut, failure.myOut));
    } else if (failure.type === 'RE') {
      // RE: 诊断运行时错误
      consola.log('');
      consola.log(pc.dim(t('checker.errorOutputLabel')));
      const diagnosis = formatRuntimeError(failure.myOut);
      consola.log(diagnosis || failure.myOut);
    } else {
      // TLE / RE_STD
      consola.log('');
      consola.log(pc.dim(t('checker.expectedOutputLabel')));
      consola.log(this.truncateOutput(failure.stdOut, 5));
    }

    if (!compact) {
      await this.saveArtifacts(failure);
    }
  }

  /**
   * 保存失败数据到文件
   */
  private async saveArtifacts(failure: FailureRecord): Promise<void> {
    try {
      await fs.writeFile(FAIL_ARTIFACTS.in, failure.input);
      await fs.writeFile(FAIL_ARTIFACTS.std, failure.stdOut);
      await fs.writeFile(FAIL_ARTIFACTS.my, failure.myOut);

      consola.log('');
      consola.info(pc.dim(t('checker.artifactsSavedCompact')));
      consola.info(pc.dim(`   ${FAIL_ARTIFACTS.in} | ${FAIL_ARTIFACTS.std} | ${FAIL_ARTIFACTS.my}`));

      if (failure.type === 'WA') {
        consola.info(pc.cyan(t('checker.diffHintCompact', FAIL_ARTIFACTS.std, FAIL_ARTIFACTS.my)));
      }
    } catch (error) {
      consola.error(t('checker.saveArtifactsFailed2'));
    }
  }

  /**
   * 截断过长的输出
   */
  private truncateOutput(text: string, maxLines: number): string {
    const lines = text.split('\n');
    if (lines.length <= maxLines) {
      return pc.dim('   ') + lines.join('\n   ');
    }
    const shown = lines.slice(0, maxLines);
    return pc.dim('   ') + shown.join('\n   ') + pc.dim(`\n   ${t('checker.truncated', lines.length - maxLines)}`);
  }
}
