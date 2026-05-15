import { afterEach, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const fixtureNames = [
  'arithmetic-matrix',
  'balanced-sequence',
  'interval-union',
  'multiple-of-all',
  'tree-max-degree',
] as const;

type SubprocessResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runLocalAiMaker(args: string[]): Promise<SubprocessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve({
          stdout,
          stderr,
          exitCode: 0,
        });
        return;
      }

      const message = [
        `Command failed with exit code ${code ?? -1}.`,
        stderr.trim(),
        stdout.trim(),
      ].filter(Boolean).join('\n');
      const error = new Error(message) as Error & {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      };
      error.stdout = stdout;
      error.stderr = stderr;
      error.exitCode = code ?? -1;
      reject(error);
    });
  });
}

describe('ai-maker mock regressions', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  for (const fixtureName of fixtureNames) {
    test(`runs fixture ${fixtureName} through the local ai-maker pipeline`, async () => {
      const jobRoot = await fs.mkdtemp(path.join(os.tmpdir(), `genesis-ai-maker-${fixtureName}-`));
      tempDirs.push(jobRoot);

      const fixtureDir = path.join(process.cwd(), 'test', 'fixtures', 'ai-maker', fixtureName);
      const statementPath = path.join(fixtureDir, 'problem.md');
      const responsePath = path.join(fixtureDir, 'response.txt');

      const result = await runLocalAiMaker([
        'run',
        'examples/ai-maker.ts',
        '--statement',
        statementPath,
        '--name',
        fixtureName,
        '--job-root',
        jobRoot,
        '--mock-response-file',
        responsePath,
      ]);

      const manifestPath = path.join(jobRoot, fixtureName, 'data.manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

      expect(result.stdout).toContain(`cases=${manifest.summary.totalCases}`);
      expect(manifest.summary).toMatchObject({
        failed: 0,
      });
      expect(manifest.summary.totalCases).toBeGreaterThanOrEqual(6);
      expect(manifest.dataset.solution).toContain(`${fixtureName}/std.js`);
    });
  }

  test('rejects nonexistent APIs and forbidden case output fields in AI output', async () => {
    const jobRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'genesis-ai-maker-bad-lint-'));
    tempDirs.push(jobRoot);

    const fixtureDir = path.join(process.cwd(), 'test', 'fixtures', 'ai-maker', 'arithmetic-matrix');
    const statementPath = path.join(fixtureDir, 'problem.md');
    const responsePath = path.join(jobRoot, 'bad-response.txt');

    await fs.writeFile(responsePath, `<<<SOLUTION_CODE>>>
const data = require('node:fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);
const n = data[0] ?? 0;
const m = data[1] ?? 0;
const rows = [];
for (let i = 1; i <= n; i++) {
  const row = [];
  for (let j = 1; j <= m; j++) {
    row.push(String(i * j));
  }
  rows.push(row.join(' '));
}
process.stdout.write(rows.join('\\n'));
<<<MAKER_TS>>>
import { defineDataset, fmt } from 'genesis-kit';

type Input = { n: number; m: number };

export default defineDataset<Input>({
  solution: 'std.js',
  seed: 'fixed-seed',
  format: ({ n, m }) => fmt.line(n, m),
  cases: [
    {
      name: 'sample',
      input: { n: 3, m: 4 },
      output: fmt.line(12),
    },
    {
      name: 'random',
      generate: ({ g }) => ({ n: g.pick([2, 3, 4]), m: 5 }),
    },
  ],
});
`, 'utf8');

    let error: unknown = null;
    try {
      await runLocalAiMaker([
        'run',
        'examples/ai-maker.ts',
        '--statement',
        statementPath,
        '--name',
        'bad-lint',
        '--job-root',
        jobRoot,
        '--mock-response-file',
        responsePath,
        '--repair',
        '0',
      ]);
    } catch (caught) {
      error = caught;
    }

    const message = error instanceof Error ? error.message : String(error);
    expect(message).toMatch(/cases must not define output|g\.pick is not available/);
  });
});
