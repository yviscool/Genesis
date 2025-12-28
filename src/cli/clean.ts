import fs from 'node:fs/promises';
import path from 'node:path';
import { consola } from 'consola';
import { t } from '../i18n';
import { GENESIS_CACHE_DIR } from '../execution';

export async function handleClean() {
  const cachePath = path.join(process.cwd(), GENESIS_CACHE_DIR);
  consola.start(t('cli.clean.checkingCache', cachePath));

  try {
    // fs.access 如果目录不存在会抛出错误
    await fs.access(cachePath);

    // 如果存在，则删除它
    consola.info(t('cli.clean.foundCache', GENESIS_CACHE_DIR));
    await fs.rm(cachePath, { recursive: true, force: true });
    consola.success(t('cli.clean.removedCache', GENESIS_CACHE_DIR));
  } catch (error: any) {
    // 'ENOENT' 错误表示文件/目录不存在，这是符合预期的
    if (error.code === 'ENOENT') {
      consola.info(t('cli.clean.noCache', GENESIS_CACHE_DIR));
    } else {
      // 处理其他潜在错误 (例如权限问题)
      consola.error(t('cli.clean.failed', error.message));
      process.exit(1);
    }
  }
}
