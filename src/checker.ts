// src/checker.ts
import { consola } from 'consola';
import ora from 'ora';
import { execa, type ExecaError } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type CheckerConfig, type CompareMode } from './types';
import { getExecutable } from './compilation';
import { compareOutputs } from './differ';
import { formatData } from './formatter';

// =============================================================================
// --- 常量与默认配置 (Constants & Defaults) ---
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
// --- 核心实现类 (Core Implementation Class) ---
// =============================================================================

export class GenesisChecker {
  private config: CheckerConfig & { compareMode: CompareMode };
  private generator: (() => any) | null = null;
  private timeoutMs: number = 5000; // 默认超时时间 5s

  constructor() {
    // @ts-expect-error - The `std` and `target` are required and will be set by `configure`.
    this.config = { ...DEFAULTS };
  }

  // ---------------------------------------------------------------------------
  // --- 公共 API (Public API) ---
  // ---------------------------------------------------------------------------

  /**
   * 配置对拍器实例。
   * @param userConfig 用户提供的配置对象
   * @returns {this} 返回实例以支持链式调用
   */
  public configure(userConfig: CheckerConfig): this {
    if (!userConfig.std || !userConfig.target) {
      consola.error('Checker configuration must include `std` and `target` properties.');
      throw new Error('Missing std or target in checker configuration.');
    }
    this.config = { ...this.config, ...userConfig };
    return this;
  }

  /**
   * 设置用于生成测试数据的生成器函数。
   * @param generator - 生成器函数
   * @returns {this} 返回实例以支持链式调用
   */
  public gen(generator: () => any): this {
    this.generator = generator;
    return this;
  }

  /**
   * 设置待测程序运行的超时时间。
   * @param ms - 超时时间（毫秒）
   * @returns {this} 返回实例以支持链式调用
   */
  public timeout(ms: number): this {
    if (ms > 0) {
      this.timeoutMs = ms;
    }
    return this;
  }

  /**
   * 启动对拍流程。
   * @param count - 要运行的测试点数量
   */
  public async run(count: number = 100): Promise<void> {
    consola.start('Genesis Checker starting...');

    if (!this.generator) {
      consola.error('No generator function provided. Use .gen() to set one.');
      return;
    }

    const { std, target, ...compilerConfig } = this.config;

    // --- 编译 --- 
    const stdPath = await getExecutable(std, compilerConfig);
    if (!stdPath) {
      consola.error(`Failed to compile the standard solution: ${std}`);
      return;
    }

    const targetPath = await getExecutable(target, compilerConfig);
    if (!targetPath) {
      consola.error(`Failed to compile the target solution: ${target}`);
      return;
    }

    // --- 对拍循环 ---
    const spinner = ora(`Running tests (0/${count})`).start();
    for (let i = 1; i <= count; i++) {
      spinner.text = `Running tests (${i}/${count})`;

      const rawInput = this.generator();
      const formattedInput = formatData(rawInput);

      let stdOutput: string;
      try {
        const { stdout } = await execa(stdPath, { input: formattedInput });
        stdOutput = stdout;
      } catch (error) {
        spinner.fail(`Test #${i}: Standard solution crashed!`);
        await this.reportFailure(i, 'RE_STD', formattedInput, (error as ExecaError).stderr || '', '');
        return;
      }

      try {
        const { stdout: myOutput } = await execa(targetPath, {
          input: formattedInput,
          timeout: this.timeoutMs,
        });

        const passed = compareOutputs(stdOutput, myOutput, this.config.compareMode);

        if (!passed) {
          spinner.fail(`Test #${i}: Wrong Answer!`);
          await this.reportFailure(i, 'WA', formattedInput, stdOutput, myOutput);
          return;
        }

      } catch (error) {
        const execaError = error as ExecaError;
        if (execaError.timedOut) {
          spinner.fail(`Test #${i}: Time Limit Exceeded!`);
          await this.reportFailure(i, 'TLE', formattedInput, stdOutput, '[Time Limit Exceeded]');
        } else {
          spinner.fail(`Test #${i}: Runtime Error!`);
          await this.reportFailure(i, 'RE', formattedInput, stdOutput, execaError.stderr || '[No stderr]');
        }
        return;
      }
    }

    spinner.succeed(`✨ All ${count} tests passed!`);
  }

  // ---------------------------------------------------------------------------
  // --- 辅助方法 (Helper Methods) ---
  // ---------------------------------------------------------------------------

  /**
   * 报告失败并保存现场文件。
   * @param testNumber - 失败的测试点编号
   * @param type - 失败类型 (WA, RE, TLE, RE_STD)
   * @param input - 导致失败的输入
   * @param stdOut - 标准输出
   * @param myOut - 待测程序输出或错误信息
   */
  private async reportFailure(testNumber: number, type: string, input: string, stdOut: string, myOut: string): Promise<void> {
    let typeMessage = '';
    switch (type) {
      case 'WA':
        typeMessage = 'Wrong Answer';
        break;
      case 'RE':
        typeMessage = 'Runtime Error';
        break;
      case 'TLE':
        typeMessage = 'Time Limit Exceeded';
        break;
      case 'RE_STD':
        typeMessage = 'Standard Solution Runtime Error';
        break;
      default:
        typeMessage = 'Unknown Error';
    }

    const errorMessage = `\n` +
      `[error] [FAILED at test ${testNumber}] ${type} (${typeMessage})\n` +
      `------------------------------------\n` +
      `❌ Test #${testNumber}: ${type}\n\n` +
      `[Input]\n${input}\n\n` +
      `[Std Output]\n${stdOut}\n\n` +
      `[My Output]\n${myOut}\n\n`;

    consola.error(errorMessage);

    try {
      await fs.writeFile(FAIL_ARTIFACTS.in, input);
      await fs.writeFile(FAIL_ARTIFACTS.std, stdOut);
      await fs.writeFile(FAIL_ARTIFACTS.my, myOut);
      consola.info(`💾 现场文件已保存:\n  - ${FAIL_ARTIFACTS.in}\n  - ${FAIL_ARTIFACTS.std}\n  - ${FAIL_ARTIFACTS.my}`);
      if (type === 'WA') {
        consola.info(`Hint: You can use \'diff -bB ${FAIL_ARTIFACTS.std} ${FAIL_ARTIFACTS.my}\' to see the difference.`);
      }
    } catch (error) {
      consola.error('Failed to save failure artifacts:', error);
    }
    consola.error(`------------------------------------`);
  }
}