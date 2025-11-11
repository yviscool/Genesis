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

  try {
    // We use 'tsx' to run the user's TypeScript script.
    // 'stdio: inherit' pipes the child process's output directly to our terminal,
    // so the user sees the real-time output from Genesis-Kit's Maker/Checker.
    await execa('tsx', [scriptPath], { stdio: 'inherit' });
  } catch (error: any) {
    // execa rejects if the process exits with a non-zero code.
    // The actual error message from the script will already be printed
    // to the console because of 'stdio: inherit'. We just need to exit
    // to signal that the command failed.
    process.exit(1);
  }
}
