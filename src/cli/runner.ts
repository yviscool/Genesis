import fs from 'node:fs/promises';
import path from 'node:path';
import { consola } from 'consola';
import { execa } from 'execa';
import { t } from '../i18n';

export async function runScript(scriptName: 'make.ts' | 'check.ts') {
  const scriptPath = path.join(process.cwd(), scriptName);

  try {
    await fs.access(scriptPath);
  } catch {
    consola.error(t('cli.runner.notFound', scriptName));
    consola.info(t('cli.runner.hint'));
    process.exit(1);
  }

  // 按优先级定义运行器: bun -> node -> tsx
  const runners: [string, string[]][] = [
    ['bun', [scriptPath]],
    ['node', [scriptPath]],
    ['tsx', [scriptPath]],
  ];

  for (let i = 0; i < runners.length; i++) {
    const [command, args] = runners[i];
    try {
      // 尝试使用当前运行器执行
      await execa(command, args, { stdio: 'inherit' });
      // 如果成功则完成
      return;
    } catch (error: any) {
      // 如果命令本身找不到，尝试下一个运行器
      if (error.code === 'ENOENT') {
        consola.debug(`Runner '${command}' not found, trying next...`);
        continue;
      }
      
      // 如果运行器找到了但脚本执行失败 (非零退出码)，
      // execa 会抛出错误。我们应该退出进程而不是尝试其他运行器。
      process.exit(1);
    }
  }

  // 如果所有运行器都未找到
  consola.error('Could not find a suitable TypeScript runtime (bun, node, or tsx). Please install one.');
  process.exit(1);
}
