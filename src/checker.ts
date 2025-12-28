// src/checker.ts
import { consola } from 'consola';
import ora from 'ora';
import { execa, type ExecaError } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type CheckerConfig, type CompareMode } from './types';
import { prepareForExecution } from './execution';
import { compareOutputs } from './differ';
import { formatData } from './formatter';
import { t } from './i18n';

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

// =============================================================================
// --- 核心实现类 ---
// =============================================================================

export class GenesisChecker {
  private config: CheckerConfig & { compareMode: CompareMode };
  private generator: (() => any) | null = null;
  private timeoutMs: number = 5000; // 默认超时时间: 5s

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

    // --- 对拍循环 ---
    const spinner = ora(t('checker.runningTests', 0, count)).start();
    for (let i = 1; i <= count; i++) {
      spinner.text = t('checker.runningTests', i, count);

      const rawInput = this.generator();
      const formattedInput = formatData(rawInput);

      let stdOutput: string;
      try {
        const { stdout } = await execa(stdCommand, stdArgs, { input: formattedInput });
        stdOutput = stdout;
      } catch (error) {
        spinner.fail(t('checker.stdCrashed', i));
        await this.reportFailure(i, 'RE_STD', formattedInput, String((error as ExecaError).stderr || ''), '');
        return;
      }

      try {
        const { stdout: myOutput } = await execa(targetCommand, targetArgs, {
          input: formattedInput,
          timeout: this.timeoutMs,
        });

        const passed = compareOutputs(stdOutput, myOutput, this.config.compareMode);

        if (!passed) {
          spinner.fail(t('checker.wrongAnswer', i));
          await this.reportFailure(i, 'WA', formattedInput, stdOutput, myOutput);
          return;
        }

      } catch (error) {
        const execaError = error as ExecaError;
        if (execaError.timedOut) {
          spinner.fail(t('checker.timeLimitExceeded', i));
          await this.reportFailure(i, 'TLE', formattedInput, stdOutput, '[Time Limit Exceeded]');
        } else {
          spinner.fail(t('checker.runtimeError', i));
          await this.reportFailure(i, 'RE', formattedInput, stdOutput, String(execaError.stderr || '[No stderr]'));
        }
        return;
      }
    }

    spinner.succeed(t('checker.allPassed', count));
  }

  // ---------------------------------------------------------------------------
  // --- 辅助方法 ---
  // ---------------------------------------------------------------------------

  /**
   * 报告错误并保存相关文件 (Artifacts)。
   * @param testNumber 失败的测试用例编号。
   * @param type 错误类型 (WA, RE, TLE, RE_STD)。
   * @param input 导致失败的输入数据。
   * @param stdOut 标程的输出。
   * @param myOut 目标程序的输出或错误信息。
   */
  private async reportFailure(testNumber: number, type: string, input: string, stdOut: string, myOut: string): Promise<void> {
    let typeMessage = '';
    switch (type) {
      case 'WA':
        typeMessage = t('checker.wa');
        break;
      case 'RE':
        typeMessage = t('checker.re');
        break;
      case 'TLE':
        typeMessage = t('checker.tle');
        break;
      case 'RE_STD':
        typeMessage = t('checker.re_std');
        break;
      default:
        typeMessage = t('checker.unknownError');
    }

    const errorMessage = `\n` +
      `[error] [${t('checker.failedAtTest', testNumber)}] ${type} (${typeMessage})\n` +
      `------------------------------------\n` +
      `${t('checker.testCase', testNumber, type)}\n\n` +
      `[${t('checker.input')}]\n${input}\n\n` +
      `[${t('checker.stdOutput')}]\n${stdOut}\n\n` +
      `[${t('checker.myOutput')}]\n${myOut}\n\n`;

    consola.error(errorMessage);

    try {
      await fs.writeFile(FAIL_ARTIFACTS.in, input);
      await fs.writeFile(FAIL_ARTIFACTS.std, stdOut);
      await fs.writeFile(FAIL_ARTIFACTS.my, myOut);
      consola.info(t('checker.artifactsSaved', FAIL_ARTIFACTS.in, FAIL_ARTIFACTS.std, FAIL_ARTIFACTS.my));
      if (type === 'WA') {
        consola.info(t('checker.diffHint', FAIL_ARTIFACTS.std, FAIL_ARTIFACTS.my));
      }
    } catch (error) {
      // @ts-expect-error
      consola.error(t('checker.saveArtifactsFailed', error));
    }
    consola.error(`------------------------------------`);
  }
}
