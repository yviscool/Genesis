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

  // Preferred order:
  // 1) bun (fast path)
  // 2) tsx (works on older Node versions)
  // 3) node (modern Node can run .ts directly in many setups)
  const runners: [string, string[]][] = [
    ['bun', [scriptPath]],
    ['tsx', [scriptPath]],
    ['node', [scriptPath]],
  ];

  for (let i = 0; i < runners.length; i++) {
    const [command, args] = runners[i];
    try {
      // Try current runner.
      await execa(command, args, { stdio: 'inherit' });
      // Stop at first successful runner.
      return;
    } catch (error: any) {
      // If runner is not installed, try next candidate.
      if (error.code === 'ENOENT') {
        consola.debug(`Runner '${command}' not found, trying next...`);
        continue;
      }

      // Runner exists but script execution failed.
      process.exit(1);
    }
  }

  // No supported runtime found.
  consola.error('Could not find a suitable TypeScript runtime (bun, tsx, or node). Please install one.');
  process.exit(1);
}
