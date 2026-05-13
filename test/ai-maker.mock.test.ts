import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';

const fixtureNames = [
  'arithmetic-matrix',
  'balanced-sequence',
  'interval-union',
  'multiple-of-all',
  'tree-max-degree',
] as const;

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

      const result = await execa(process.execPath, [
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
      ], {
        cwd: process.cwd(),
      });

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

  test('rejects generic seeds and identical-branch ternaries in AI output', async () => {
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
  validate: ({ n, m }) => (n > 0 && m > 0) ? true : true,
  cases: [
    { name: 'sample', input: { n: 3, m: 4 } },
  ],
});
`, 'utf8');

    let error: unknown = null;
    try {
      await execa(process.execPath, [
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
      ], {
        cwd: process.cwd(),
      });
    } catch (caught) {
      error = caught;
    }

    const message = error instanceof Error ? error.message : String(error);
    expect(message).toMatch(/descriptive, not a generic value like fixed-seed|identical branches/);
  });
});
