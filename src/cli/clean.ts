import fs from 'node:fs/promises';
import path from 'node:path';
import { consola } from 'consola';
import { t } from '../i18n';

const CACHE_DIR = '.genesis';

export async function handleClean() {
  const cachePath = path.join(process.cwd(), CACHE_DIR);
  consola.start(t('cli.clean.checkingCache', cachePath));

  try {
    // fs.access throws if the directory doesn't exist.
    await fs.access(cachePath);

    // If it exists, remove it.
    consola.info(t('cli.clean.foundCache', CACHE_DIR));
    await fs.rm(cachePath, { recursive: true, force: true });
    consola.success(t('cli.clean.removedCache', CACHE_DIR));
  } catch (error: any) {
    // A 'ENOENT' error from fs.access means the file/directory doesn't exist, which is fine.
    if (error.code === 'ENOENT') {
      consola.info(t('cli.clean.noCache', CACHE_DIR));
    } else {
      // Handle other potential errors (e.g., permissions issues)
      consola.error(t('cli.clean.failed', error.message));
      process.exit(1);
    }
  }
}
