import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { version } from '../package.json';
import type { DatasetConfig } from './dataset';
import type { ExecutionResult } from './execution';

/**
 * Manifest format version.
 *
 * v2 stored absolute, machine-specific paths (temp directories included) and had no
 * fingerprint of the inputs that produced the data, so a manifest could not answer
 * "is this data still in sync with maker.ts / std.py?".
 *
 * v3 makes the manifest portable and self-verifying:
 *   - every path is relative to the manifest file itself (`pathBase: 'manifest'`)
 *   - `sources` records the sha256 of the maker module and the standard solution
 *   - `execution` records the runtime and relative run arguments
 */
export const MANIFEST_VERSION = 3 as const;

/** Documents the anchor used by every path stored in the manifest. */
export const MANIFEST_PATH_BASE = 'manifest' as const;

export interface ManifestFileRef {
  path: string;
  sha256: string;
  bytes: number;
  lines?: number;
}

export type DatasetCaseStatus = 'success' | 'failure';

export type DatasetErrorPhase =
  | 'config'
  | 'materialize'
  | 'format'
  | 'validate'
  | 'write-input'
  | 'execution'
  | 'write-output'
  | 'manifest';

export interface DatasetErrorRecord {
  phase: DatasetErrorPhase;
  kind: 'generator' | 'formatter' | 'validation' | 'io' | 'execution' | 'timeout' | 'config';
  message: string;
}

/** Backwards-compatible alias: a case file record is a manifest file reference. */
export type DatasetFileRecord = ManifestFileRef;

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
  input: ManifestFileRef | null;
  output: ManifestFileRef | null;
  error: DatasetErrorRecord | null;
}

export interface ManifestSourceRef {
  path: string;
  sha256: string;
  bytes: number;
}

export interface ManifestExecutionRef {
  /** Interpreter or launcher that runs the standard solution, e.g. `python3`. */
  runtime: string;
  /** Arguments with every path made relative to the manifest. */
  runArgs: string[];
  executablePath: string;
  fingerprint: string;
}

export interface ManifestReplayRef {
  caseNumber: number;
  caseName: string;
  repeatIndex: number;
  outputDir: string;
}

export interface DatasetManifestSummary {
  totalCases: number;
  succeeded: number;
  failed: number;
  durationMs: number;
}

export interface DatasetManifestDataset {
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
}

export interface DatasetManifest {
  version: typeof MANIFEST_VERSION;
  tool: {
    name: 'genesis-kit';
    version: string;
  };
  generatedAt: string;
  /** Every path in this file is relative to the directory holding this file. */
  pathBase: typeof MANIFEST_PATH_BASE;
  dataset: DatasetManifestDataset;
  sources: {
    /** The dataset module (`make.ts`). `null` when the dataset was not loaded from a file. */
    maker: ManifestSourceRef | null;
    /** The standard solution referenced by `config.solution`. */
    solution: ManifestSourceRef;
  };
  execution: ManifestExecutionRef | null;
  replay: ManifestReplayRef | null;
  summary: DatasetManifestSummary;
  cases: DatasetCaseRecord[];
}

export interface ManifestBuildInput {
  config: DatasetConfig<unknown>;
  results: DatasetCaseRecord[];
  summary: DatasetManifestSummary;
  datasetFile?: string | null;
  execution?: ExecutionResult | null;
  replay?: ManifestReplayRef | null;
}

export interface ManifestBuildResult {
  manifest: DatasetManifest;
  manifestPath: string;
}

/* -------------------------------------------------------------------------- */
/* Path helpers                                                                */
/* -------------------------------------------------------------------------- */

export function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep).replaceAll(path.win32.sep, path.posix.sep);
}

/**
 * Express `target` relative to `baseDir` using forward slashes.
 *
 * Paths that escape `baseDir` stay absolute: a relative path with `../..` is harder to
 * audit than an obvious absolute one, and both are equally unusable on another machine.
 */
export function relativizePath(target: string, baseDir: string): string {
  const absoluteTarget = path.resolve(target);
  const absoluteBase = path.resolve(baseDir);
  const relative = path.relative(absoluteBase, absoluteTarget);
  if (relative === '') return '.';
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return toPortablePath(absoluteTarget);
  }
  return toPortablePath(relative);
}

/** Turn a manifest-relative path back into an absolute one. */
export function resolveManifestPath(manifestPath: string, storedPath: string): string {
  if (path.isAbsolute(storedPath)) return path.normalize(storedPath);
  return path.resolve(path.dirname(path.resolve(manifestPath)), storedPath);
}

/** Where the manifest lives when the dataset does not pin an explicit path. */
export function defaultManifestPath(config: Pick<DatasetConfig<unknown>, 'outputDir' | 'manifestPath'>): string | null {
  if (config.manifestPath === false) return null;
  if (typeof config.manifestPath === 'string') return path.resolve(config.manifestPath);
  const outputDir = path.resolve(config.outputDir ?? 'data');
  const parentDir = path.dirname(outputDir);
  const name = path.basename(outputDir) || 'data';
  return path.join(parentDir, `${name}.manifest.json`);
}

/* -------------------------------------------------------------------------- */
/* Hashing                                                                     */
/* -------------------------------------------------------------------------- */

export interface FileDigest {
  sha256: string;
  bytes: number;
  lines: number;
}

/** Stream a file through sha256 while counting bytes and newlines. */
export async function digestFile(filePath: string): Promise<FileDigest> {
  const stat = await fs.stat(filePath);
  const sha256 = crypto.createHash('sha256');
  let newlineCount = 0;

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: Buffer | string) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      sha256.update(buffer);
      for (const byte of buffer) {
        if (byte === 0x0a) newlineCount++;
      }
    });
    stream.once('error', reject);
    stream.once('end', () => resolve());
  });

  return {
    sha256: sha256.digest('hex'),
    bytes: stat.size,
    lines: stat.size === 0 ? 0 : newlineCount + 1,
  };
}

export async function describeFile(filePath: string, baseDir: string): Promise<ManifestFileRef> {
  const digest = await digestFile(filePath);
  return {
    path: relativizePath(filePath, baseDir),
    sha256: digest.sha256,
    bytes: digest.bytes,
    lines: digest.lines,
  };
}

async function describeSource(filePath: string, baseDir: string): Promise<ManifestSourceRef> {
  const digest = await digestFile(filePath);
  return {
    path: relativizePath(filePath, baseDir),
    sha256: digest.sha256,
    bytes: digest.bytes,
  };
}

/** True when `filePath` still hashes to what the manifest recorded. */
export async function sourceMatches(
  ref: ManifestSourceRef | null | undefined,
  filePath: string | null,
): Promise<boolean> {
  if (!ref || !filePath) return false;
  try {
    const digest = await digestFile(filePath);
    return digest.sha256 === ref.sha256;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Building                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The execution fingerprint must change whenever anything that can change the produced
 * `.out` files changes: the solution bytes, the runtime, and its arguments.
 */
export function buildExecutionFingerprint(input: {
  runArgs: readonly string[];
  executablePath: string;
  solutionSha256: string;
}): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify({
      runArgs: input.runArgs,
      executablePath: input.executablePath,
      solutionSha256: input.solutionSha256,
    }))
    .digest('hex');
}

function relativizeRunArgs(runArgs: readonly string[], executablePath: string, baseDir: string): string[] {
  const relativeExecutable = relativizePath(executablePath, baseDir);
  return runArgs.map((arg) => {
    if (arg === executablePath) return relativeExecutable;
    if (path.isAbsolute(arg)) return relativizePath(arg, baseDir);
    return arg;
  });
}

/**
 * Build and persist a manifest. Returns `null` when `config.manifestPath === false`.
 */
export async function writeManifest(input: ManifestBuildInput): Promise<ManifestBuildResult | null> {
  const manifestPath = defaultManifestPath(input.config);
  if (!manifestPath) return null;

  const baseDir = path.dirname(manifestPath);
  const { config } = input;

  const solutionSource = await describeSource(config.solution, baseDir);
  const makerSource = input.datasetFile
    ? await describeSource(input.datasetFile, baseDir)
    : null;

  const cases = input.results.map(record => ({
    ...record,
    input: record.input ? rebaseFileRef(record.input, baseDir) : null,
    output: record.output ? rebaseFileRef(record.output, baseDir) : null,
  }));

  const execution: ManifestExecutionRef | null = input.execution
    ? {
      runtime: input.execution.runArgs[0] ?? '',
      runArgs: relativizeRunArgs(input.execution.runArgs, input.execution.executablePath, baseDir),
      executablePath: relativizePath(input.execution.executablePath, baseDir),
      fingerprint: buildExecutionFingerprint({
        runArgs: input.execution.runArgs,
        executablePath: input.execution.executablePath,
        solutionSha256: solutionSource.sha256,
      }),
    }
    : null;

  const manifest: DatasetManifest = {
    version: MANIFEST_VERSION,
    tool: {
      name: 'genesis-kit',
      version,
    },
    generatedAt: new Date().toISOString(),
    pathBase: MANIFEST_PATH_BASE,
    dataset: {
      modulePath: input.datasetFile ? relativizePath(input.datasetFile, baseDir) : null,
      solution: relativizePath(config.solution, baseDir),
      outputDir: relativizePath(config.outputDir ?? 'data', baseDir),
      seed: String(config.seed),
      startFrom: config.startFrom ?? 1,
      runTimeoutMs: config.runTimeoutMs ?? 10000,
      caseConcurrency: config.caseConcurrency ?? null,
      compiler: config.compiler ?? null,
      compilerFlags: [...(config.compilerFlags ?? [])],
      ojProfile: config.ojProfile ?? null,
      stackSizeBytes: config.stackSizeBytes ?? null,
      manifestPath: relativizePath(manifestPath, baseDir),
    },
    sources: {
      maker: makerSource,
      solution: solutionSource,
    },
    execution,
    replay: input.replay
      ? { ...input.replay, outputDir: relativizePath(input.replay.outputDir, baseDir) }
      : null,
    summary: input.summary,
    cases,
  };

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifest, manifestPath };
}

/**
 * Case records carry absolute paths while the run is in flight. Rebase them onto the
 * manifest directory so the stored record is portable. The digest is already authoritative
 * — recomputing it here would re-read every byte we just wrote.
 */
function rebaseFileRef(ref: ManifestFileRef, baseDir: string): ManifestFileRef {
  // Records carried over from a previous manifest are already relative to this same
  // directory; only freshly written records still hold an absolute path.
  if (!path.isAbsolute(ref.path)) return ref;
  return { ...ref, path: relativizePath(ref.path, baseDir) };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export interface LoadedManifest {
  manifest: DatasetManifest;
  manifestPath: string;
  manifestDir: string;
}

export async function readManifest(manifestPath: string): Promise<LoadedManifest | null> {
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf8');
  } catch {
    return null;
  }

  const manifest = JSON.parse(raw) as DatasetManifest;
  return {
    manifest,
    manifestPath: path.resolve(manifestPath),
    manifestDir: path.dirname(path.resolve(manifestPath)),
  };
}
