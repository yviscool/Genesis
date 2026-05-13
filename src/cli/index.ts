#!/usr/bin/env node

import { cac } from 'cac';
import { consola } from 'consola';
import { version } from '../../package.json';
import { handleInit } from './init';
import { runDatasetCommand } from './runner';
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
  .action((options?: { file?: string }) => {
    runDatasetCommand('make', options);
  });

cli
  .command('validate', t('cli.index.validateDescription'))
  .option('--file <path>', t('cli.index.fileDescription'))
  .action((options?: { file?: string }) => {
    runDatasetCommand('validate', options);
  });

cli
  .command('replay', t('cli.index.replayDescription'))
  .option('--file <path>', t('cli.index.fileDescription'))
  .option('--case <number>', t('cli.index.caseDescription'))
  .option('--name <name>', t('cli.index.nameDescription'))
  .option('--repeat <index>', t('cli.index.repeatDescription'))
  .option('--output-dir <path>', t('cli.index.outputDirDescription'))
  .action((options?: { file?: string; case?: string; name?: string; repeat?: string; outputDir?: string }) => {
    runDatasetCommand('replay', options);
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
