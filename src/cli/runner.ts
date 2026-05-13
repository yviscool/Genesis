import { consola } from 'consola';
import {
  generateDatasetFromFile,
  replayDatasetFromFile,
  validateDatasetFromFile,
  type DatasetRunResult,
} from '../dataset-runner';

export async function runDatasetCommand(
  mode: 'make' | 'validate' | 'replay',
  options: { file?: string; case?: string | number; name?: string; repeat?: string | number; outputDir?: string } = {},
): Promise<void> {
  const entryFile = options.file ?? 'make.ts';

  try {
    const result = mode === 'make'
      ? await generateDatasetFromFile(entryFile)
      : mode === 'validate'
        ? await validateDatasetFromFile(entryFile)
        : await replayDatasetFromFile(entryFile, {
          caseNumber: parseIntegerOption(options.case, '--case'),
          caseName: options.name,
          repeatIndex: parseIntegerOption(options.repeat, '--repeat'),
          outputDir: options.outputDir,
        });

    reportResult(mode, result);
    if (result.summary.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    consola.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function parseIntegerOption(value: string | number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function reportResult(mode: 'make' | 'validate' | 'replay', result: DatasetRunResult): void {
  const { totalCases, succeeded, failed, durationMs } = result.summary;
  const label = mode === 'make' ? 'generation' : mode === 'validate' ? 'validation' : 'replay';

  if (failed === 0) {
    consola.success(`Dataset ${label} complete: ${succeeded}/${totalCases} cases passed (${durationMs}ms).`);
  } else {
    consola.warn(`Dataset ${label} finished with failures: ${succeeded}/${totalCases} cases passed, ${failed} failed.`);
    for (const record of result.results.filter(item => item.status === 'failure')) {
      consola.error(`${record.name} #${record.caseNumber}: ${record.error?.message ?? 'failed'}`);
    }
  }

  if (result.manifest) {
    consola.info(`Manifest: ${result.manifest.dataset.manifestPath}`);
    console.log(`GENESIS_MANIFEST=${result.manifest.dataset.manifestPath}`);
  }
}
