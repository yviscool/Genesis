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

  // Define runners in order of preference: bun -> node -> tsx
  const runners: [string, string[]][] = [
    ['bun', [scriptPath]],
    ['node', [scriptPath]],
    ['tsx', [scriptPath]],
  ];

  for (let i = 0; i < runners.length; i++) {
    const [command, args] = runners[i];
    try {
      // Attempt to run with the current runner
      await execa(command, args, { stdio: 'inherit' });
      // If successful, we're done.
      return;
    } catch (error: any) {
      // If the command itself is not found, try the next runner.
      if (error.code === 'ENOENT') {
        consola.debug(`Runner '${command}' not found, trying next...`);
        continue;
      }
      
      // If the runner was found but the script failed (non-zero exit code),
      // execa throws an error. We should exit the process and not try other runners.
      process.exit(1);
    }
  }

  // If all runners failed to be found
  consola.error('Could not find a suitable TypeScript runtime (bun, node, or tsx). Please install one.');
  process.exit(1);
}
