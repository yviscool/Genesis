import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { consola } from 'consola';
import { t } from '../i18n';
import { TEMPLATES, MAKE_TS } from './templates';

export async function handleInit(directory?: string, options: { lang?: string, force?: boolean } = {}) {
  const targetDir = directory || '.';
  const lang = options.lang || 'cpp';
  const force = options.force || false;

  if (!TEMPLATES[lang]) {
    consola.error(`Invalid language '${lang}'. Supported languages are: ${Object.keys(TEMPLATES).join(', ')}`);
    process.exit(1);
  }

  consola.start(t('cli.init.initializing', path.resolve(targetDir)));

  try {
    if (!existsSync(targetDir)) {
      await fs.mkdir(targetDir, { recursive: true });
    }

    const files = await fs.readdir(targetDir);
    if (files.length > 0 && !force) {
      consola.warn(t('cli.init.notEmpty', targetDir));
      return;
    }

    const langTemplates = { ...TEMPLATES[lang], 'make.ts': MAKE_TS };

    for (const [fileName, content] of Object.entries(langTemplates)) {
      const filePath = path.join(targetDir, fileName);
      await fs.writeFile(filePath, content.trim());
      consola.success(t('cli.init.created', path.relative(process.cwd(), filePath)));
    }

    consola.info(t('cli.init.success'));
    consola.log(
      t(
        'cli.init.nextSteps',
        targetDir,
      ),
    );
  } catch (error: any) {
    consola.error(t('cli.init.failed', error.message));
    process.exit(1);
  }
}
