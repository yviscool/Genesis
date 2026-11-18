import fs from 'node:fs/promises';
import path from 'node:path';
import { consola } from 'consola';
import {
  generateDatasetFromFile,
  replayDatasetFromFile,
  validateDatasetFromFile,
  type DatasetCaseSelector,
  type DatasetRunResult,
} from '../dataset-runner';
import { checkDatasetFromFile, type DatasetCheckReport } from '../check';
import { formatLintIssue, lintMakerSource, type LintIssue } from '../lint';

export interface DatasetCommandOptions {
  file?: string;
  case?: string | number;
  name?: string;
  repeat?: string | number;
  outputDir?: string;
  manifest?: string;
  only?: string;
  from?: string | number;
  to?: string | number;
  resume?: boolean;
  prune?: boolean;
  jobs?: string | number;
  json?: boolean;
}

export interface CheckCommandOptions {
  file?: string;
  outputDir?: string;
  manifest?: string;
  json?: boolean;
}

export interface LintCommandOptions {
  file?: string;
  all?: string | boolean;
  json?: boolean;
}

export async function runDatasetCommand(
  mode: 'make' | 'validate' | 'replay',
  options: DatasetCommandOptions = {},
): Promise<void> {
  const entryFile = options.file ?? 'make.ts';

  try {
    const selector = buildCaseSelector(options);
    const shared = {
      caseSelector: selector,
      resume: options.resume,
      prune: options.prune,
      caseConcurrency: parseIntegerOption(options.jobs, '--jobs'),
      outputDir: options.outputDir,
      manifestPath: options.manifest,
    };

    const result = mode === 'make'
      ? await generateDatasetFromFile(entryFile, shared)
      : mode === 'validate'
        ? await validateDatasetFromFile(entryFile, shared)
        : await replayDatasetFromFile(entryFile, {
          caseNumber: parseIntegerOption(options.case, '--case'),
          caseName: options.name,
          repeatIndex: parseIntegerOption(options.repeat, '--repeat'),
          outputDir: options.outputDir,
        }, shared);

    reportResult(mode, result, options);
    if (result.summary.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    consola.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export async function runCheckCommand(options: CheckCommandOptions = {}): Promise<void> {
  const entryFile = options.file ?? 'make.ts';
  try {
    const report = await checkDatasetFromFile(entryFile, {
      outputDir: options.outputDir,
      manifestPath: options.manifest,
    });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      reportCheck(report);
    }
    if (report.status !== 'ok') process.exit(1);
  } catch (error) {
    consola.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export async function runLintCommand(options: LintCommandOptions = {}): Promise<void> {
  const targets = await resolveLintTargets(options);
  if (targets.length === 0) {
    consola.error('No maker files found to lint.');
    process.exit(1);
  }

  const results: { file: string; issues: LintIssue[] }[] = [];
  for (const file of targets) {
    const code = await fs.readFile(file, 'utf8');
    results.push({ file, issues: lintMakerSource(code, { filename: file, expectedSolution: 'std.py' }) });
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const { file, issues } of results) {
      const label = path.basename(path.dirname(file));
      if (issues.length === 0) {
        console.log(`OK   ${label}`);
        continue;
      }
      console.log(`FAIL ${label}`);
      for (const issue of issues) console.log(`     ${formatLintIssue(issue, path.basename(file))}`);
    }
  }

  const bad = results.filter(item => item.issues.length > 0).length;
  if (!options.json) console.log(`\n${results.length - bad}/${results.length} lint ok`);
  if (bad > 0) process.exit(1);
}

function buildCaseSelector(options: DatasetCommandOptions): DatasetCaseSelector | null {
  const from = parseIntegerOption(options.from, '--from');
  const to = parseIntegerOption(options.to, '--to');
  if (!options.only && from === undefined && to === undefined) return null;
  return { only: options.only, from, to };
}

async function resolveLintTargets(options: LintCommandOptions): Promise<string[]> {
  if (options.file) return [path.resolve(options.file)];
  if (options.all) {
    const root = path.resolve(typeof options.all === 'string' ? options.all : 'testdata');
    return collectMakerFiles(root);
  }
  return [path.resolve('make.ts')];
}

async function collectMakerFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await collectMakerFiles(absolute));
    } else if (entry.isFile() && entry.name === 'maker.ts') {
      found.push(absolute);
    }
  }
  return found.sort();
}

function parseIntegerOption(value: string | number | undefined, name: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function reportResult(
  mode: 'make' | 'validate' | 'replay',
  result: DatasetRunResult,
  options: DatasetCommandOptions,
): void {
  const { totalCases, succeeded, failed, skipped } = result.executed;
  const label = mode === 'make' ? 'generation' : mode === 'validate' ? 'validation' : 'replay';
  const skippedNote = skipped > 0 ? `, ${skipped} reused` : '';
  const manifestNote = skipped > 0 ? ` — manifest covers ${result.summary.totalCases} cases` : '';

  if (failed === 0) {
    consola.success(`Dataset ${label} complete: ${succeeded}/${totalCases} cases passed (${result.summary.durationMs}ms)${skippedNote}${manifestNote}.`);
  } else {
    consola.warn(`Dataset ${label} finished with failures: ${succeeded}/${totalCases} cases passed, ${failed} failed${skippedNote}.`);
    for (const record of result.results.filter(item => item.status === 'failure')) {
      consola.error(`${record.name} #${record.caseNumber}: ${record.error?.message ?? 'failed'}`);
    }
  }

  if (options.json) {
    console.log(JSON.stringify({
      executed: result.executed,
      summary: result.summary,
      cases: result.results.map(record => ({
        caseNumber: record.caseNumber,
        name: record.name,
        status: record.status,
        bytes: record.output?.bytes ?? 0,
        error: record.error?.message ?? null,
      })),
      manifest: result.manifest,
    }, null, 2));
  }

  if (result.manifest) {
    consola.info(`Manifest: ${result.manifest.dataset.manifestPath}`);
    console.log(`GENESIS_MANIFEST=${result.manifest.dataset.manifestPath}`);
  }
}

function reportCheck(report: DatasetCheckReport): void {
  if (report.status === 'ok') {
    consola.success(`Up to date: ${report.recordedCases}/${report.expectedCases} cases match the manifest.`);
  } else if (report.status === 'missing') {
    consola.warn(`No usable manifest: ${report.manifestPath ?? '(disabled)'}`);
  } else {
    consola.warn(`Stale: ${report.expectedCases} declared, ${report.recordedCases} recorded.`);
  }

  for (const issue of report.issues) {
    const prefix = issue.severity === 'error' ? 'error' : 'warn';
    console.log(`  ${prefix}  [${issue.code}] ${issue.message}`);
  }
}
