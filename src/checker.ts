// src/checker.ts
import { consola } from 'consola';
import ora from 'ora';
import pc from 'picocolors';
import { execa, type ExecaError } from 'execa';
import fs from 'node:fs/promises';
import { type CheckerConfig, type CompareMode } from './types';
import { prepareForExecution } from './execution';
import { compareOutputs } from './differ';
import { formatData } from './formatter';
import { t } from './i18n';
import { highlightDiff } from './diff-highlight';
import { formatRuntimeError, getSignalFromExitCode } from './error-formatter';

const FAIL_ARTIFACTS = {
  in: '_checker_fail.in',
  std: '_checker_std.out',
  my: '_checker_my.out',
};

interface FailureRecord {
  testNumber: number;
  type: 'WA' | 'RE' | 'TLE' | 'RE_STD';
  input: string;
  stdOut: string;
  myOut: string;
  signal?: string;
  exitCode?: number;
}

interface TestTiming {
  testNumber: number;
  durationMs: number;
}

interface TestExecutionResult {
  failure?: FailureRecord;
  timing?: TestTiming;
}

type InternalCheckerConfig = Partial<Pick<CheckerConfig, 'std' | 'target'>> &
  Omit<CheckerConfig, 'std' | 'target'> &
  { compareMode: CompareMode };

export class GenesisChecker {
  private config: InternalCheckerConfig;
  private generator: (() => any) | null = null;
  private timeoutMs = 5000;
  private continueMode = false;

  constructor() {
    this.config = { compareMode: 'normalized' };
  }

  public configure(userConfig: CheckerConfig): this {
    if (!userConfig.std || !userConfig.target) {
      consola.error(t('checker.missingStdOrTarget'));
      throw new Error('Missing std or target in checker configuration.');
    }
    this.config = { ...this.config, ...userConfig };
    return this;
  }

  public gen(generator: () => any): this {
    this.generator = generator;
    return this;
  }

  public timeout(ms: number): this {
    if (ms > 0) {
      this.timeoutMs = ms;
    }
    return this;
  }

  public continue(enabled: boolean = true): this {
    this.continueMode = enabled;
    return this;
  }

  public async run(count: number = 100): Promise<void> {
    consola.start(t('checker.starting'));

    if (!this.generator) {
      consola.error(t('checker.noGenerator'));
      return;
    }

    const { std, target } = this.config;
    if (!std || !target) {
      consola.error(t('checker.missingStdOrTarget'));
      return;
    }

    if (count <= 0) {
      consola.info(pc.dim('No tests requested.'));
      return;
    }

    const compilerConfig = {
      compiler: this.config.compiler,
      compilerFlags: this.config.compilerFlags,
    };

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

    const startTime = Date.now();
    const failures: FailureRecord[] = [];
    const testTimings: TestTiming[] = [];
    let passCount = 0;
    let completedCount = 0;
    let nextTestNumber = 1;
    let stopRequested = false;

    const spinner = ora(this.formatProgress(0, count, 0, startTime)).start();
    const workerCount = this.resolveWorkerCount(count);

    const workerLoop = async () => {
      while (true) {
        if (stopRequested) {
          return;
        }

        const testNumber = nextTestNumber++;
        if (testNumber > count) {
          return;
        }

        const result = await this.executeSingleTest(
          testNumber,
          stdCommand,
          stdArgs,
          targetCommand,
          targetArgs,
        );

        completedCount++;

        if (result.timing) {
          testTimings.push(result.timing);
        }

        if (result.failure) {
          failures.push(result.failure);
          if (!this.continueMode) {
            stopRequested = true;
          }
        } else {
          passCount++;
        }

        spinner.text = this.formatProgress(completedCount, count, passCount, startTime, failures.length);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => workerLoop()));

    if (!this.continueMode && failures.length > 0) {
      const firstFailure = this.pickFirstFailure(failures);
      spinner.fail(this.getFailureSpinnerMessage(firstFailure));
      await this.reportFailure(firstFailure);
      return;
    }

    const elapsed = Date.now() - startTime;

    if (failures.length === 0) {
      spinner.succeed(pc.green(t('checker.allPassedWithTime', count, this.formatTime(elapsed))));
    } else {
      const orderedFailures = [...failures].sort((a, b) => a.testNumber - b.testNumber);
      spinner.fail(
        pc.red(t('checker.foundErrors', orderedFailures.length)) +
          pc.dim(` ${t('checker.passedCount', passCount, count)}`),
      );

      consola.log('');
      for (const failure of orderedFailures.slice(0, 5)) {
        await this.reportFailure(failure, true);
      }

      if (orderedFailures.length > 5) {
        consola.info(pc.dim(t('checker.moreErrors', orderedFailures.length - 5)));
      }

      await this.saveArtifacts(orderedFailures[0]);
    }

    this.reportPerformanceStats(testTimings);
  }

  private resolveWorkerCount(totalTests: number): number {
    const configuredWorkers = this.config.workers ?? 1;
    if (!Number.isFinite(configuredWorkers) || configuredWorkers <= 0) {
      return 1;
    }
    return Math.max(1, Math.min(totalTests, Math.floor(configuredWorkers)));
  }

  private pickFirstFailure(failures: FailureRecord[]): FailureRecord {
    return failures.reduce((best, current) =>
      current.testNumber < best.testNumber ? current : best,
    );
  }

  private getFailureSpinnerMessage(failure: FailureRecord): string {
    if (failure.type === 'WA') return t('checker.wrongAnswer', failure.testNumber);
    if (failure.type === 'TLE') return t('checker.timeLimitExceeded', failure.testNumber);
    if (failure.type === 'RE_STD') return t('checker.stdCrashed', failure.testNumber);
    return t('checker.runtimeError', failure.testNumber);
  }

  private async executeSingleTest(
    testNumber: number,
    stdCommand: string,
    stdArgs: string[],
    targetCommand: string,
    targetArgs: string[],
  ): Promise<TestExecutionResult> {
    const rawInput = this.generator!();
    const formattedInput = formatData(rawInput);

    let stdOutput: string;
    try {
      const { stdout } = await execa(stdCommand, stdArgs, { input: formattedInput });
      stdOutput = stdout;
    } catch (error) {
      const execaError = error as ExecaError;
      return {
        failure: {
          testNumber,
          type: 'RE_STD',
          input: formattedInput,
          stdOut: String(execaError.stderr || execaError.message || ''),
          myOut: '',
          exitCode: typeof execaError.exitCode === 'number' ? execaError.exitCode : undefined,
          signal: execaError.signal || undefined,
        },
      };
    }

    const testStartTime = Date.now();
    try {
      const { stdout: myOutput } = await execa(targetCommand, targetArgs, {
        input: formattedInput,
        timeout: this.timeoutMs,
      });

      const durationMs = Date.now() - testStartTime;
      const passed = compareOutputs(stdOutput, myOutput, this.config.compareMode);
      if (passed) {
        return {
          timing: { testNumber, durationMs },
        };
      }

      return {
        timing: { testNumber, durationMs },
        failure: {
          testNumber,
          type: 'WA',
          input: formattedInput,
          stdOut: stdOutput,
          myOut: myOutput,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - testStartTime;
      const execaError = error as ExecaError;
      const exitCode = typeof execaError.exitCode === 'number' ? execaError.exitCode : undefined;
      const signal =
        execaError.signal ||
        (exitCode !== undefined ? getSignalFromExitCode(exitCode) || undefined : undefined);
      const stderrText = String(execaError.stderr || '').trim();
      const enrichedStderr = stderrText
        ? signal && !stderrText.includes(signal)
          ? `${stderrText}\n[signal: ${signal}]`
          : stderrText
        : signal
          ? `[signal: ${signal}]`
          : '[No stderr]';

      return {
        timing: { testNumber, durationMs },
        failure: {
          testNumber,
          type: execaError.timedOut ? 'TLE' : 'RE',
          input: formattedInput,
          stdOut: stdOutput,
          myOut: execaError.timedOut ? '[Time Limit Exceeded]' : enrichedStderr,
          signal,
          exitCode,
        },
      };
    }
  }

  private formatProgress(
    current: number,
    total: number,
    passed: number,
    startTime: number,
    failures: number = 0,
  ): string {
    const elapsed = Date.now() - startTime;
    const speed = current > 0 ? ((current / elapsed) * 1000).toFixed(1) : '0';
    const eta = current > 0 ? this.formatTime((elapsed / current) * (total - current)) : '--';

    let status =
      failures > 0
        ? t('checker.progressWithFails', current, total, passed, failures)
        : t('checker.progress', current, total, passed);
    if (failures > 0) {
      status += ` ${pc.red(`✗${failures}`)}`;
    }
    status += pc.dim(` | ${speed} tests/s | ETA: ${eta}`);

    return status;
  }

  private formatTime(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
  }

  private async reportFailure(failure: FailureRecord, compact: boolean = false): Promise<void> {
    const typeMessages: Record<FailureRecord['type'], string> = {
      WA: t('checker.wa'),
      RE: t('checker.re'),
      TLE: t('checker.tle'),
      RE_STD: t('checker.re_std'),
    };

    const typeMessage = typeMessages[failure.type] ?? t('checker.unknownError');
    const typeColor = failure.type === 'WA' ? pc.red : failure.type === 'TLE' ? pc.yellow : pc.magenta;

    consola.log('');
    consola.log(typeColor(t('checker.failureAt', failure.type, typeMessage, failure.testNumber)));

    consola.log(pc.dim(t('checker.inputLabel')));
    consola.log(this.truncateOutput(failure.input, 10));

    if (failure.type === 'WA') {
      consola.log('');
      consola.log(highlightDiff(failure.stdOut, failure.myOut));
    } else if (failure.type === 'RE') {
      consola.log('');
      consola.log(pc.dim(t('checker.errorOutputLabel')));
      const diagnosis = formatRuntimeError(failure.myOut, failure.exitCode);
      consola.log(diagnosis || failure.myOut);
    } else {
      consola.log('');
      consola.log(pc.dim(t('checker.expectedOutputLabel')));
      consola.log(this.truncateOutput(failure.stdOut, 5));
    }

    if (!compact) {
      await this.saveArtifacts(failure);
    }
  }

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
    } catch {
      consola.error(t('checker.saveArtifactsFailed2'));
    }
  }

  private truncateOutput(text: string, maxLines: number): string {
    const lines = text.split('\n');
    if (lines.length <= maxLines) {
      return pc.dim('   ') + lines.join('\n   ');
    }
    const shown = lines.slice(0, maxLines);
    return pc.dim('   ') + shown.join('\n   ') + pc.dim(`\n   ${t('checker.truncated', lines.length - maxLines)}`);
  }

  private reportPerformanceStats(testTimings: TestTiming[]): void {
    if (testTimings.length === 0) return;

    const sortedTimings = [...testTimings].sort((a, b) => b.durationMs - a.durationMs);
    const topSlowest = sortedTimings.slice(0, 5);

    const avgDuration =
      testTimings.reduce((sum, timing) => sum + timing.durationMs, 0) / testTimings.length;
    const maxDuration = sortedTimings[0]?.durationMs || 0;
    const timeoutThreshold = this.timeoutMs * 0.8;

    console.log('\n' + '-'.repeat(50));
    console.log('Performance Statistics\n');

    console.log(`  ${t('checker.slowestTests')}:`);
    for (const timing of topSlowest) {
      const percentage = ((timing.durationMs / this.timeoutMs) * 100).toFixed(0);
      let status = '';
      if (timing.durationMs >= this.timeoutMs) {
        status = pc.red(' [TLE]');
      } else if (timing.durationMs >= timeoutThreshold) {
        status = pc.yellow(` [${t('checker.nearTimeout')}]`);
      }
      console.log(
        `    #${timing.testNumber.toString().padStart(3)}: ${this.formatTime(timing.durationMs).padStart(7)} (${percentage}%)${status}`,
      );
    }

    console.log('');
    console.log(`  ${t('checker.avgTime')}: ${this.formatTime(avgDuration)}`);
    console.log(`  ${t('checker.maxTime')}: ${this.formatTime(maxDuration)} (#${sortedTimings[0]?.testNumber || '-'})`);

    const nearTimeoutCount = testTimings.filter(
      timing => timing.durationMs >= timeoutThreshold && timing.durationMs < this.timeoutMs,
    ).length;
    if (nearTimeoutCount > 0) {
      console.log(pc.yellow(`  ${t('checker.nearTimeoutCount', nearTimeoutCount)}`));
    }

    console.log('');
  }
}
