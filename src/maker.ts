import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { consola } from 'consola';
import ora from 'ora';
import { prepareForExecution, type ExecutionResult } from './execution';
import { FormattedDataWriteError, writeFormattedData } from './formatter';
import { t } from './i18n';
import {
  type Case,
  type CaseMetadata,
  type GenesisConfig,
  type MakerValidationContext,
  type MakerValidationReturn,
  type MakerValidator,
} from './types';

const DEFAULTS = {
  solution: 'std.cpp',
  outputDir: 'data',
  startFrom: 1,
  runTimeoutMs: 10000,
};

const AUTO_CONCURRENCY_MEDIUM_INPUT_BYTES = 2 * 1024 * 1024;
const AUTO_CONCURRENCY_LARGE_INPUT_BYTES = 8 * 1024 * 1024;
const MIN_MEMORY_PER_CASE_BYTES = 64 * 1024 * 1024;
const MEMORY_PER_CASE_MULTIPLIER = 6;
const FORCE_KILL_GRACE_MS = 500;

const SOLUTION_FALLBACKS = [
  'std.cpp', 'main.cpp', 'solution.cpp',
  'std.go', 'main.go',
  'std.rs', 'main.rs',
  'Main.java',
  'std.py', 'main.py',
  'std.js', 'main.js', 'index.js',
];

type InternalGenesisConfig = GenesisConfig & typeof DEFAULTS;
type GenerationErrorKind = 'generator' | 'formatter' | 'io' | 'execution' | 'timeout' | 'validation';

type ValidationStatus = 'not_configured' | 'not_run' | 'passed' | 'failed';

interface ValidationSummary {
  status: ValidationStatus;
  durationMs?: number;
  reason?: string;
}

interface CaseGenerationResult {
  caseNumber: number;
  name: string;
  label?: string;
  tags: string[];
  success: boolean;
  error?: string;
  errorKind?: GenerationErrorKind;
  durationMs?: number;
  inSize?: number;
  outSize?: number;
  inPath?: string;
  outPath?: string;
  inHash?: string;
  outHash?: string;
  inLineCount?: number;
  validator: ValidationSummary;
  seed: null;
}

interface ManifestFileRecord {
  path: string;
  sha256: string;
  bytes: number;
  lines?: number;
}

interface ManifestCaseRecord {
  caseId: number;
  caseNumber: number;
  name: string;
  label: string | null;
  tags: string[];
  seed: null;
  status: 'success' | 'failure';
  runtimeMs: number;
  input: ManifestFileRecord | null;
  output: ManifestFileRecord | null;
  validator: ValidationSummary;
  error: {
    kind: GenerationErrorKind;
    message: string;
  } | null;
}

interface MakerManifest {
  version: 1;
  generatedAt: string;
  outputDir: string;
  manifestPath: string;
  solution: string | null;
  summary: {
    totalCases: number;
    succeeded: number;
    failed: number;
    durationMs: number;
  };
  config: {
    outputDir: string;
    startFrom: number;
    runTimeoutMs: number;
    compiler: string | null;
    compilerFlags: string[];
    maxWorkers: number | null;
    caseConcurrency: number | null;
    ojProfile: GenesisConfig['ojProfile'] | null;
    stackSizeBytes: number | null;
    manifestPath: string | null;
    validatorConfigured: boolean;
  };
  cases: ManifestCaseRecord[];
}

interface CommandOutput {
  stdout: string;
  stderr: string;
}

class ProcessExecutionFailure extends Error {
  timedOut: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;

  constructor(
    message: string,
    options: {
      timedOut?: boolean;
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
      stderr?: string;
      stdout?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'ProcessExecutionFailure';
    this.timedOut = options.timedOut ?? false;
    this.exitCode = options.exitCode ?? null;
    this.signal = options.signal ?? null;
    this.stderr = options.stderr ?? '';
    this.stdout = options.stdout ?? '';
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class GenesisMaker {
  private config: InternalGenesisConfig;
  private caseQueue: Case[] = [];
  private validator: MakerValidator | null = null;

  constructor() {
    this.config = { ...DEFAULTS };
  }

  public configure(userConfig: GenesisConfig): this {
    const normalizedConfig = { ...userConfig };

    if (
      normalizedConfig.runTimeoutMs !== undefined
      && (!Number.isFinite(normalizedConfig.runTimeoutMs) || normalizedConfig.runTimeoutMs <= 0)
    ) {
      normalizedConfig.runTimeoutMs = DEFAULTS.runTimeoutMs;
    }

    this.config = { ...this.config, ...normalizedConfig };
    return this;
  }

  public validate(validator: MakerValidator): this {
    this.validator = validator;
    return this;
  }

  public case(metadata: CaseMetadata, generator: () => any): this;
  public case(label: string, generator: () => any): this;
  public case(generator: () => any): this;
  public case(
    metaOrLabelOrGenerator: CaseMetadata | string | (() => any),
    generator?: () => any,
  ): this {
    if (typeof metaOrLabelOrGenerator === 'function') {
      this.caseQueue.push({ generator: metaOrLabelOrGenerator, tags: [] });
      return this;
    }

    if (typeof metaOrLabelOrGenerator === 'string') {
      if (typeof generator !== 'function') {
        throw new Error('Maker.case(label, generator) requires a generator function.');
      }
      this.caseQueue.push({ label: metaOrLabelOrGenerator, generator, tags: [] });
      return this;
    }

    const metadata = metaOrLabelOrGenerator as CaseMetadata;
    if (typeof generator !== 'function') {
      throw new Error('Maker.case(metadata, generator) requires a generator function.');
    }
    this.caseQueue.push({
      label: metadata?.label,
      tags: this.normalizeTags(metadata?.tags),
      generator,
    });
    return this;
  }

  public cases(count: number, metadata: CaseMetadata, generator: () => any): this;
  public cases(
    count: number,
    metadataOrGenerator: CaseMetadata | (() => any),
    generator?: () => any,
  ): this {
    const metadata = typeof metadataOrGenerator === 'function' ? undefined : metadataOrGenerator;
    const finalGenerator = typeof metadataOrGenerator === 'function' ? metadataOrGenerator : generator;
    if (typeof finalGenerator !== 'function') {
      throw new Error('Maker.cases(count, generator) requires a generator function.');
    }
    for (let index = 0; index < count; index++) {
      this.caseQueue.push({
        label: metadata?.label,
        tags: this.normalizeTags(metadata?.tags),
        generator: finalGenerator,
      });
    }
    return this;
  }

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
    if (!executionResult) {
      return;
    }

    await this.runGenerationTasks(executionResult, sourceFile);
  }

  private async prepareEnvironment(): Promise<boolean> {
    const cleanupOk = await this.cleanupOutputDirectory();
    if (!cleanupOk) {
      return false;
    }

    await fs.mkdir(this.config.outputDir, { recursive: true });
    return true;
  }

  private async runGenerationTasks(execResult: ExecutionResult, sourceFile: string): Promise<void> {
    const totalCases = this.caseQueue.length;
    if (totalCases === 0) {
      consola.info(t('maker.noCases'));
      return;
    }

    const results = new Array<CaseGenerationResult>(totalCases);
    const baseConcurrency = this.resolveBaseConcurrency(totalCases);
    let observedLargestInputBytes = 0;
    let completedCases = 0;
    let successCount = 0;
    let nextCaseIndex = 0;
    const startTime = Date.now();
    const activeTasks = new Set<Promise<void>>();

    const formatProgress = () => {
      const elapsed = Date.now() - startTime;
      const speed = completedCases > 0 ? ((completedCases / elapsed) * 1000).toFixed(1) : '0';
      const eta = completedCases > 0
        ? this.formatTime((elapsed / completedCases) * (totalCases - completedCases))
        : '--';
      return t('maker.progress', completedCases, totalCases, speed, eta);
    };

    const spinner = ora(formatProgress()).start();

    const launchCase = (index: number) => {
      const caseItem = this.caseQueue[index]!;
      let task: Promise<void>;
      task = this.generateSingleCase(caseItem, this.config.startFrom + index, execResult.runArgs)
        .then(result => {
          results[index] = result;
          completedCases++;
          if (result.success) {
            successCount++;
          }
          observedLargestInputBytes = Math.max(observedLargestInputBytes, result.inSize ?? 0);
          spinner.text = formatProgress();
        })
        .finally(() => {
          activeTasks.delete(task);
        });

      activeTasks.add(task);
    };

    while (nextCaseIndex < totalCases || activeTasks.size > 0) {
      const targetConcurrency = this.resolveAdaptiveConcurrency(baseConcurrency, observedLargestInputBytes);

      while (nextCaseIndex < totalCases && activeTasks.size < targetConcurrency) {
        launchCase(nextCaseIndex);
        nextCaseIndex++;
      }

      if (activeTasks.size > 0) {
        await Promise.race(activeTasks);
      }
    }

    const elapsed = Date.now() - startTime;
    spinner.succeed(t('maker.complete', successCount, totalCases, this.formatTime(elapsed)));
    await this.reportResults(results, elapsed, sourceFile);
  }

  private resolveBaseConcurrency(totalCases: number): number {
    const preferred = this.config.caseConcurrency ?? this.config.maxWorkers ?? os.cpus().length;
    if (!Number.isFinite(preferred) || preferred <= 0) {
      return 1;
    }

    return Math.max(1, Math.min(totalCases, Math.floor(preferred)));
  }

  private resolveAdaptiveConcurrency(baseConcurrency: number, observedLargestInputBytes: number): number {
    let limit = baseConcurrency;

    if (observedLargestInputBytes >= AUTO_CONCURRENCY_LARGE_INPUT_BYTES) {
      limit = Math.min(limit, 2);
    } else if (observedLargestInputBytes >= AUTO_CONCURRENCY_MEDIUM_INPUT_BYTES) {
      limit = Math.min(limit, 4);
    }

    if (observedLargestInputBytes > 0) {
      const estimatedMemoryPerCase = Math.max(
        MIN_MEMORY_PER_CASE_BYTES,
        observedLargestInputBytes * MEMORY_PER_CASE_MULTIPLIER,
      );
      const memoryLimited = Math.max(1, Math.floor(os.freemem() / estimatedMemoryPerCase));
      limit = Math.min(limit, memoryLimited);
    }

    return Math.max(1, limit);
  }

  private formatTime(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
  }

  private async reportResults(results: CaseGenerationResult[], durationMs: number, sourceFile: string): Promise<void> {
    let successCount = 0;

    for (const result of results) {
      if (result.success) {
        consola.success(t('maker.generatedCase', result.name));
        successCount++;
      } else {
        consola.error(t('maker.failedToGenerate', result.name));
        const prefix = result.errorKind ? `[${result.errorKind}] ` : '';
        consola.error(t('maker.errorDetails', `${prefix}${result.error}`));
      }
    }

    if (successCount === results.length) {
      consola.success(t('maker.generationComplete', results.length, this.config.outputDir));
    } else {
      consola.warn(t('maker.generationFinishedWithErrors', results.length - successCount, successCount, results.length));
    }

    await this.reportFileStats(results);
    const manifestPath = await this.writeManifest(results, durationMs, sourceFile);
    if (manifestPath) {
      console.log(`Manifest: ${this.toRelativePath(manifestPath)}`);
      console.log(`GENESIS_MANIFEST=${manifestPath}`);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const index = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, index);
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[index]}`;
  }

  private async reportFileStats(results: CaseGenerationResult[]): Promise<void> {
    const successfulCases = results
      .map((result, index) => ({ ...result, caseNumber: this.config.startFrom + index }))
      .filter(result => result.success);

    if (successfulCases.length === 0) {
      return;
    }

    console.log('\n' + '─'.repeat(60));
    console.log('📊 ' + t('maker.fileStats') + '\n');

    let totalInSize = 0;
    let totalOutSize = 0;
    let maxInSize = 0;
    let maxInCase = '';
    let maxDuration = 0;
    let maxDurationCase = '';
    const emptyOutputCases: string[] = [];

    console.log('  #    │ Input        │ Output       │ Time      │ Case');
    console.log('───────┼──────────────┼──────────────┼───────────┼' + '─'.repeat(20));

    for (const caseItem of successfulCases) {
      try {
        const inSize = caseItem.inSize ?? await this.readFileSize(path.join(this.config.outputDir, `${caseItem.caseNumber}.in`));
        const outSize = caseItem.outSize ?? await this.readFileSize(path.join(this.config.outputDir, `${caseItem.caseNumber}.out`));
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
        // Ignore missing stats for failed artifacts.
      }
    }

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

    if (emptyOutputCases.length > 0) {
      console.log('');
      for (const caseName of emptyOutputCases) {
        console.log(`  ⚠️  ${t('maker.emptyOutputWarning', caseName)}`);
      }
    }

    console.log('');
  }

  private async readFileSize(filePath: string): Promise<number> {
    try {
      const stat = await fs.stat(filePath);
      return stat.size;
    } catch {
      return 0;
    }
  }

  private async generateSingleCase(
    caseItem: Case,
    caseNumber: number,
    runArgs: string[],
  ): Promise<CaseGenerationResult> {
    const caseName = caseItem.label ? `(#${caseNumber}: ${caseItem.label})` : `(#${caseNumber})`;
    const startTime = Date.now();
    const inFile = path.join(this.config.outputDir, `${caseNumber}.in`);
    const outFile = path.join(this.config.outputDir, `${caseNumber}.out`);
    const tags = this.normalizeTags(caseItem.tags);
    const validator = this.validator
      ? { status: 'not_run' as const }
      : { status: 'not_configured' as const };

    let rawInput: any;
    try {
      rawInput = caseItem.generator();
    } catch (error) {
      return this.buildFailure(
        {
          caseNumber,
          name: caseName,
          label: caseItem.label,
          tags,
          validator,
        },
        startTime,
        'generator',
        this.getErrorMessage(error),
      );
    }

    let inputStats;
    try {
      inputStats = await writeFormattedData(inFile, rawInput);
    } catch (error) {
      if (error instanceof FormattedDataWriteError) {
        return this.buildFailure(
          {
            caseNumber,
            name: caseName,
            label: caseItem.label,
            tags,
            validator,
          },
          startTime,
          error.kind,
          error.message,
        );
      }
      return this.buildFailure(
        {
          caseNumber,
          name: caseName,
          label: caseItem.label,
          tags,
          validator,
        },
        startTime,
        'io',
        this.getErrorMessage(error),
      );
    }

    const validatorResult = await this.runValidator(rawInput, {
      caseNumber,
      label: caseItem.label,
      tags,
      inputPath: inFile,
      outputDir: this.config.outputDir,
    });
    if (validatorResult.status === 'failed') {
      return this.buildFailure(
        {
          caseNumber,
          name: caseName,
          label: caseItem.label,
          tags,
          validator: validatorResult,
          inPath: inFile,
          inSize: inputStats.bytesWritten,
          inHash: inputStats.sha256,
          inLineCount: inputStats.lineCount,
        },
        startTime,
        'validation',
        validatorResult.reason || 'Validation failed.',
      );
    }

    try {
      const [command, ...args] = runArgs;
      const { stdout } = await this.executeCommandFromFile(command, args, inFile, this.config.runTimeoutMs);

      await fs.writeFile(outFile, stdout);
      return {
        caseNumber,
        name: caseName,
        label: caseItem.label,
        tags,
        success: true,
        durationMs: Date.now() - startTime,
        inPath: inFile,
        inSize: inputStats.bytesWritten,
        inHash: inputStats.sha256,
        inLineCount: inputStats.lineCount,
        outPath: outFile,
        outSize: Buffer.byteLength(stdout),
        outHash: this.hashText(stdout),
        validator: validatorResult,
        seed: null,
      };
    } catch (error) {
      if (error instanceof ProcessExecutionFailure) {
        const kind: GenerationErrorKind = error.timedOut ? 'timeout' : 'execution';
        const message = error.timedOut
          ? `Execution timed out after ${this.config.runTimeoutMs}ms.`
          : error.stderr || error.message;
        return this.buildFailure(
          {
            caseNumber,
            name: caseName,
            label: caseItem.label,
            tags,
            validator: validatorResult,
            inPath: inFile,
            inSize: inputStats.bytesWritten,
            inHash: inputStats.sha256,
            inLineCount: inputStats.lineCount,
          },
          startTime,
          kind,
          message,
        );
      }

      return this.buildFailure(
        {
          caseNumber,
          name: caseName,
          label: caseItem.label,
          tags,
          validator: validatorResult,
          inPath: inFile,
          inSize: inputStats.bytesWritten,
          inHash: inputStats.sha256,
          inLineCount: inputStats.lineCount,
        },
        startTime,
        'io',
        this.getErrorMessage(error),
      );
    }
  }

  private buildFailure(
    details: {
      caseNumber: number;
      name: string;
      label?: string;
      tags: string[];
      validator: ValidationSummary;
      inPath?: string;
      inSize?: number;
      inHash?: string;
      inLineCount?: number;
    },
    startTime: number,
    errorKind: GenerationErrorKind,
    error: string,
  ): CaseGenerationResult {
    return {
      caseNumber: details.caseNumber,
      name: details.name,
      label: details.label,
      tags: details.tags,
      success: false,
      error,
      errorKind,
      durationMs: Date.now() - startTime,
      inPath: details.inPath,
      inSize: details.inSize,
      inHash: details.inHash,
      inLineCount: details.inLineCount,
      validator: details.validator,
      seed: null,
    };
  }

  private async runValidator(data: any, context: MakerValidationContext): Promise<ValidationSummary> {
    if (!this.validator) {
      return { status: 'not_configured' };
    }

    const startedAt = Date.now();
    try {
      const result = await this.validator(data, context);
      return this.normalizeValidatorResult(result, Date.now() - startedAt);
    } catch (error) {
      return {
        status: 'failed',
        durationMs: Date.now() - startedAt,
        reason: this.getErrorMessage(error),
      };
    }
  }

  private normalizeValidatorResult(result: MakerValidationReturn, durationMs: number): ValidationSummary {
    if (result === undefined || result === true) {
      return { status: 'passed', durationMs };
    }

    if (result === false) {
      return {
        status: 'failed',
        durationMs,
        reason: 'Validation returned false.',
      };
    }

    if (typeof result === 'string') {
      return {
        status: 'failed',
        durationMs,
        reason: result,
      };
    }

    if (typeof result === 'object' && result !== null) {
      return {
        status: result.ok ? 'passed' : 'failed',
        durationMs,
        reason: result.reason,
      };
    }

    return {
      status: 'failed',
      durationMs,
      reason: `Unsupported validation result type: ${typeof result}.`,
    };
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }

    return Array.from(
      new Set(
        tags
          .map(tag => String(tag).trim())
          .filter(Boolean),
      ),
    );
  }

  private hashText(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private async writeManifest(
    results: CaseGenerationResult[],
    durationMs: number,
    sourceFile: string,
  ): Promise<string | null> {
    const manifestPath = this.resolveManifestPath();
    if (!manifestPath) {
      return null;
    }

    const manifest = this.buildManifest(results, durationMs, sourceFile, manifestPath);
    try {
      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      return manifestPath;
    } catch (error) {
      consola.warn(`Failed to write manifest '${manifestPath}': ${this.getErrorMessage(error)}`);
      return null;
    }
  }

  private buildManifest(
    results: CaseGenerationResult[],
    durationMs: number,
    sourceFile: string,
    manifestPath: string,
  ): MakerManifest {
    const succeeded = results.filter(result => result.success).length;

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      outputDir: this.toRelativePath(path.resolve(this.config.outputDir)),
      manifestPath: this.toRelativePath(manifestPath),
      solution: sourceFile,
      summary: {
        totalCases: results.length,
        succeeded,
        failed: results.length - succeeded,
        durationMs,
      },
      config: {
        outputDir: this.config.outputDir,
        startFrom: this.config.startFrom,
        runTimeoutMs: this.config.runTimeoutMs,
        compiler: this.config.compiler ?? null,
        compilerFlags: this.config.compilerFlags ?? [],
        maxWorkers: this.config.maxWorkers ?? null,
        caseConcurrency: this.config.caseConcurrency ?? null,
        ojProfile: this.config.ojProfile ?? null,
        stackSizeBytes: this.config.stackSizeBytes ?? null,
        manifestPath: this.config.manifestPath === false
          ? null
          : this.toRelativePath(this.config.manifestPath ?? this.getDefaultManifestPath()),
        validatorConfigured: this.validator !== null,
      },
      cases: results.map(result => this.toManifestCaseRecord(result)),
    };
  }

  private toManifestCaseRecord(result: CaseGenerationResult): ManifestCaseRecord {
    return {
      caseId: result.caseNumber,
      caseNumber: result.caseNumber,
      name: result.name,
      label: result.label ?? null,
      tags: result.tags,
      seed: result.seed,
      status: result.success ? 'success' : 'failure',
      runtimeMs: result.durationMs ?? 0,
      input: result.inPath && result.inHash && result.inSize !== undefined
        ? {
          path: this.toRelativePath(result.inPath),
          sha256: result.inHash,
          bytes: result.inSize,
          lines: result.inLineCount,
        }
        : null,
      output: result.outPath && result.outHash && result.outSize !== undefined
        ? {
          path: this.toRelativePath(result.outPath),
          sha256: result.outHash,
          bytes: result.outSize,
        }
        : null,
      validator: result.validator,
      error: !result.success && result.error && result.errorKind
        ? {
          kind: result.errorKind,
          message: result.error,
        }
        : null,
    };
  }

  private resolveManifestPath(): string | null {
    if (this.config.manifestPath === false) {
      return null;
    }

    const manifestPath = this.config.manifestPath ?? this.getDefaultManifestPath();
    return path.resolve(manifestPath);
  }

  private getDefaultManifestPath(): string {
    const outputDir = path.resolve(this.config.outputDir);
    const parentDir = path.dirname(outputDir);
    const outputName = path.basename(outputDir) || 'data';
    return path.join(parentDir, `${outputName}.manifest.json`);
  }

  private toRelativePath(targetPath: string): string {
    const relative = path.relative(process.cwd(), path.resolve(targetPath));
    return (relative || '.').split(path.sep).join('/');
  }

  private executeCommandFromFile(
    command: string,
    args: string[],
    inputFile: string,
    timeoutMs: number,
  ): Promise<CommandOutput> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const input = createReadStream(inputFile);
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      let killTimer: NodeJS.Timeout | undefined;
      let forceKillTimer: NodeJS.Timeout | undefined;

      const finishReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const finishResolve = (result: CommandOutput) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const cleanup = () => {
        if (killTimer) clearTimeout(killTimer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        input.destroy();
      };

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', chunk => {
        stdout += chunk;
      });

      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', chunk => {
        stderr += chunk;
      });

      child.stdin?.on('error', () => {
        // Ignore EPIPE if the child exits early.
      });

      child.on('error', error => {
        finishReject(new ProcessExecutionFailure(this.getErrorMessage(error), { cause: error, stderr, stdout }));
      });

      input.on('error', error => {
        child.kill();
        finishReject(error);
      });

      child.on('close', (exitCode, signal) => {
        if (timedOut) {
          finishReject(new ProcessExecutionFailure(
            `Execution timed out after ${timeoutMs}ms.`,
            { timedOut: true, exitCode, signal, stderr, stdout },
          ));
          return;
        }

        if (exitCode === 0) {
          finishResolve({ stdout, stderr });
          return;
        }

        const detail = stderr.trim() || `Command failed with exit code ${exitCode ?? 'null'}.`;
        finishReject(new ProcessExecutionFailure(detail, { exitCode, signal, stderr, stdout }));
      });

      input.pipe(child.stdin!);

      if (timeoutMs > 0) {
        killTimer = setTimeout(() => {
          timedOut = true;
          child.kill();
          forceKillTimer = setTimeout(() => {
            child.kill('SIGKILL');
          }, FORCE_KILL_GRACE_MS);
        }, timeoutMs);
      }
    });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return String(error);
  }

  private async findSolutionFile(): Promise<string | null> {
    const filesToTry = this.config.solution === DEFAULTS.solution
      ? SOLUTION_FALLBACKS
      : [this.config.solution];

    for (const file of filesToTry) {
      try {
        await fs.access(file);
        return file;
      } catch {
        // Try the next candidate.
      }
    }

    return null;
  }

  private async cleanupOutputDirectory(): Promise<boolean> {
    const dir = this.config.outputDir;
    const forbiddenNames = ['src', 'node_modules', '.git', '.', '..', '/'];
    if (forbiddenNames.includes(path.basename(dir))) {
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
