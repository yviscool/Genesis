import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execa } from 'execa';
import { version } from '../package.json';
import { prepareForExecution, type ExecutionResult } from './execution';
import { createGenerator } from './generator/factory';
import { normalizeFormat, renderFormatDocument } from './format';
import { isDataset, type Dataset, type DatasetConfig, type DatasetGeneratedCase, type DatasetValidationContext, type DatasetValidationReturn } from './dataset';

export interface DatasetRunOptions {
  mode: 'generate' | 'validate';
  datasetFile?: string | null;
  replay?: DatasetReplayInfo | null;
  outputDir?: string;
  manifestPath?: string | false;
  cleanOutputDir?: boolean;
}

export interface DatasetReplaySelector {
  caseNumber?: number;
  caseName?: string;
  repeatIndex?: number;
  outputDir?: string;
  manifestPath?: string | false;
}

export interface DatasetReplayInfo {
  caseNumber: number;
  caseName: string;
  repeatIndex: number;
  outputDir: string;
}

export type DatasetCaseStatus = 'success' | 'failure';
export type DatasetErrorPhase = 'config' | 'materialize' | 'format' | 'validate' | 'write-input' | 'execution' | 'write-output' | 'manifest';

export interface DatasetErrorRecord {
  phase: DatasetErrorPhase;
  kind: 'generator' | 'formatter' | 'validation' | 'io' | 'execution' | 'timeout' | 'config';
  message: string;
}

export interface DatasetFileRecord {
  path: string;
  sha256: string;
  bytes: number;
  lines?: number;
}

export interface DatasetValidationSummary {
  status: 'not-run' | 'passed' | 'failed';
  durationMs: number;
  reason?: string;
}

export interface DatasetCaseRecord {
  caseId: number;
  caseNumber: number;
  name: string;
  repeatIndex: number;
  tags: string[];
  seed: string;
  status: DatasetCaseStatus;
  durationMs: number;
  phases: {
    materializeMs: number;
    formatMs: number;
    validateMs: number;
    writeInputMs: number;
    executionMs: number;
    writeOutputMs: number;
  };
  validation: DatasetValidationSummary;
  input: DatasetFileRecord | null;
  output: DatasetFileRecord | null;
  error: DatasetErrorRecord | null;
}

export interface DatasetManifest {
  version: 2;
  tool: {
    name: 'genesis-kit';
    version: string;
  };
  generatedAt: string;
  dataset: {
    modulePath: string | null;
    solution: string;
    outputDir: string;
    seed: string;
    startFrom: number;
    runTimeoutMs: number;
    caseConcurrency: number | null;
    compiler: string | null;
    compilerFlags: string[];
    ojProfile: string | null;
    stackSizeBytes: number | null;
    manifestPath: string | null;
  };
  execution: {
    runArgs: string[];
    executablePath: string;
    fingerprint: string;
  } | null;
  replay: DatasetReplayInfo | null;
  summary: {
    totalCases: number;
    succeeded: number;
    failed: number;
    durationMs: number;
  };
  cases: DatasetCaseRecord[];
}

export interface DatasetRunResult {
  manifest: DatasetManifest | null;
  results: DatasetCaseRecord[];
  summary: DatasetManifest['summary'];
}

export async function loadDatasetFromFile(entryFile = 'make.ts'): Promise<Dataset<unknown>> {
  const resolvedPath = path.resolve(entryFile);
  const moduleUrl = pathToFileURL(resolvedPath).href;
  const module = await importDatasetModule(resolvedPath, moduleUrl);
  const candidate = resolveDatasetExport(module);

  if (!isDataset(candidate)) {
    throw new Error(`Default export in '${entryFile}' is not a Genesis v2 dataset.`);
  }

  return candidate;
}

function resolveDatasetExport(module: any): unknown {
  let candidate = module?.default ?? module;
  for (let depth = 0; depth < 3 && !isDataset(candidate); depth++) {
    if (!candidate || typeof candidate !== 'object' || !('default' in candidate)) {
      break;
    }
    candidate = (candidate as { default?: unknown }).default;
  }
  return candidate;
}

async function importDatasetModule(resolvedPath: string, moduleUrl: string): Promise<any> {
  const extension = path.extname(resolvedPath).toLowerCase();
  if (extension === '.ts' || extension === '.tsx' || extension === '.mts' || extension === '.cts') {
    if (process.versions.bun) {
      return import(moduleUrl);
    }

    const { tsImport } = await import('tsx/esm/api');
    return tsImport(moduleUrl, { parentURL: import.meta.url });
  }

  return import(moduleUrl);
}

export async function validateDatasetFromFile(entryFile = 'make.ts'): Promise<DatasetRunResult> {
  const dataset = await loadDatasetFromFile(entryFile);
  return validateDataset(dataset, { datasetFile: path.resolve(entryFile) });
}

export async function generateDatasetFromFile(entryFile = 'make.ts'): Promise<DatasetRunResult> {
  const dataset = await loadDatasetFromFile(entryFile);
  return generateDataset(dataset, { datasetFile: path.resolve(entryFile) });
}

export async function replayDatasetFromFile(
  entryFile = 'make.ts',
  selector: DatasetReplaySelector,
): Promise<DatasetRunResult> {
  const dataset = await loadDatasetFromFile(entryFile);
  return replayDataset(dataset, selector, { datasetFile: path.resolve(entryFile) });
}

export async function validateDataset<TInput>(
  dataset: Dataset<TInput>,
  options: Omit<DatasetRunOptions, 'mode'> = {},
): Promise<DatasetRunResult> {
  return runDataset(dataset, { ...options, mode: 'validate' });
}

export async function generateDataset<TInput>(
  dataset: Dataset<TInput>,
  options: Omit<DatasetRunOptions, 'mode'> = {},
): Promise<DatasetRunResult> {
  return runDataset(dataset, { ...options, mode: 'generate' });
}

export async function replayDataset<TInput>(
  dataset: Dataset<TInput>,
  selector: DatasetReplaySelector,
  options: Omit<DatasetRunOptions, 'mode' | 'replay'> = {},
): Promise<DatasetRunResult> {
  assertDataset(dataset);
  const rootDir = getDatasetRootDir(options.datasetFile);
  const config = resolveConfigPaths(normalizeConfig(dataset.config), options.datasetFile);
  const cases = expandDatasetCases(config);
  const selected = selectReplayCase(cases, selector);
  const replayOutputDir = selector.outputDir
    ? resolvePathFromRoot(selector.outputDir, rootDir)
    : path.join(config.outputDir ?? 'data', 'replay');
  const replayManifestPath = selector.manifestPath === false
    ? false
    : selector.manifestPath
      ? resolvePathFromRoot(selector.manifestPath, rootDir)
      : config.manifestPath === false
        ? false
        : path.join(replayOutputDir, `${selected.caseNumber}.manifest.json`);
  const startedAt = Date.now();
  const runConfig = {
    ...config,
    outputDir: replayOutputDir,
    manifestPath: replayManifestPath,
  };
  const { results, execution } = await runCasePipeline(runConfig, [selected], 'generate', {
    cleanOutputDir: false,
    outputDir: replayOutputDir,
    rootDir,
  });
  const summary = summarize(results, Date.now() - startedAt);
  const replay: DatasetReplayInfo = {
    caseNumber: selected.caseNumber,
    caseName: selected.name,
    repeatIndex: selected.repeatIndex,
    outputDir: path.resolve(replayOutputDir),
  };
  const manifest = await writeManifest(runConfig, results, summary, {
    datasetFile: options.datasetFile ?? null,
    execution,
    replay,
  });

  return { manifest, results, summary };
}

export function expandDatasetCases<TInput>(config: DatasetConfig<TInput>): ExpandedDatasetCase<TInput>[] {
  const expanded: ExpandedDatasetCase<TInput>[] = [];
  let caseIndex = 0;

  for (const item of config.cases) {
    if (!item || typeof item !== 'object') {
      throw new Error('Every dataset case must be an object.');
    }
    if (!item.name || typeof item.name !== 'string') {
      throw new Error('Every dataset case must have a non-empty name.');
    }

    const hasInput = Object.prototype.hasOwnProperty.call(item, 'input');
    const hasGenerate = typeof (item as DatasetGeneratedCase<TInput>).generate === 'function';
    if (hasInput === hasGenerate) {
      throw new Error(`Case '${item.name}' must define exactly one of input or generate.`);
    }

    const tags = normalizeTags(item.tags);

    if (hasInput) {
      if (Object.prototype.hasOwnProperty.call(item, 'repeat')) {
        throw new Error(`Static case '${item.name}' must not define repeat.`);
      }
      expanded.push({
        caseIndex,
        caseNumber: (config.startFrom ?? 1) + caseIndex,
        name: item.name,
        repeatIndex: 0,
        repeatTotal: 1,
        tags,
        kind: 'static',
        input: item.input,
        seed: '',
      });
      caseIndex++;
      continue;
    }

    const repeat = item.repeat ?? 1;
    if (!Number.isInteger(repeat) || repeat <= 0) {
      throw new Error(`Case '${item.name}' repeat must be a positive integer.`);
    }

    for (let repeatIndex = 0; repeatIndex < repeat; repeatIndex++) {
      expanded.push({
        caseIndex,
        caseNumber: (config.startFrom ?? 1) + caseIndex,
        name: item.name,
        repeatIndex,
        repeatTotal: repeat,
        tags,
        kind: 'generated',
        generate: item.generate,
        seed: '',
      });
      caseIndex++;
    }
  }

  return expanded.map(entry => ({
    ...entry,
    seed: deriveCaseSeed(config.seed, entry.caseIndex, entry.caseNumber, entry.name, entry.repeatIndex),
  }));
}

export interface ExpandedDatasetCase<TInput> {
  caseIndex: number;
  caseNumber: number;
  name: string;
  repeatIndex: number;
  repeatTotal: number;
  tags: string[];
  kind: 'static' | 'generated';
  input?: TInput;
  generate?: DatasetGeneratedCase<TInput>['generate'];
  seed: string;
}

function selectReplayCase<TInput>(
  cases: ExpandedDatasetCase<TInput>[],
  selector: DatasetReplaySelector,
): ExpandedDatasetCase<TInput> {
  if (selector.caseNumber !== undefined) {
    const matched = cases.find(item => item.caseNumber === selector.caseNumber);
    if (!matched) {
      throw new Error(`No dataset case has caseNumber ${selector.caseNumber}.`);
    }
    return matched;
  }

  if (selector.caseName) {
    const repeatIndex = selector.repeatIndex ?? 0;
    const matched = cases.find(item => item.name === selector.caseName && item.repeatIndex === repeatIndex);
    if (!matched) {
      throw new Error(`No dataset case matches name '${selector.caseName}' with repeatIndex ${repeatIndex}.`);
    }
    return matched;
  }

  throw new Error('Replay requires either caseNumber or caseName.');
}

async function runDataset<TInput>(
  dataset: Dataset<TInput>,
  options: DatasetRunOptions,
): Promise<DatasetRunResult> {
  assertDataset(dataset);
  const rootDir = getDatasetRootDir(options.datasetFile);
  const config = resolveConfigPaths(normalizeConfig({
    ...dataset.config,
    outputDir: options.outputDir ?? dataset.config.outputDir,
    manifestPath: options.manifestPath ?? dataset.config.manifestPath,
  }), options.datasetFile);
  const cases = expandDatasetCases(config);

  if (cases.length === 0) {
    throw new Error('Dataset contains no cases.');
  }

  const startedAt = Date.now();
  const { results, execution } = await runCasePipeline(config, cases, options.mode, {
    cleanOutputDir: options.cleanOutputDir,
    outputDir: config.outputDir,
    rootDir,
  });
  const summary = summarize(results, Date.now() - startedAt);
  const manifest = options.mode === 'generate'
    ? await writeManifest(config, results, summary, {
      datasetFile: options.datasetFile ?? null,
      execution,
      replay: options.replay ?? null,
    })
    : null;

  return { manifest, results, summary };
}

function assertDataset<TInput>(dataset: Dataset<TInput>): void {
  if (!dataset || typeof dataset !== 'object' || dataset.__genesisDataset !== 2) {
    throw new Error('Invalid Genesis v2 dataset object.');
  }
}

function normalizeConfig<TInput>(config: DatasetConfig<TInput>): DatasetConfig<TInput> {
  if (!config || typeof config !== 'object') {
    throw new Error('Dataset config is missing.');
  }
  if (!config.solution || typeof config.solution !== 'string') {
    throw new Error('Dataset config.solution must be a non-empty string.');
  }
  if (typeof config.format !== 'function') {
    throw new Error('Dataset config.format must be a function.');
  }
  if (!Array.isArray(config.cases)) {
    throw new Error('Dataset config.cases must be an array.');
  }
  if (config.seed === undefined || config.seed === null || config.seed === '') {
    throw new Error('Dataset config.seed is required.');
  }

  return {
    ...config,
    outputDir: config.outputDir ?? 'data',
    startFrom: Number.isInteger(config.startFrom) && (config.startFrom ?? 1) > 0 ? config.startFrom : 1,
    runTimeoutMs: Number.isFinite(config.runTimeoutMs) && (config.runTimeoutMs ?? 10000) > 0 ? config.runTimeoutMs : 10000,
    caseConcurrency: Number.isFinite(config.caseConcurrency) && (config.caseConcurrency ?? 0) > 0 ? config.caseConcurrency : undefined,
    compilerFlags: [...(config.compilerFlags ?? [])],
    manifestPath: config.manifestPath ?? undefined,
  };
}

function resolveConfigPaths<TInput>(
  config: DatasetConfig<TInput>,
  datasetFile?: string | null,
): DatasetConfig<TInput> {
  if (!datasetFile) return config;

  const rootDir = getDatasetRootDir(datasetFile);

  return {
    ...config,
    solution: resolvePathFromRoot(config.solution, rootDir),
    outputDir: resolvePathFromRoot(config.outputDir ?? 'data', rootDir),
    manifestPath: typeof config.manifestPath === 'string'
      ? resolvePathFromRoot(config.manifestPath, rootDir)
      : config.manifestPath,
  };
}

async function runCasePipeline<TInput>(
  config: DatasetConfig<TInput>,
  cases: ExpandedDatasetCase<TInput>[],
  mode: 'generate' | 'validate',
  options: { cleanOutputDir?: boolean; outputDir?: string; rootDir?: string } = {},
): Promise<{ results: DatasetCaseRecord[]; execution: ExecutionResult | null }> {
  const preparedExecution = mode === 'generate'
    ? await prepareDatasetExecution(config)
    : null;
  const outputDir = path.resolve(options.outputDir ?? config.outputDir ?? 'data');
  const rootDir = path.resolve(options.rootDir ?? process.cwd());

  if (mode === 'generate' && options.cleanOutputDir !== false) {
    await resetOutputDirectory(outputDir, rootDir);
    await fs.mkdir(outputDir, { recursive: true });
  }
  if (mode === 'generate') {
    await fs.mkdir(outputDir, { recursive: true });
  }

  const concurrency = resolveConcurrency(config.caseConcurrency, cases.length);
  const results = new Array<DatasetCaseRecord>(cases.length);
  let nextIndex = 0;
  const running = new Set<Promise<void>>();

  const launch = (index: number) => {
    const task = processCase(config, cases[index]!, mode, preparedExecution, outputDir)
      .then(result => {
        results[index] = result;
      })
      .finally(() => {
        running.delete(task);
      });
    running.add(task);
  };

  while (nextIndex < cases.length || running.size > 0) {
    while (nextIndex < cases.length && running.size < concurrency) {
      launch(nextIndex);
      nextIndex++;
    }
    if (running.size > 0) {
      await Promise.race(running);
    }
  }

  return { results, execution: preparedExecution };
}

async function processCase<TInput>(
  config: DatasetConfig<TInput>,
  entry: ExpandedDatasetCase<TInput>,
  mode: 'generate' | 'validate',
  execution: ExecutionResult | null,
  outputDir: string,
): Promise<DatasetCaseRecord> {
  const startedAt = Date.now();
  const phases = {
    materializeMs: 0,
    formatMs: 0,
    validateMs: 0,
    writeInputMs: 0,
    executionMs: 0,
    writeOutputMs: 0,
  };
  let currentPhase: DatasetErrorPhase = 'materialize';
  let validationSummary: DatasetValidationSummary = { status: 'not-run', durationMs: 0 };
  let inputRecord: DatasetFileRecord | null = null;
  let outputRecord: DatasetFileRecord | null = null;

  try {
    currentPhase = 'materialize';
    const materializeStarted = Date.now();
    const input = entry.kind === 'static'
      ? entry.input
      : await entry.generate!(buildGenerateContext(entry));
    phases.materializeMs = Date.now() - materializeStarted;

    currentPhase = 'format';
    const formatStarted = Date.now();
    const formatted = normalizeFormat(config.format(input as TInput));
    const renderedInput = renderFormatDocument(formatted);
    phases.formatMs = Date.now() - formatStarted;

    currentPhase = 'validate';
    const validationStarted = Date.now();
    validationSummary = await runValidation(config, input as TInput, {
      caseIndex: entry.caseIndex,
      caseNumber: entry.caseNumber,
      caseName: entry.name,
      repeatIndex: entry.repeatIndex,
      tags: entry.tags,
      seed: entry.seed,
      formattedInput: renderedInput,
    });
    phases.validateMs = Date.now() - validationStarted;

    if (validationSummary.status === 'failed') {
      return buildFailedRecord(entry, phases, startedAt, {
        phase: 'validate',
        kind: 'validation',
        message: validationSummary.reason || 'Validation failed.',
      }, validationSummary);
    }

    if (mode === 'validate') {
      return buildSuccessRecord(entry, phases, startedAt, null, null, validationSummary);
    }

    const inPath = path.join(outputDir, `${entry.caseNumber}.in`);
    const outPath = path.join(outputDir, `${entry.caseNumber}.out`);

    currentPhase = 'write-input';
    const writeInputStarted = Date.now();
    inputRecord = await writeTextFile(inPath, renderedInput);
    phases.writeInputMs = Date.now() - writeInputStarted;

    if (!execution) {
      throw new Error('Execution environment is not available.');
    }

    currentPhase = 'execution';
    const executionStarted = Date.now();
    await runSolution(execution, renderedInput, config.runTimeoutMs ?? 10000, outPath);
    phases.executionMs = Date.now() - executionStarted;

    currentPhase = 'write-output';
    const writeOutputStarted = Date.now();
    outputRecord = await describeFile(outPath);
    phases.writeOutputMs = Date.now() - writeOutputStarted;

    return {
      caseId: entry.caseNumber,
      caseNumber: entry.caseNumber,
      name: entry.name,
      repeatIndex: entry.repeatIndex,
      tags: entry.tags,
      seed: entry.seed,
      status: 'success',
      durationMs: Date.now() - startedAt,
      phases,
      validation: validationSummary,
      input: inputRecord,
      output: outputRecord,
      error: null,
    };
  } catch (error) {
    return buildFailedRecord(
      entry,
      phases,
      startedAt,
      classifyError(error, currentPhase),
      validationSummary,
      inputRecord,
      outputRecord,
    );
  }
}

function buildGenerateContext<TInput>(
  entry: ExpandedDatasetCase<TInput>,
) {
  return {
    caseIndex: entry.caseIndex,
    caseNumber: entry.caseNumber,
    caseName: entry.name,
    repeatIndex: entry.repeatIndex,
    seed: entry.seed,
    g: createGenerator(entry.seed),
  };
}

async function runValidation<TInput>(
  config: DatasetConfig<TInput>,
  input: TInput,
  context: DatasetValidationContext,
): Promise<DatasetValidationSummary> {
  if (!config.validate) {
    return { status: 'not-run', durationMs: 0 };
  }

  const startedAt = Date.now();
  try {
    const result = await config.validate(input, context);
    const normalized = normalizeValidationResult(result);
    normalized.durationMs = Date.now() - startedAt;
    return normalized;
  } catch (error) {
    return {
      status: 'failed',
      durationMs: Date.now() - startedAt,
      reason: getErrorMessage(error),
    };
  }
}

function normalizeValidationResult(result: DatasetValidationReturn): DatasetValidationSummary {
  if (result === undefined || result === true) {
    return { status: 'passed', durationMs: 0 };
  }
  if (result === false) {
    return { status: 'failed', durationMs: 0, reason: 'Validation returned false.' };
  }
  if (typeof result === 'string') {
    return { status: 'failed', durationMs: 0, reason: result };
  }
  if (result && typeof result === 'object') {
    return result.ok
      ? { status: 'passed', durationMs: 0 }
      : { status: 'failed', durationMs: 0, reason: result.reason || 'Validation failed.' };
  }
  return { status: 'failed', durationMs: 0, reason: 'Validation returned an unsupported value.' };
}

function buildSuccessRecord(
  entry: ExpandedDatasetCase<unknown>,
  phases: DatasetCaseRecord['phases'],
  startedAt: number,
  input: DatasetFileRecord | null,
  output: DatasetFileRecord | null,
  validation: DatasetValidationSummary,
): DatasetCaseRecord {
  return {
    caseId: entry.caseNumber,
    caseNumber: entry.caseNumber,
    name: entry.name,
    repeatIndex: entry.repeatIndex,
    tags: entry.tags,
    seed: entry.seed,
    status: 'success',
    durationMs: Date.now() - startedAt,
    phases,
    validation,
    input,
    output,
    error: null,
  };
}

function buildFailedRecord(
  entry: ExpandedDatasetCase<unknown>,
  phases: DatasetCaseRecord['phases'],
  startedAt: number,
  error: DatasetErrorRecord,
  validation: DatasetValidationSummary,
  input: DatasetFileRecord | null = null,
  output: DatasetFileRecord | null = null,
): DatasetCaseRecord {
  return {
    caseId: entry.caseNumber,
    caseNumber: entry.caseNumber,
    name: entry.name,
    repeatIndex: entry.repeatIndex,
    tags: entry.tags,
    seed: entry.seed,
    status: 'failure',
    durationMs: Date.now() - startedAt,
    phases,
    validation,
    input,
    output,
    error,
  };
}

function classifyError(error: unknown, phase: DatasetErrorPhase): DatasetErrorRecord {
  const message = getErrorMessage(error);
  if (error instanceof Error && /timeout/i.test(error.message)) {
    return { phase: 'execution', kind: 'timeout', message };
  }
  if (phase === 'format') return { phase, kind: 'formatter', message };
  if (phase === 'validate') return { phase, kind: 'validation', message };
  if (phase === 'write-input' || phase === 'write-output' || phase === 'manifest') {
    return { phase, kind: 'io', message };
  }
  if (phase === 'execution') return { phase, kind: 'execution', message };
  if (phase === 'config') return { phase, kind: 'config', message };
  return { phase, kind: 'generator', message };
}

function normalizeTags(tags?: string[]): string[] {
  return Array.from(new Set((tags ?? []).filter(Boolean)));
}

function deriveCaseSeed(seed: string | number | bigint, caseIndex: number, caseNumber: number, name: string, repeatIndex: number): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ seed: String(seed), caseIndex, caseNumber, name, repeatIndex }))
    .digest('hex');
}

function summarize(results: DatasetCaseRecord[], durationMs: number): DatasetManifest['summary'] {
  const succeeded = results.filter(result => result.status === 'success').length;
  return {
    totalCases: results.length,
    succeeded,
    failed: results.length - succeeded,
    durationMs,
  };
}

async function writeManifest(
  config: DatasetConfig<unknown>,
  results: DatasetCaseRecord[],
  summary: DatasetManifest['summary'],
  context: {
    datasetFile?: string | null;
    execution?: ExecutionResult | null;
    replay?: DatasetReplayInfo | null;
  } = {},
): Promise<DatasetManifest | null> {
  const manifestPath = resolveManifestPath(config);
  if (!manifestPath) return null;

  const manifest: DatasetManifest = {
    version: 2,
    tool: {
      name: 'genesis-kit',
      version,
    },
    generatedAt: new Date().toISOString(),
    dataset: {
      modulePath: context.datasetFile ? toProjectRelativePosix(path.resolve(context.datasetFile)) : null,
      solution: toProjectRelativePosix(path.resolve(config.solution)),
      outputDir: toProjectRelativePosix(path.resolve(config.outputDir ?? 'data')),
      seed: String(config.seed),
      startFrom: config.startFrom ?? 1,
      runTimeoutMs: config.runTimeoutMs ?? 10000,
      caseConcurrency: config.caseConcurrency ?? null,
      compiler: config.compiler ?? null,
      compilerFlags: [...(config.compilerFlags ?? [])],
      ojProfile: config.ojProfile ?? null,
      stackSizeBytes: config.stackSizeBytes ?? null,
      manifestPath: manifestPath ? toProjectRelativePosix(manifestPath) : null,
    },
    execution: context.execution ? {
      runArgs: [...context.execution.runArgs],
      executablePath: context.execution.executablePath,
      fingerprint: buildExecutionFingerprint(context.execution),
    } : null,
    replay: context.replay ?? null,
    summary,
    cases: results,
  };

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

function buildExecutionFingerprint(execution: ExecutionResult): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify({
      runArgs: execution.runArgs,
      executablePath: execution.executablePath,
    }))
    .digest('hex');
}

function resolveManifestPath(config: DatasetConfig<unknown>): string | null {
  if (config.manifestPath === false) {
    return null;
  }
  if (typeof config.manifestPath === 'string') {
    return path.resolve(config.manifestPath);
  }
  const outputDir = path.resolve(config.outputDir ?? 'data');
  const parentDir = path.dirname(outputDir);
  const name = path.basename(outputDir) || 'data';
  return path.join(parentDir, `${name}.manifest.json`);
}

function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep).replaceAll(path.win32.sep, path.posix.sep);
}

function toProjectRelativePosix(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(process.cwd(), absolutePath);
  if (relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return toPortablePath(relativePath);
  }
  return toPortablePath(absolutePath);
}

function getDatasetRootDir(datasetFile?: string | null): string {
  return datasetFile ? path.dirname(path.resolve(datasetFile)) : process.cwd();
}

function resolvePathFromRoot(filePath: string, rootDir: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
}

async function prepareDatasetExecution<TInput>(config: DatasetConfig<TInput>): Promise<ExecutionResult> {
  const result = await prepareForExecution(path.resolve(config.solution), {
    compiler: config.compiler,
    compilerFlags: config.compilerFlags,
    ojProfile: config.ojProfile,
    stackSizeBytes: config.stackSizeBytes,
  });

  if (!result) {
    throw new Error('Failed to prepare standard solution for execution.');
  }

  return result;
}

async function runSolution(
  execution: ExecutionResult,
  input: string,
  timeoutMs: number,
  outputPath: string,
): Promise<void> {
  const [command, ...args] = execution.runArgs;
  const tempOutputPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );

  try {
    const result = await execa(command, args, {
      input,
      timeout: timeoutMs,
      reject: false,
      cleanup: true,
      buffer: { stdout: false, stderr: true },
      stripFinalNewline: { stdout: false, stderr: true },
      stdout: { file: tempOutputPath },
    });

    if (result.timedOut) {
      throw new Error(`Execution timed out after ${timeoutMs}ms.`);
    }

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Command failed with exit code ${result.exitCode}.`);
    }

    await fs.rm(outputPath, { force: true });
    await fs.rename(tempOutputPath, outputPath);
  } catch (error) {
    await fs.rm(tempOutputPath, { force: true });
    throw error;
  }
}

async function writeTextFile(filePath: string, text: string): Promise<DatasetFileRecord> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
  return describeFile(filePath);
}

async function describeFile(filePath: string): Promise<DatasetFileRecord> {
  const stat = await fs.stat(filePath);
  const sha256 = crypto.createHash('sha256');
  let newlineCount = 0;

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: Buffer) => {
      sha256.update(chunk);
      for (const byte of chunk) {
        if (byte === 0x0a) {
          newlineCount++;
        }
      }
    });
    stream.once('error', reject);
    stream.once('end', () => resolve());
  });

  return {
    path: toProjectRelativePosix(filePath),
    sha256: sha256.digest('hex'),
    bytes: stat.size,
    lines: stat.size === 0 ? 0 : newlineCount + 1,
  };
}

async function resetOutputDirectory(outputDir: string, rootDir: string): Promise<void> {
  const forbiddenNames = ['src', 'node_modules', '.git', '.', '..', '/'];
  if (forbiddenNames.includes(path.basename(outputDir))) {
    throw new Error(`Safety check failed: refusing to remove '${outputDir}'.`);
  }
  const absoluteOutputDir = path.resolve(outputDir);
  const absoluteRootDir = path.resolve(rootDir);
  const relativePath = path.relative(absoluteRootDir, absoluteOutputDir);
  if (absoluteOutputDir === absoluteRootDir || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Safety check failed: outputDir '${outputDir}' must be inside '${absoluteRootDir}'.`);
  }
  await fs.rm(absoluteOutputDir, { recursive: true, force: true });
}

function resolveConcurrency(caseConcurrency: number | undefined, totalCases: number): number {
  const preferred = caseConcurrency ?? os.cpus().length;
  if (!Number.isFinite(preferred) || preferred <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(totalCases, Math.floor(preferred)));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}
