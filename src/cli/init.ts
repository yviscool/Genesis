import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { consola } from 'consola';
import pc from 'picocolors';
import { t } from '../i18n';
import { TEMPLATES, MAKE_TS } from './templates';

// 支持的语言列表
const SUPPORTED_LANGUAGES = Object.keys(TEMPLATES);

/**
 * 交互式向导：询问用户配置选项
 */
async function runInteractiveWizard(): Promise<{ lang: string; includeChecker: boolean } | null> {
  consola.info(pc.cyan(t('cli.init.wizard.title')) + '\n');

  try {
    // 选择语言
    const lang = await consola.prompt(t('cli.init.wizard.selectLang'), {
      type: 'select',
      options: SUPPORTED_LANGUAGES.map(l => ({
        value: l,
        label: l === 'cpp' ? 'C++ (⭐)' :
          l === 'go' ? 'Go' :
            l === 'rust' ? 'Rust' :
              l === 'java' ? 'Java' :
                l === 'py' ? 'Python' :
                  l === 'js' ? 'JavaScript' : l
      })),
      initial: 'cpp'
    }) as string;

    // 询问是否包含对拍模板
    const includeChecker = await consola.prompt(t('cli.init.wizard.includeChecker'), {
      type: 'confirm',
      initial: true
    }) as boolean;

    return { lang, includeChecker };
  } catch {
    // 用户取消 (Ctrl+C)
    consola.info('\n' + t('cli.init.wizard.cancelled'));
    return null;
  }
}

export async function handleInit(directory?: string, options: { lang?: string; force?: boolean; interactive?: boolean } = {}) {
  const targetDir = directory || '.';
  const force = options.force || false;

  // 判断是否需要交互模式
  // 如果没有指定语言且没有显式禁用交互，则进入交互模式
  let lang = options.lang;
  let includeChecker = true;

  if (!lang && options.interactive !== false) {
    const wizardResult = await runInteractiveWizard();
    if (!wizardResult) {
      return; // 用户取消
    }
    lang = wizardResult.lang;
    includeChecker = wizardResult.includeChecker;
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

    // 根据用户选择构建模板
    const langTemplates: { [file: string]: string } = {
      ...TEMPLATES[lang],
      'make.ts': MAKE_TS
    };

    // 如果用户选择不包含对拍模板，则移除 check.ts
    if (!includeChecker) {
      delete langTemplates['check.ts'];
    }

    for (const [fileName, content] of Object.entries(langTemplates)) {
      const filePath = path.join(targetDir, fileName);
      await fs.writeFile(filePath, content.trim());
      consola.success(t('cli.init.created', path.relative(process.cwd(), filePath)));
    }

    consola.info(t('cli.init.success'));

    // 显示后续步骤提示
    const nextSteps = [
      `${pc.dim('1.')} ${targetDir !== '.' ? `cd ${targetDir}` : t('cli.init.step.cd')}`,
      `${pc.dim('2.')} ${t('cli.init.step.editStd')}`,
      `${pc.dim('3.')} ${t('cli.init.step.editMake')}`,
      `${pc.dim('4.')} ${t('cli.init.step.runMake')}`,
    ];

    if (includeChecker) {
      nextSteps.push(`${pc.dim('5.')} ${t('cli.init.step.runCheck')}`);
    }

    consola.box({
      title: `📋 ${t('cli.init.nextStepsTitle')}`,
      message: nextSteps.join('\n'),
      style: {
        borderColor: 'cyan'
      }
    });

  } catch (error: any) {
    consola.error(t('cli.init.failed', error.message));
    process.exit(1);
  }
}
