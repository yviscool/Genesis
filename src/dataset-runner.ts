import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execa } from 'execa';
import { prepareForExecution, type ExecutionResult } from './execution';
import { createGenerator } from './generator/factory';
import { checkConstraints } from './constraints';
import type { DatasetConstraints } from './constraints';
import { normalizeFormat, renderFormatDocument } from './format';
import {
  defaultManifestPath,
  digestFile,
  readManifest,
  sourceMatches,
  writeManifest,
  type DatasetCaseRecord,
  type DatasetCaseStatus,
  type DatasetErrorPhase,
  type DatasetErrorRecord,
  type DatasetFileRecord,
  type DatasetManifest,
  type DatasetManifestSummary,
  type DatasetValidationSummary,
  type ManifestFileRef,
} from './manifest';
import { isDataset, type Dataset, type DatasetConfig, type DatasetGeneratedCase, type DatasetValidationContext, type DatasetValidationReturn } from './dataset';

export type {
  DatasetCaseRecord,
  DatasetCaseStatus,
  DatasetErrorPhase,
  DatasetErrorRecord,
  DatasetFileRecord,
  DatasetManifest,
  DatasetManifestSummary,
  DatasetValidationSummary,
};

export interface DatasetRunOptions {
  mode: 'generate' | 'validate';
  datasetFile?: string | null;
  replay?: DatasetReplayInfo | null;
  outputDir?: string;
  manifestPath?: string | false;
  cleanOutputDir?: boolean;
  /** Restrict the run to a subset of the expanded cases. */
  caseSelector?: DatasetCaseSelector | null;
  /** Skip cases whose existing artifacts already match the manifest. */
  resume?: boolean;
  /** Delete numbered `.in` / `.out` files that the current run did not produce. */
  prune?: boolean;
  /** Override `config.caseConcurrency`. */
  caseConcurrency?: number;
  /**
   * Append a final newline to the rendered `.in` when the format does not end with one.
   * Off by default: `fmt` output is taken literally.
   */
  ensureTrailingNewline?: boolean;
}

/** Everything a caller may pass to the `*FromFile` helpers. */
export type DatasetFileRunOptions = Omit<DatasetRunOptions, 'mode' | 'datasetFile'>;

/**
 * `--only` grammar: comma separated items, each of
 *   `N` (case number), `N-M` (inclusive range), or a case name.
 */
export interface DatasetCaseSelector {
  only?: string;
  from?: number;
  to?: number;
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

export interface DatasetRunResult {
  manifest: DatasetManifest | null;
  results: DatasetCaseRecord[];
  /** Describes the manifest, i.e. every case the dataset declares. */
  summary: DatasetManifestSummary;
  /** Describes this invocation only — `skipped` counts carried-over / resumed cases. */
  executed: {
    totalCases: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
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

export async function validateDatasetFromFile(
  entryFile = 'make.ts',
  options: DatasetFileRunOptions = {},
): Promise<DatasetRunResult> {
  const dataset = await loadDatasetFromFile(entryFile);
  return validateDataset(dataset, { ...options, datasetFile: path.resolve(entryFile) });
}

export async function generateDatasetFromFile(
  entryFile = 'make.ts',
  options: DatasetFileRunOptions = {},
): Promise<DatasetRunResult> {
  const dataset = await loadDatasetFromFile(entryFile);
  return generateDataset(dataset, { ...options, datasetFile: path.resolve(entryFile) });
}

export async function replayDatasetFromFile(
  entryFile = 'make.ts',
  selector: DatasetReplaySelector,
  options: DatasetFileRunOptions = {},
): Promise<DatasetRunResult> {
  const dataset = await loadDatasetFromFile(entryFile);
  return replayDataset(dataset, selector, { ...options, datasetFile: path.resolve(entryFile) });
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
  const replayManifestPath: string | false = selector.manifestPath === false
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
  const manifest = (await writeManifest({
    config: runConfig,
    results,
    summary,
    datasetFile: options.datasetFile ?? null,
    execution,
    replay: {
      caseNumber: selected.caseNumber,
      caseName: selected.name,
      repeatIndex: selected.repeatIndex,
      outputDir: replayOutputDir,
    },
  }))?.manifest ?? null;

  return { manifest, results, summary, executed: buildExecutedSummary(results, results) };
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

type OnlyToken =
  | { kind: 'number'; value: number }
  | { kind: 'range'; from: number; to: number }
  | { kind: 'name'; value: string };

function parseOnlySpec(spec: string): OnlyToken[] {
  return spec
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)
    .map((token): OnlyToken => {
      const range = /^(\d+)\s*-\s*(\d+)$/.exec(token);
      if (range) {
        const from = Number(range[1]);
        const to = Number(range[2]);
        return { kind: 'range', from: Math.min(from, to), to: Math.max(from, to) };
      }
      if (/^\d+$/.test(token)) return { kind: 'number', value: Number(token) };
      return { kind: 'name', value: token };
    });
}

/**
 * Narrow an expanded case list down to what the caller asked for.
 *
 * `from` / `to` are inclusive case-number bounds; `only` accepts a comma separated mix of
 * case numbers, inclusive ranges (`3-5`) and case names. Name matching is exact and applies
 * to every repeat of that case.
 */
export function selectDatasetCases<TInput>(
  cases: ExpandedDatasetCase<TInput>[],
  selector?: DatasetCaseSelector | null,
): ExpandedDatasetCase<TInput>[] {
  if (!selector) return cases;

  let selected = cases;
  if (typeof selector.from === 'number') {
    selected = selected.filter(item => item.caseNumber >= selector.from!);
  }
  if (typeof selector.to === 'number') {
    selected = selected.filter(item => item.caseNumber <= selector.to!);
  }

  if (selector.only && selector.only.trim()) {
    const tokens = parseOnlySpec(selector.only);
    const names = new Set(tokens.filter(token => token.kind === 'name').map(token => (token as { value: string }).value));
    const numbers = new Set<number>();
    for (const token of tokens) {
      if (token.kind === 'number') numbers.add(token.value);
      else if (token.kind === 'range') {
        for (let n = token.from; n <= token.to; n++) numbers.add(n);
      }
    }
    selected = selected.filter(item => numbers.has(item.caseNumber) || names.has(item.name));
  }

  if (selected.length === 0) {
    throw new Error(`Case selector matched no cases (only=${selector.only ?? '-'}, from=${selector.from ?? '-'}, to=${selector.to ?? '-'}).`);
  }
  return selected;
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
  const baseConfig = resolveDatasetConfig(dataset, {
    datasetFile: options.datasetFile,
    outputDir: options.outputDir,
    manifestPath: options.manifestPath,
  });
  const config: DatasetConfig<TInput> = options.caseConcurrency && options.caseConcurrency > 0
    ? { ...baseConfig, caseConcurrency: Math.floor(options.caseConcurrency) }
    : baseConfig;
  const allCases = expandDatasetCases(config);

  if (allCases.length === 0) {
    throw new Error('Dataset contains no cases.');
  }

  const cases = selectDatasetCases(allCases, options.caseSelector);
  const isPartialRun = Boolean(options.resume || options.caseSelector);

  // A partial run (`--only`, `--resume`) must still emit a *complete* manifest: the cases it
  // did not touch are carried over from the previous manifest instead of being dropped.
  const previousManifestPath = defaultManifestPath(config);
  const previousManifest = isPartialRun && options.mode === 'generate' && previousManifestPath
    ? await loadPreviousManifest(previousManifestPath)
    : null;
  const manifestDir = previousManifestPath ? path.dirname(previousManifestPath) : process.cwd();

  // `--resume` only trusts the previous manifest when the inputs that produced it are
  // unchanged. A different maker.ts or std.py invalidates every case by definition.
  const resumeTrusted = Boolean(options.resume) && previousManifest
    ? await manifestSourcesMatch(previousManifest, options.datasetFile ?? null, config.solution)
    : false;

  const { pending, carryOver } = await planRun(
    allCases,
    cases,
    previousManifest,
    manifestDir,
    resumeTrusted,
  );

  const startedAt = Date.now();
  // A partial run must never wipe the directory: `--only 3` would otherwise delete cases 1-2.
  const cleanOutputDir = options.cleanOutputDir !== undefined
    ? options.cleanOutputDir
    : !(options.resume || options.caseSelector || options.prune);
  const { results: fresh, execution } = await runCasePipeline(config, pending, options.mode, {
    cleanOutputDir,
    outputDir: config.outputDir,
    rootDir,
    ensureTrailingNewline: options.ensureTrailingNewline,
  });

  const results = isPartialRun
    ? mergeCaseRecords(allCases, carryOver, fresh)
    : fresh;

  if (options.prune && options.mode === 'generate') {
    // Prune against every declared case, never against the selected subset — otherwise
    // `--only 3 --prune` would delete cases 1, 2, 4…
    await pruneOrphanArtifacts(
      path.resolve(config.outputDir ?? 'data'),
      new Set(allCases.map(item => item.caseNumber)),
    );
  }

  const summary = summarize(results, Date.now() - startedAt);
  const manifest = options.mode === 'generate'
    ? (await writeManifest({
      config,
      results,
      summary,
      datasetFile: options.datasetFile ?? null,
      execution,
      replay: options.replay
        ? {
          caseNumber: options.replay.caseNumber,
          caseName: options.replay.caseName,
          repeatIndex: options.replay.repeatIndex,
          outputDir: options.replay.outputDir,
        }
        : null,
    }))?.manifest ?? null
    : null;

  return { manifest, results, summary, executed: buildExecutedSummary(results, fresh) };
}

async function manifestSourcesMatch(
  manifest: DatasetManifest,
  datasetFile: string | null,
  solutionPath: string,
): Promise<boolean> {
  const makerOk = manifest.sources?.maker
    ? await sourceMatches(manifest.sources.maker, datasetFile)
    : true;
  if (!makerOk) return false;
  return sourceMatches(manifest.sources?.solution, solutionPath);
}

async function loadPreviousManifest(manifestPath: string): Promise<DatasetManifest | null> {
  try {
    return (await readManifest(manifestPath))?.manifest ?? null;
  } catch {
    return null;
  }
}

/**
 * Decide which cases to run and which previous records to keep.
 *
 * `reuseValid` (from `--resume`) lets a selected case be skipped when the manifest already
 * certifies it. Unselected cases are always carried over verbatim.
 */
async function planRun<TInput>(
  allCases: ExpandedDatasetCase<TInput>[],
  selected: ExpandedDatasetCase<TInput>[],
  previous: DatasetManifest | null,
  manifestDir: string,
  reuseValid: boolean,
): Promise<{ pending: ExpandedDatasetCase<TInput>[]; carryOver: Map<number, DatasetCaseRecord> }> {
  const carryOver = new Map<number, DatasetCaseRecord>();
  const pending: ExpandedDatasetCase<TInput>[] = [];
  if (!previous) return { pending: [...selected], carryOver };

  const byNumber = new Map(previous.cases.map(record => [record.caseNumber, record]));
  const selectedNumbers = new Set(selected.map(item => item.caseNumber));

  for (const item of selected) {
    const record = byNumber.get(item.caseNumber);
    const reusable = reuseValid
      && record
      && record.status === 'success'
      && record.seed === item.seed
      && await fileMatches(record.input, manifestDir)
      && await fileMatches(record.output, manifestDir);
    if (reusable) {
      carryOver.set(item.caseNumber, record!);
      continue;
    }
    pending.push(item);
  }

  for (const item of allCases) {
    if (selectedNumbers.has(item.caseNumber)) continue;
    const record = byNumber.get(item.caseNumber);
    if (record) carryOver.set(item.caseNumber, record);
  }

  return { pending, carryOver };
}

async function fileMatches(ref: ManifestFileRef | null, baseDir: string): Promise<boolean> {
  if (!ref) return false;
  const absolutePath = path.isAbsolute(ref.path) ? ref.path : path.resolve(baseDir, ref.path);
  try {
    const digest = await digestFile(absolutePath);
    return digest.sha256 === ref.sha256 && digest.bytes === ref.bytes;
  } catch {
    return false;
  }
}

function mergeCaseRecords(
  cases: ExpandedDatasetCase<unknown>[],
  reused: Map<number, DatasetCaseRecord>,
  fresh: DatasetCaseRecord[],
): DatasetCaseRecord[] {
  const freshByNumber = new Map(fresh.map(record => [record.caseNumber, record]));
  return cases
    .map(item => freshByNumber.get(item.caseNumber) ?? reused.get(item.caseNumber) ?? null)
    .filter((record): record is DatasetCaseRecord => record !== null);
}

/** Delete numbered `.in` / `.out` files that no declared case owns any more. */
async function pruneOrphanArtifacts(outputDir: string, declared: Set<number>): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(outputDir);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const name of entries) {
    const match = /^(\d+)\.(?:in|out)$/.exec(name);
    if (!match) continue;
    if (declared.has(Number(match[1]))) continue;
    await fs.rm(path.join(outputDir, name), { force: true });
    removed++;
  }
  return removed;
}

function assertDataset<TInput>(dataset: Dataset<TInput>): void {
  if (!dataset || typeof dataset !== 'object' || dataset.__genesisDataset !== 2) {
    throw new Error('Invalid Genesis v2 dataset object.');
  }
}

/**
 * Resolve a dataset's config the same way a run would, without touching any file.
 * Shared with `checkDataset` so both agree on where the output and manifest live.
 */
export function resolveDatasetConfig<TInput>(
  dataset: Dataset<TInput>,
  options: { datasetFile?: string | null; outputDir?: string; manifestPath?: string | false } = {},
): DatasetConfig<TInput> {
  assertDataset(dataset);
  return resolveConfigPaths(normalizeConfig({
    ...dataset.config,
    outputDir: options.outputDir ?? dataset.config.outputDir,
    manifestPath: options.manifestPath ?? dataset.config.manifestPath,
  }), options.datasetFile);
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
  options: {
    cleanOutputDir?: boolean;
    outputDir?: string;
    rootDir?: string;
    ensureTrailingNewline?: boolean;
  } = {},
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
    const task = processCase(config, cases[index]!, mode, preparedExecution, outputDir, options)
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
  options: { ensureTrailingNewline?: boolean } = {},
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
    const renderedInput = applyTrailingNewline(renderFormatDocument(formatted), options.ensureTrailingNewline);
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
  const hasConstraints = Boolean(config.constraints && Object.keys(config.constraints).length > 0);
  if (!config.validate && !hasConstraints) {
    return { status: 'not-run', durationMs: 0 };
  }

  const startedAt = Date.now();
  try {
    if (hasConstraints) {
      const violation = checkConstraints(input, config.constraints as DatasetConstraints);
      if (violation) {
        return { status: 'failed', durationMs: Date.now() - startedAt, reason: violation };
      }
    }

    if (!config.validate) {
      return { status: 'passed', durationMs: Date.now() - startedAt };
    }

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

function summarize(results: DatasetCaseRecord[], durationMs: number): DatasetManifestSummary {
  const succeeded = results.filter(result => result.status === 'success').length;
  return {
    totalCases: results.length,
    succeeded,
    failed: results.length - succeeded,
    durationMs,
  };
}

function applyTrailingNewline(text: string, enabled?: boolean): string {
  if (!enabled || text.length === 0 || text.endsWith('\n')) return text;
  return `${text}\n`;
}

function buildExecutedSummary(
  allResults: DatasetCaseRecord[],
  executedResults: DatasetCaseRecord[],
): DatasetRunResult['executed'] {
  const succeeded = executedResults.filter(result => result.status === 'success').length;
  return {
    totalCases: executedResults.length,
    succeeded,
    failed: executedResults.length - succeeded,
    skipped: allResults.length - executedResults.length,
  };
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

async function writeTextFile(filePath: string, text: string): Promise<ManifestFileRef> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
  return describeFile(filePath);
}

async function describeFile(filePath: string): Promise<ManifestFileRef> {
  const digest = await digestFile(filePath);
  return {
    path: path.resolve(filePath),
    sha256: digest.sha256,
    bytes: digest.bytes,
    lines: digest.lines,
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
