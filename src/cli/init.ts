import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { consola } from 'consola';
import pc from 'picocolors';
import { t } from '../i18n';
import { MAKE_TS, TEMPLATES } from './templates';

const SUPPORTED_LANGUAGES = Object.keys(TEMPLATES);

async function runInteractiveWizard(): Promise<{ lang: string } | null> {
  consola.info(pc.cyan(t('cli.init.wizard.title')) + '\n');

  try {
    const lang = await consola.prompt(t('cli.init.wizard.selectLang'), {
      type: 'select',
      options: SUPPORTED_LANGUAGES.map(value => ({
        value,
        label: value === 'cpp' ? 'C++'
          : value === 'go' ? 'Go'
            : value === 'rust' ? 'Rust'
              : value === 'java' ? 'Java'
                : value === 'py' ? 'Python'
                  : value === 'js' ? 'JavaScript'
                    : value,
      })),
      initial: 'cpp',
    }) as string;

    return { lang };
  } catch {
    consola.info('\n' + t('cli.init.wizard.cancelled'));
    return null;
  }
}

export async function handleInit(
  directory?: string,
  options: { lang?: string; force?: boolean; interactive?: boolean; ai?: boolean } = {},
): Promise<void> {
  const targetDir = directory || '.';
  const force = options.force || false;
  let lang = options.lang;

  if (!lang && options.interactive !== false) {
    const wizardResult = await runInteractiveWizard();
    if (!wizardResult) return;
    lang = wizardResult.lang;
  } else {
    lang = lang || 'cpp';
  }

  if (!TEMPLATES[lang]) {
    consola.error(t('cli.init.invalidLang', lang, SUPPORTED_LANGUAGES.join(', ')));
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

    const solutionFile = Object.keys(TEMPLATES[lang])[0];
    const langTemplates: Record<string, string> = {
      ...TEMPLATES[lang],
      'make.ts': MAKE_TS(solutionFile),
    };

    for (const [fileName, content] of Object.entries(langTemplates)) {
      const filePath = path.join(targetDir, fileName);
      await fs.writeFile(filePath, content.trim() + '\n', 'utf8');
      consola.success(t('cli.init.created', path.relative(process.cwd(), filePath)));
    }

    consola.info(t('cli.init.success'));

    const nextSteps = [
      `${pc.dim('1.')} ${targetDir !== '.' ? `cd ${targetDir}` : t('cli.init.step.cd')}`,
      `${pc.dim('2.')} ${t('cli.init.step.editStd')}`,
      `${pc.dim('3.')} ${t('cli.init.step.editMake')}`,
      `${pc.dim('4.')} ${t('cli.init.step.runMake')}`,
    ];

    consola.box({
      title: t('cli.init.nextStepsTitle'),
      message: nextSteps.join('\n'),
      style: {
        borderColor: 'cyan',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    consola.error(t('cli.init.failed', message));
    process.exit(1);
  }
}
