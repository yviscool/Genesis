#!/usr/bin/env node

import { cac } from 'cac';
import { consola } from 'consola';
import { version } from '../../package.json';
import { handleInit } from './init';
import { runScript } from './runner';
import { handleClean } from './clean';
import { t } from '../i18n';

const cli = cac('genesis');

cli
  .command('init [directory]', t('cli.index.initDescription'))
  .option('--lang <language>', t('cli.index.langDescription'))
  .option('--force', t('cli.index.initForceDescription'))
  .action((directory?: string, options?: { lang?: string, force?: boolean }) => {
    handleInit(directory, options);
  });

cli.command('make', t('cli.index.makeDescription')).action(() => {
  runScript('make.ts');
});

cli.command('check', t('cli.index.checkDescription')).action(() => {
  runScript('check.ts');
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
