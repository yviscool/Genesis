import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  defineDataset,
  fmt,
  generateDataset,
  generateDatasetFromFile,
  loadDatasetFromFile,
  replayDataset,
  validateDataset,
} from '../src/index';
import { handleInit } from '../src/cli/init';

describe('Genesis v2 dataset runner', () => {
  let tmpDir: string;
  let stdFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(process.cwd(), '.tmp-v2-dataset-'));
    stdFile = path.join(tmpDir, 'std.js');
    await fs.writeFile(
      stdFile,
      "const fs=require('node:fs'); process.stdout.write(fs.readFileSync(0,'utf8'));",
      'utf8',
    );
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('validates without deleting output data or touching the solution', async () => {
    const outputDir = path.relative(process.cwd(), path.join(tmpDir, 'dry-data'));
    const sentinel = path.join(process.cwd(), outputDir, 'sentinel.txt');
    await fs.mkdir(path.dirname(sentinel), { recursive: true });
    await fs.writeFile(sentinel, 'keep', 'utf8');

    const dataset = defineDataset<{ n: number }>({
      solution: 'missing-solution.cpp',
      outputDir,
      seed: 'dry-run',
      format: ({ n }) => fmt.line(n),
      validate: ({ n }) => n > 0 || 'n must be positive',
      cases: [{ name: 'ok', input: { n: 1 } }],
    });

    const result = await validateDataset(dataset);

    expect(result.summary).toMatchObject({ totalCases: 1, succeeded: 1, failed: 0 });
    expect(await fs.readFile(sentinel, 'utf8')).toBe('keep');
    await expect(fs.stat(path.join(tmpDir, 'dry-data.manifest.json'))).rejects.toThrow();
  });

  test('generates files and manifest v2 with deterministic case seeds', async () => {
    const firstOut = path.relative(process.cwd(), path.join(tmpDir, 'data-a'));
    const secondOut = path.relative(process.cwd(), path.join(tmpDir, 'data-b'));
    const makeDataset = (outputDir: string) => defineDataset<{ n: number; a: number[] }>({
      solution: stdFile,
      outputDir,
      seed: 'fixed-root',
      format: ({ n, a }) => fmt.lines(fmt.line(n), fmt.line(...a)),
      validate: ({ n, a }) => a.length === n || 'a.length mismatch',
      cases: [
        { name: 'static', input: { n: 1, a: [7] } },
        {
          name: 'random',
          repeat: 2,
          generate: ({ g }) => {
            const n = 5;
            return { n, a: g.array(n, () => g.int(1, 100)) };
          },
        },
      ],
    });

    const first = await generateDataset(makeDataset(firstOut));
    const second = await generateDataset(makeDataset(secondOut));

    expect(first.manifest?.version).toBe(2);
    expect(Object.keys(first.manifest ?? {})).toEqual([
      'version',
      'tool',
      'generatedAt',
      'dataset',
      'execution',
      'replay',
      'summary',
      'cases',
    ]);
    expect(first.manifest?.tool).toMatchObject({ name: 'genesis-kit' });
    expect(first.manifest?.execution?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.summary).toMatchObject({ totalCases: 3, succeeded: 3, failed: 0 });
    expect(first.results.map(item => item.seed).every(Boolean)).toBe(true);
    expect(first.results[1].seed).not.toBe(first.results[2].seed);

    expect(await fs.readFile(path.join(process.cwd(), firstOut, '1.in'), 'utf8')).toBe('1\n7');
    expect(await fs.readFile(path.join(process.cwd(), firstOut, '1.out'), 'utf8')).toBe('1\n7');
    expect(await fs.readFile(path.join(process.cwd(), firstOut, '2.in'), 'utf8'))
      .toBe(await fs.readFile(path.join(process.cwd(), secondOut, '2.in'), 'utf8'));
    expect(await fs.readFile(path.join(process.cwd(), firstOut, '3.in'), 'utf8'))
      .toBe(await fs.readFile(path.join(process.cwd(), secondOut, '3.in'), 'utf8'));
  });

  test('preserves the reference output trailing newline byte', async () => {
    const outputDir = path.relative(process.cwd(), path.join(tmpDir, 'newline-data'));
    await fs.writeFile(stdFile, "process.stdout.write('ok\\n');", 'utf8');

    const dataset = defineDataset<{ n: number }>({
      solution: stdFile,
      outputDir,
      seed: 'newline-output',
      format: ({ n }) => fmt.line(n),
      cases: [{ name: 'sample', input: { n: 1 } }],
    });

    const result = await generateDataset(dataset);

    expect(result.summary).toMatchObject({ totalCases: 1, succeeded: 1, failed: 0 });
    expect(await fs.readFile(path.join(process.cwd(), outputDir, '1.out'), 'utf8')).toBe('ok\n');
  });

  test('streams large reference outputs to disk', async () => {
    const outputDir = path.relative(process.cwd(), path.join(tmpDir, 'huge-data'));
    await fs.writeFile(stdFile, `
const chunk = 'x'.repeat(65536);
let remaining = 100_500_000;

function flush() {
  while (remaining > 0) {
    const size = Math.min(remaining, chunk.length);
    remaining -= size;
    if (!process.stdout.write(size === chunk.length ? chunk : chunk.slice(0, size))) {
      process.stdout.once('drain', flush);
      return;
    }
  }
}

flush();
`, 'utf8');

    const dataset = defineDataset<{ n: number }>({
      solution: stdFile,
      outputDir,
      seed: 'large-output',
      format: ({ n }) => fmt.line(n),
      cases: [{ name: 'huge', input: { n: 1 } }],
    });

    const result = await generateDataset(dataset);
    expect(result.summary).toMatchObject({ totalCases: 1, succeeded: 1, failed: 0 });
    expect(result.results[0].error).toBeNull();

    const outPath = path.join(process.cwd(), outputDir, '1.out');
    const stat = await fs.stat(outPath);

    expect(stat.size).toBeGreaterThan(100_000_000);
    expect(result.results[0].output?.bytes).toBe(stat.size);
  }, 20000);

  test('replays one generated case with the original case seed', async () => {
    const outputDir = path.relative(process.cwd(), path.join(tmpDir, 'base-data'));
    const replayDir = path.relative(process.cwd(), path.join(tmpDir, 'replay-data'));
    const dataset = defineDataset<{ n: number; a: number[] }>({
      solution: stdFile,
      outputDir,
      seed: 'replay-root',
      format: ({ n, a }) => fmt.lines([n], a),
      cases: [
        { name: 'sample', input: { n: 1, a: [1] } },
        {
          name: 'random',
          repeat: 3,
          generate: ({ g }) => {
            const n = 6;
            return { n, a: g.array(n, () => g.int(1, 1000)) };
          },
        },
      ],
    });

    await generateDataset(dataset);
    const sentinel = path.join(process.cwd(), outputDir, 'sentinel.txt');
    await fs.writeFile(sentinel, 'keep', 'utf8');
    const replay = await replayDataset(dataset, { caseNumber: 3, outputDir: replayDir });

    expect(replay.summary).toMatchObject({ totalCases: 1, succeeded: 1, failed: 0 });
    expect(replay.manifest?.replay).toMatchObject({ caseNumber: 3, caseName: 'random', repeatIndex: 1 });
    expect(await fs.readFile(sentinel, 'utf8')).toBe('keep');
    expect(await fs.readFile(path.join(process.cwd(), replayDir, '3.in'), 'utf8'))
      .toBe(await fs.readFile(path.join(process.cwd(), outputDir, '3.in'), 'utf8'));
  });

  test('rejects unsafe output directories before cleaning', async () => {
    const makeDataset = (outputDir: string) => defineDataset<{ n: number }>({
      solution: stdFile,
      outputDir,
      seed: 'unsafe-output',
      format: ({ n }) => fmt.line(n),
      cases: [{ name: 'ok', input: { n: 1 } }],
    });

    await expect(generateDataset(makeDataset('.'))).rejects.toThrow(/Safety check failed/);
    await expect(generateDataset(makeDataset('src'))).rejects.toThrow(/Safety check failed/);
    await expect(generateDataset(makeDataset('.git'))).rejects.toThrow(/Safety check failed/);
    await expect(generateDataset(makeDataset('../genesis-outside-data'))).rejects.toThrow(/Safety check failed/);
  });

  test('records validation failures before writing artifacts', async () => {
    const outputDir = path.relative(process.cwd(), path.join(tmpDir, 'bad-data'));
    const dataset = defineDataset<{ n: number }>({
      solution: stdFile,
      outputDir,
      seed: 123,
      format: ({ n }) => fmt.line(n),
      validate: () => 'invalid by design',
      cases: [{ name: 'bad', input: { n: 0 } }],
    });

    const result = await generateDataset(dataset);

    expect(result.summary).toMatchObject({ totalCases: 1, succeeded: 0, failed: 1 });
    expect(result.results[0].error).toMatchObject({ phase: 'validate', kind: 'validation' });
    expect(await fs.readdir(path.join(process.cwd(), outputDir))).toEqual([]);
  });

  test('loads a default-export dataset module', async () => {
    const makeFile = path.join(tmpDir, 'make.ts');
    await fs.writeFile(makeFile, `
import { defineDataset, fmt } from '../src/index';

export default defineDataset({
  solution: 'not-used.js',
  outputDir: 'data',
  seed: 'loader',
  format: ({ value }) => fmt.line(value),
  cases: [{ name: 'loaded', input: { value: 42 } }],
});
`, 'utf8');

    const dataset = await loadDatasetFromFile(makeFile);
    const result = await validateDataset(dataset);

    expect(result.summary).toMatchObject({ totalCases: 1, succeeded: 1, failed: 0 });
    expect(result.results[0].name).toBe('loaded');
  });

  test('generates a dataset module with paths relative to the module file even outside cwd', async () => {
    const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), 'genesis-v2-external-'));
    const makeFile = path.join(externalDir, 'make.ts');
    const externalStdFile = path.join(externalDir, 'std.js');
    const indexUrl = pathToFileURL(path.join(process.cwd(), 'src/index.ts')).href;

    try {
      await fs.writeFile(externalStdFile, "process.stdout.write('99');", 'utf8');
      await fs.writeFile(makeFile, `
import { defineDataset, fmt } from ${JSON.stringify(indexUrl)};

export default defineDataset({
  solution: 'std.js',
  outputDir: 'module-data',
  seed: 'module-paths',
  format: ({ value }) => fmt.line(value),
  cases: [{ name: 'loaded', input: { value: 99 } }],
});
`, 'utf8');

      const result = await generateDatasetFromFile(makeFile);

      expect(result.summary).toMatchObject({ totalCases: 1, succeeded: 1, failed: 0 });
      expect(await fs.readFile(path.join(externalDir, 'module-data', '1.in'), 'utf8')).toBe('99');
      expect(result.manifest?.dataset.modulePath).toBe(makeFile.replaceAll(path.sep, '/'));
    } finally {
      await fs.rm(externalDir, { recursive: true, force: true });
    }
  });

  test('init writes the v2 dataset template', async () => {
    const targetDir = path.join(tmpDir, 'init-cpp');

    await handleInit(targetDir, { lang: 'cpp', force: true, interactive: false, ai: true });

    const makeTs = await fs.readFile(path.join(targetDir, 'make.ts'), 'utf8');
    expect(makeTs).toContain('defineDataset');
    expect(makeTs).toContain('fmt.line');
    expect(makeTs).not.toContain('Maker');
    await expect(fs.stat(path.join(targetDir, 'std.cpp'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(targetDir, 'check.ts'))).rejects.toThrow();
  });

  test('manifest schema documents the v2 contract', async () => {
    const schema = JSON.parse(await fs.readFile(path.join(process.cwd(), 'manifest.schema.json'), 'utf8'));

    expect(schema.title).toBe('Genesis Dataset Manifest v2');
    expect(schema.properties.version.const).toBe(2);
    expect(schema.required).toEqual([
      'version',
      'tool',
      'generatedAt',
      'dataset',
      'execution',
      'replay',
      'summary',
      'cases',
    ]);
    expect(schema.$defs.case.required).toContain('seed');
    expect(schema.$defs.case.required).toContain('phases');
  });
});
