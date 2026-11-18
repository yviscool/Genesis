import fs from 'node:fs/promises';
import path from 'node:path';
import { expandDatasetCases, loadDatasetFromFile, resolveDatasetConfig } from './dataset-runner';
import type { Dataset } from './dataset';
import {
  MANIFEST_VERSION,
  defaultManifestPath,
  digestFile,
  readManifest,
  relativizePath,
  type DatasetManifest,
  type ManifestFileRef,
} from './manifest';

/**
 * Drift codes.
 *
 * `error` means the data on disk is not what the dataset would produce today.
 * `warning` means the data is usable but the directory is not tidy.
 */
export type DriftCode =
  | 'manifest-missing'
  | 'manifest-version'
  | 'source-drift'
  | 'case-missing'
  | 'case-extra'
  | 'artifact-missing'
  | 'artifact-modified'
  | 'orphan-artifact'
  | 'case-failed';

export interface DriftIssue {
  code: DriftCode;
  severity: 'error' | 'warning';
  message: string;
  caseNumber?: number;
  /** Manifest-relative path of the file the issue is about, when applicable. */
  path?: string;
}

export interface DatasetCheckReport {
  /** `ok` = data matches the dataset; `stale` = it does not; `missing` = no manifest at all. */
  status: 'ok' | 'stale' | 'missing';
  manifestPath: string | null;
  manifestVersion: number | null;
  expectedCases: number;
  recordedCases: number;
  /** Case numbers that the dataset declares but the manifest does not cover. */
  missingCases: number[];
  issues: DriftIssue[];
}

export interface DatasetCheckOptions {
  datasetFile?: string | null;
  outputDir?: string;
  manifestPath?: string | false;
}

/**
 * Compare the dataset's *intent* (its config plus the bytes of `maker` / `std`) against the
 * artifacts currently on disk. Reads only — never generates, never writes.
 *
 * This is what makes `--check` cheap: without it the only way to know whether a change to
 * `maker.ts` invalidated 2 GB of test data is to regenerate all of it.
 */
export async function checkDataset<TInput>(
  dataset: Dataset<TInput>,
  options: DatasetCheckOptions = {},
): Promise<DatasetCheckReport> {
  const config = resolveDatasetConfig(dataset, options);
  const cases = expandDatasetCases(config);
  const expectedNumbers = cases.map(item => item.caseNumber);
  const manifestPath = defaultManifestPath(config);

  if (!manifestPath) {
    return {
      status: 'missing',
      manifestPath: null,
      manifestVersion: null,
      expectedCases: cases.length,
      recordedCases: 0,
      missingCases: expectedNumbers,
      issues: [{
        code: 'manifest-missing',
        severity: 'error',
        message: 'This dataset has no manifest (manifestPath is false), so drift cannot be verified.',
      }],
    };
  }

  let loaded: Awaited<ReturnType<typeof readManifest>> = null;
  try {
    loaded = await readManifest(manifestPath);
  } catch {
    loaded = null;
  }
  if (!loaded) {
    return {
      status: 'missing',
      manifestPath,
      manifestVersion: null,
      expectedCases: cases.length,
      recordedCases: 0,
      missingCases: expectedNumbers,
      issues: [{
        code: 'manifest-missing',
        severity: 'error',
        message: `No manifest at ${manifestPath}.`,
      }],
    };
  }

  const { manifest, manifestDir } = loaded;
  const issues: DriftIssue[] = [];

  if (manifest.version !== MANIFEST_VERSION) {
    issues.push({
      code: 'manifest-version',
      severity: 'error',
      message: `Manifest is v${manifest.version}, this tool writes v${MANIFEST_VERSION}. Regenerate or migrate it.`,
    });
  }

  issues.push(...await compareSource('maker', manifest, options.datasetFile ?? null, manifestDir));
  issues.push(...await compareSource('solution', manifest, config.solution, manifestDir));

  const recordedNumbers = new Set(manifest.cases.map(record => record.caseNumber));
  const missingCases = expectedNumbers.filter(number => !recordedNumbers.has(number));
  const extraCases = [...recordedNumbers].filter(number => !expectedNumbers.includes(number));

  for (const number of missingCases) {
    const entry = cases.find(item => item.caseNumber === number);
    issues.push({
      code: 'case-missing',
      severity: 'error',
      message: `case ${number} (${entry?.name ?? '?'}) is declared but missing from the manifest.`,
      caseNumber: number,
    });
  }
  for (const number of extraCases) {
    issues.push({
      code: 'case-extra',
      severity: 'error',
      message: `case ${number} exists in the manifest but is no longer declared.`,
      caseNumber: number,
    });
  }

  for (const record of manifest.cases) {
    if (record.status !== 'success') {
      issues.push({
        code: 'case-failed',
        severity: 'error',
        message: `case ${record.caseNumber} was recorded as failed: ${record.error?.message ?? 'unknown error'}`,
        caseNumber: record.caseNumber,
      });
      continue;
    }
    issues.push(...await compareArtifact(record.input, 'input', record.caseNumber, manifestDir));
    issues.push(...await compareArtifact(record.output, 'output', record.caseNumber, manifestDir));
  }

  issues.push(...await findOrphans(config.outputDir ?? 'data', new Set(expectedNumbers), manifestDir));

  const hasError = issues.some(issue => issue.severity === 'error');
  return {
    status: hasError ? 'stale' : 'ok',
    manifestPath,
    manifestVersion: manifest.version,
    expectedCases: cases.length,
    recordedCases: manifest.cases.length,
    missingCases,
    issues,
  };
}

export async function checkDatasetFromFile(
  entryFile = 'make.ts',
  options: Omit<DatasetCheckOptions, 'datasetFile'> = {},
): Promise<DatasetCheckReport> {
  const dataset = await loadDatasetFromFile(entryFile);
  return checkDataset(dataset, { ...options, datasetFile: path.resolve(entryFile) });
}

async function compareSource(
  kind: 'maker' | 'solution',
  manifest: DatasetManifest,
  absolutePath: string | null,
  manifestDir: string,
): Promise<DriftIssue[]> {
  const recorded = kind === 'maker' ? manifest.sources?.maker : manifest.sources?.solution;
  if (!absolutePath) {
    return kind === 'maker'
      ? []
      : [{
        code: 'source-drift',
        severity: 'error',
        message: 'The dataset has no solution file to fingerprint.',
      }];
  }

  const label = kind === 'maker' ? 'maker module' : 'standard solution';
  if (!recorded) {
    return [{
      code: 'source-drift',
      severity: 'error',
      message: `The manifest records no ${label} fingerprint, so staleness cannot be verified.`,
      path: relativizePath(absolutePath, manifestDir),
    }];
  }

  try {
    const digest = await digestFile(absolutePath);
    if (digest.sha256 !== recorded.sha256) {
      return [{
        code: 'source-drift',
        severity: 'error',
        message: `${label} changed since the data was generated (${recorded.sha256.slice(0, 8)} -> ${digest.sha256.slice(0, 8)}).`,
        path: recorded.path,
      }];
    }
  } catch {
    return [{
      code: 'source-drift',
      severity: 'error',
      message: `${label} is missing: ${absolutePath}`,
      path: recorded.path,
    }];
  }
  return [];
}

async function compareArtifact(
  ref: ManifestFileRef | null,
  label: 'input' | 'output',
  caseNumber: number,
  manifestDir: string,
): Promise<DriftIssue[]> {
  if (!ref) {
    return [{
      code: 'artifact-missing',
      severity: 'error',
      message: `case ${caseNumber} has no recorded ${label} file.`,
      caseNumber,
    }];
  }

  const absolutePath = path.isAbsolute(ref.path) ? ref.path : path.resolve(manifestDir, ref.path);
  try {
    const digest = await digestFile(absolutePath);
    if (digest.sha256 !== ref.sha256) {
      return [{
        code: 'artifact-modified',
        severity: 'error',
        message: `case ${caseNumber} ${label} differs from the manifest (${ref.sha256.slice(0, 8)} -> ${digest.sha256.slice(0, 8)}).`,
        caseNumber,
        path: ref.path,
      }];
    }
  } catch {
    return [{
      code: 'artifact-missing',
      severity: 'error',
      message: `case ${caseNumber} ${label} file is missing: ${ref.path}`,
      caseNumber,
      path: ref.path,
    }];
  }
  return [];
}

/**
 * Numbered `.in` / `.out` files that no declared case owns.
 *
 * These are left behind when a dataset shrinks — `promoteArtifacts()` only ever overwrites,
 * so dropping cases 9-12 leaves `9.in`..`12.in` on disk and the catalog happily indexes them.
 */
async function findOrphans(
  outputDir: string,
  declared: Set<number>,
  manifestDir: string,
): Promise<DriftIssue[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(path.resolve(outputDir));
  } catch {
    return [];
  }

  const issues: DriftIssue[] = [];
  for (const name of entries.sort()) {
    const match = /^(\d+)\.(in|out)$/.exec(name);
    if (!match) continue;
    const number = Number(match[1]);
    if (declared.has(number)) continue;
    issues.push({
      code: 'orphan-artifact',
      severity: 'warning',
      message: `orphan file ${name} does not belong to any declared case (run with --prune to remove).`,
      caseNumber: number,
      path: relativizePath(path.resolve(outputDir, name), manifestDir),
    });
  }
  return issues;
}
