#!/usr/bin/env node

import { cac } from 'cac';
import { consola } from 'consola';
import { version } from '../../package.json';
import { handleInit } from './init';
import { runCheckCommand, runDatasetCommand, runLintCommand } from './runner';
import { handleClean } from './clean';
import { t } from '../i18n';

const cli = cac('genesis');

cli
  .command('init [directory]', t('cli.index.initDescription'))
  .option('--lang <language>', t('cli.index.langDescription'))
  .option('--ai', t('cli.index.aiDescription'))
  .option('--force', t('cli.index.initForceDescription'))
  .action((directory?: string, options?: { lang?: string, force?: boolean; ai?: boolean }) => {
    handleInit(directory, options);
  });

cli
  .command('make', t('cli.index.makeDescription'))
  .option('--file <path>', t('cli.index.fileDescription'))
  .option('--only <spec>', 'Only these cases: numbers, ranges (3-5) or names, comma separated')
  .option('--from <number>', 'First case number to generate')
  .option('--to <number>', 'Last case number to generate')
  .option('--resume', 'Skip cases whose artifacts still match the manifest')
  .option('--prune', 'Delete numbered .in/.out files that no declared case owns')
  .option('--jobs <number>', 'Max concurrent cases')
  .option('--output-dir <path>', t('cli.index.outputDirDescription'))
  .option('--manifest <path>', 'Write the manifest to this path')
  .option('--json', 'Print a machine readable summary')
  .action((options?: Parameters<typeof runDatasetCommand>[1]) => {
    runDatasetCommand('make', options);
  });

cli
  .command('validate', t('cli.index.validateDescription'))
  .option('--file <path>', t('cli.index.fileDescription'))
  .option('--only <spec>', 'Only these cases: numbers, ranges (3-5) or names, comma separated')
  .option('--from <number>', 'First case number to validate')
  .option('--to <number>', 'Last case number to validate')
  .option('--jobs <number>', 'Max concurrent cases')
  .option('--output-dir <path>', t('cli.index.outputDirDescription'))
  .option('--manifest <path>', 'Write the manifest to this path')
  .option('--json', 'Print a machine readable summary')
  .action((options?: Parameters<typeof runDatasetCommand>[1]) => {
    runDatasetCommand('validate', options);
  });

cli
  .command('replay', t('cli.index.replayDescription'))
  .option('--file <path>', t('cli.index.fileDescription'))
  .option('--case <number>', t('cli.index.caseDescription'))
  .option('--name <name>', t('cli.index.nameDescription'))
  .option('--repeat <index>', t('cli.index.repeatDescription'))
  .option('--output-dir <path>', t('cli.index.outputDirDescription'))
  .action((options?: Parameters<typeof runDatasetCommand>[1]) => {
    runDatasetCommand('replay', options);
  });

cli
  .command('check', 'Verify that the data on disk still matches the dataset (read only)')
  .option('--file <path>', t('cli.index.fileDescription'))
  .option('--output-dir <path>', t('cli.index.outputDirDescription'))
  .option('--manifest <path>', 'Read the manifest from this path')
  .option('--json', 'Print the full drift report as JSON')
  .action((options?: { file?: string; outputDir?: string; manifest?: string; json?: boolean }) => {
    runCheckCommand(options);
  });

cli
  .command('lint [file]', 'Statically check a maker.ts against the Genesis contract')
  .option('--file <path>', t('cli.index.fileDescription'))
  .option('--all [directory]', 'Lint every maker.ts under the directory (default: testdata)')
  .option('--json', 'Print the findings as JSON')
  .action((file?: string, options?: { file?: string; all?: string | boolean; json?: boolean }) => {
    runLintCommand({ ...options, file: options?.file ?? file });
  });

cli.command('clean', t('cli.index.cleanDescription')).action(() => {
  handleClean();
});

cli.help();
cli.version(version);

try {
  cli.parse();
} catch (e: any) {
  consola.error(e.message);
  process.exit(1);
}
