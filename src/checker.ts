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
import { t } from './i18n';

// =============================================================================
// --- Constants & Defaults ---
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
// --- Core Implementation Class ---
// =============================================================================

export class GenesisChecker {
  private config: CheckerConfig & { compareMode: CompareMode };
  private generator: (() => any) | null = null;
  private timeoutMs: number = 5000; // Default timeout: 5s

  constructor() {
    // @ts-expect-error - The `std` and `target` are required and will be set by `configure`.
    this.config = { ...DEFAULTS };
  }

  // ---------------------------------------------------------------------------
  // --- Public API ---
  // ---------------------------------------------------------------------------

  /**
   * Configures the checker instance.
   * @param userConfig The user-provided configuration object.
   * @returns {this} The instance for chaining.
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
   * Sets the generator function for producing test data.
   * @param generator The generator function.
   * @returns {this} The instance for chaining.
   */
  public gen(generator: () => any): this {
    this.generator = generator;
    return this;
  }

  /**
   * Sets the timeout for the target program's execution.
   * @param ms Timeout in milliseconds.
   * @returns {this} The instance for chaining.
   */
  public timeout(ms: number): this {
    if (ms > 0) {
      this.timeoutMs = ms;
    }
    return this;
  }

  /**
   * Starts the checking process.
   * @param count The number of test cases to run.
   */
  public async run(count: number = 100): Promise<void> {
    consola.start(t('checker.starting'));

    if (!this.generator) {
      consola.error(t('checker.noGenerator'));
      return;
    }

    const { std, target, ...compilerConfig } = this.config;

    // --- Compilation ---
    const stdPath = await getExecutable(std, compilerConfig);
    if (!stdPath) {
      consola.error(t('checker.compileStdFailed', std));
      return;
    }

    const targetPath = await getExecutable(target, compilerConfig);
    if (!targetPath) {
      consola.error(t('checker.compileTargetFailed', target));
      return;
    }

    // --- Checking Loop ---
    const spinner = ora(t('checker.runningTests', 0, count)).start();
    for (let i = 1; i <= count; i++) {
      spinner.text = t('checker.runningTests', i, count);

      const rawInput = this.generator();
      const formattedInput = formatData(rawInput);

      let stdOutput: string;
      try {
        const { stdout } = await execa(stdPath, { input: formattedInput });
        stdOutput = stdout;
      } catch (error) {
        spinner.fail(t('checker.stdCrashed', i));
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
          await this.reportFailure(i, 'RE', formattedInput, stdOutput, execaError.stderr || '[No stderr]');
        }
        return;
      }
    }

    spinner.succeed(t('checker.allPassed', count));
  }

  // ---------------------------------------------------------------------------
  // --- Helper Methods ---
  // ---------------------------------------------------------------------------

  /**
   * Reports a failure and saves the artifacts.
   * @param testNumber The number of the failed test case.
   * @param type The type of failure (WA, RE, TLE, RE_STD).
   * @param input The input that caused the failure.
   * @param stdOut The standard output.
   * @param myOut The output or error from the target program.
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
      consola.error(t('checker.saveArtifactsFailed', error));
    }
    consola.error(`------------------------------------`);
  }
}