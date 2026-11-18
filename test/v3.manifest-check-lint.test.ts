import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkDataset,
  checkDatasetFromFile,
  defineDataset,
  fmt,
  generateDataset,
  generateDatasetFromFile,
  lintMakerSource,
} from '../src/index';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

const STD_JS = "const fs=require('node:fs'); process.stdout.write(fs.readFileSync(0,'utf8'));";

/** Build a self-contained dataset module next to a solution file. */
async function scaffoldModule(source: string): Promise<{ dir: string; makeFile: string }> {
  const dir = await makeTempDir('genesis-v3-');
  await fs.writeFile(path.join(dir, 'std.js'), STD_JS, 'utf8');
  const makeFile = path.join(dir, 'make.ts');
  await fs.writeFile(makeFile, source, 'utf8');
  return { dir, makeFile };
}

const indexUrl = () => pathToFileURL(path.join(process.cwd(), 'src/index.ts')).href;

describe('manifest v3 layout', () => {
  test('stores portable relative paths and source fingerprints', async () => {
    const { dir, makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'layout',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 5 } }],
});
`);

    const result = await generateDatasetFromFile(makeFile);
    const manifest = result.manifest!;

    expect(manifest.version).toBe(3);
    expect(manifest.pathBase).toBe('manifest');
    expect(manifest.dataset.modulePath).toBe('make.ts');
    expect(manifest.dataset.solution).toBe('std.js');
    expect(manifest.dataset.outputDir).toBe('data');
    expect(manifest.dataset.manifestPath).toBe('data.manifest.json');
    expect(manifest.cases[0]!.input?.path).toBe('data/1.in');
    expect(manifest.cases[0]!.output?.path).toBe('data/1.out');

    expect(manifest.sources.maker?.path).toBe('make.ts');
    expect(manifest.sources.solution.path).toBe('std.js');
    expect(manifest.sources.maker?.sha256).toMatch(/^[a-f0-9]{64}$/);

    expect(manifest.execution?.runtime).toBeTruthy();
    expect(manifest.execution?.executablePath).toBe('std.js');
    expect(manifest.execution?.runArgs).not.toContain(path.join(dir, 'std.js'));

    // Nothing in the manifest may leak the machine-specific absolute path.
    const serialized = await fs.readFile(path.join(dir, 'data.manifest.json'), 'utf8');
    expect(serialized).not.toContain(dir);
  });

  test('fills replay with a relative output directory', async () => {
    const { dir, makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'replay',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }, { name: 'b', input: { n: 2 } }],
});
`);

    const { replayDatasetFromFile } = await import('../src/index');
    const result = await replayDatasetFromFile(makeFile, { caseNumber: 2 });

    expect(result.manifest?.replay).toMatchObject({
      caseNumber: 2,
      caseName: 'b',
      repeatIndex: 0,
      outputDir: '.',
    });
    expect(result.manifest?.replay?.outputDir).not.toContain(dir);
  });
});

describe('checkDataset drift detection', () => {
  test('reports ok right after generation', async () => {
    const { makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'drift-ok',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }, { name: 'b', input: { n: 2 } }],
});
`);

    await generateDatasetFromFile(makeFile);
    const report = await checkDatasetFromFile(makeFile);

    expect(report.status).toBe('ok');
    expect(report.issues).toEqual([]);
    expect(report.expectedCases).toBe(2);
    expect(report.recordedCases).toBe(2);
  });

  test('detects a maker edit without regenerating anything', async () => {
    const { makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'drift-maker',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }],
});
`);

    await generateDatasetFromFile(makeFile);
    await fs.appendFile(makeFile, '\n// edited\n', 'utf8');

    const report = await checkDatasetFromFile(makeFile);
    expect(report.status).toBe('stale');
    expect(report.issues.map(issue => issue.code)).toContain('source-drift');
    expect(report.issues.find(issue => issue.code === 'source-drift')?.message).toContain('maker module changed');
  });

  test('detects a hand edited output file', async () => {
    const { dir, makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'drift-out',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }],
});
`);

    await generateDatasetFromFile(makeFile);
    await fs.writeFile(path.join(dir, 'data', '1.out'), '99\n', 'utf8');

    const report = await checkDatasetFromFile(makeFile);
    expect(report.status).toBe('stale');
    expect(report.issues.map(issue => issue.code)).toContain('artifact-modified');
  });

  test('flags leftover numbered files as orphans', async () => {
    const { dir, makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'drift-orphan',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }],
});
`);

    await generateDatasetFromFile(makeFile);
    await fs.writeFile(path.join(dir, 'data', '9.in'), '1\n', 'utf8');

    const report = await checkDatasetFromFile(makeFile);
    const orphan = report.issues.find(issue => issue.code === 'orphan-artifact');
    expect(orphan?.severity).toBe('warning');
    expect(orphan?.path).toBe('data/9.in');
    // Warnings alone must not mark the dataset stale.
    expect(report.status).toBe('ok');
  });

  test('reports missing when there is no manifest', async () => {
    const { makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'no-manifest',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }],
});
`);

    const report = await checkDatasetFromFile(makeFile);
    expect(report.status).toBe('missing');
    expect(report.issues[0]?.code).toBe('manifest-missing');
  });
});

describe('case selection, resume and prune', () => {
  test('--only narrows the run without wiping the directory', async () => {
    const { dir, makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'only',
  format: ({ n }) => fmt.line(n),
  cases: [
    { name: 'a', input: { n: 1 } },
    { name: 'b', input: { n: 2 } },
    { name: 'c', input: { n: 3 } },
  ],
});
`);

    await generateDatasetFromFile(makeFile);
    const partial = await generateDatasetFromFile(makeFile, { caseSelector: { only: '2' } });

    expect(partial.executed.totalCases).toBe(1);
    // The manifest stays complete even though only one case ran.
    expect(partial.summary.totalCases).toBe(3);
    // Case 1 and 3 must survive a partial run.
    await expect(fs.stat(path.join(dir, 'data', '1.in'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(dir, 'data', '3.in'))).resolves.toBeTruthy();
  });

  test('--only accepts ranges and case names', async () => {
    const { makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'only-grammar',
  format: ({ n }) => fmt.line(n),
  cases: [
    { name: 'sample', input: { n: 1 } },
    { name: 'small', input: { n: 2 } },
    { name: 'big', input: { n: 3 } },
    { name: 'huge', input: { n: 4 } },
  ],
});
`);

    const range = await generateDatasetFromFile(makeFile, { caseSelector: { only: '2-3' } });
    expect(range.executed.totalCases).toBe(2);
    // No manifest existed yet, so only the selected cases could be recorded.
    expect(range.results.map(item => item.caseNumber)).toEqual([2, 3]);

    const named = await generateDatasetFromFile(makeFile, { caseSelector: { only: 'sample,huge' } });
    expect(named.executed.totalCases).toBe(2);
    expect(named.summary.totalCases).toBe(4);
  });

  test('--resume skips cases whose artifacts are still valid', async () => {
    const { makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'resume',
  format: ({ n }) => fmt.line(n),
  cases: [
    { name: 'a', input: { n: 1 } },
    { name: 'b', input: { n: 2 } },
  ],
});
`);

    await generateDatasetFromFile(makeFile);
    const resumed = await generateDatasetFromFile(makeFile, { resume: true });

    // Nothing is regenerated, but the manifest still describes both cases.
    expect(resumed.executed.totalCases).toBe(0);
    expect(resumed.executed.skipped).toBe(2);
    expect(resumed.summary.totalCases).toBe(2);
    expect(resumed.summary.succeeded).toBe(2);
    expect(resumed.results.map(item => item.caseNumber)).toEqual([1, 2]);
  });

  test('--resume re-runs everything when the maker changed', async () => {
    const { makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'resume-drift',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }, { name: 'b', input: { n: 2 } }],
});
`);

    await generateDatasetFromFile(makeFile);
    await fs.appendFile(makeFile, '\n// generator changed\n', 'utf8');

    const resumed = await generateDatasetFromFile(makeFile, { resume: true });
    // Editing the generator invalidates every case, so nothing may be reused.
    expect(resumed.executed.totalCases).toBe(2);
    expect(resumed.executed.skipped).toBe(0);
  });

  test('--prune removes numbered files that no declared case owns', async () => {
    const { dir, makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'prune',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }],
});
`);

    await fs.mkdir(path.join(dir, 'data'), { recursive: true });
    await fs.writeFile(path.join(dir, 'data', '7.in'), 'stale\n', 'utf8');
    await fs.writeFile(path.join(dir, 'data', '7.out'), 'stale\n', 'utf8');

    await generateDatasetFromFile(makeFile, { prune: true });

    await expect(fs.stat(path.join(dir, 'data', '7.in'))).rejects.toThrow();
    await expect(fs.stat(path.join(dir, 'data', '7.out'))).rejects.toThrow();
    await expect(fs.stat(path.join(dir, 'data', '1.in'))).resolves.toBeTruthy();
  });

  test('a partial run keeps the manifest free of false drift', async () => {
    const { makeFile } = await scaffoldModule(`
import { defineDataset, fmt } from ${JSON.stringify(indexUrl())};

export default defineDataset({
  solution: 'std.js',
  seed: 'partial-manifest',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }, { name: 'b', input: { n: 2 } }],
});
`);

    await generateDatasetFromFile(makeFile);
    const partial = await generateDatasetFromFile(makeFile, { caseSelector: { only: '1' }, resume: true });
    expect(partial.summary.totalCases).toBe(2);
    // Case 1 was already valid, case 2 was outside the selector: neither ran.
    expect(partial.executed.totalCases).toBe(0);
    expect(partial.executed.skipped).toBe(2);

    const report = await checkDatasetFromFile(makeFile);
    expect(report.status).toBe('ok');
  });
});

describe('AST lint', () => {
  test('does not mistake a destructured data field named g for the generator', () => {
    const issues = lintMakerSource(`
import { defineDataset, fmt } from 'genesis-kit';

export default defineDataset({
  solution: 'std.py',
  seed: 'x',
  format: ({ n, m, g }) => g.join(' '),
  cases: [{ name: 'a', input: { n: 1, m: 1, g: [1, 2] } }],
});
`, { expectedSolution: 'std.py' });

    expect(issues.filter(issue => issue.code === 'generator-method')).toEqual([]);
    expect(issues).toEqual([]);
  });

  test('still catches unknown generator methods inside generate, with a line number', () => {
    const source = `import { defineDataset, fmt } from 'genesis-kit';

export default defineDataset({
  solution: 'std.py',
  seed: 'x',
  format: ({ n }) => fmt.line(n),
  cases: [
    {
      name: 'a',
      generate: ({ g }) => ({ n: g.notARealMethod(1, 9) }),
    },
  ],
});
`;
    const issues = lintMakerSource(source, { expectedSolution: 'std.py' });
    const target = issues.find(issue => issue.code === 'generator-method');
    expect(target).toBeDefined();
    expect(target?.message).toContain('g.notARealMethod');
    expect(target?.line).toBe(10);
  });

  test('catches unknown fmt methods and suggests the available surface', () => {
    const issues = lintMakerSource(`
import { defineDataset, fmt } from 'genesis-kit';
export default defineDataset({
  solution: 'std.py',
  seed: 'x',
  format: ({ n }) => fmt.notAThing(n),
  cases: [{ name: 'a', input: { n: 1 } }],
});
`, { expectedSolution: 'std.py' });

    const target = issues.find(issue => issue.code === 'fmt-method');
    expect(target?.message).toContain('fmt.notAThing');
    expect(target?.message).toContain('fmt.line');
  });

  test('reports forbidden imports, legacy syntax and missing exports', () => {
    const issues = lintMakerSource(`
import { defineDataset, fmt } from 'genesis-kit';
import { readFileSync } from 'node:fs';
const G = {};
export const config = { g: G };
`);
    const codes = issues.map(issue => issue.code);
    expect(codes).toContain('import-rule');
    expect(codes).toContain('dataset-shape');
  });

  test('detects g.pick and the legacy fmt template tag', () => {
    const issues = lintMakerSource(`
import { defineDataset, fmt } from 'genesis-kit';
export default defineDataset({
  solution: 'std.py',
  seed: 'x',
  format: ({ n }) => fmt\`\${n}\`,
  cases: [{ name: 'a', generate: ({ g }) => ({ n: g.pick([1, 2]) }) }],
});
`);
    const codes = issues.map(issue => issue.code);
    expect(codes).toContain('legacy-fmt');
    expect(codes).toContain('legacy-generator');
  });

  test('accepts the whole fmt surface including the v3 helpers', () => {
    const issues = lintMakerSource(`
import { defineDataset, fmt } from 'genesis-kit';
export default defineDataset({
  solution: 'std.py',
  seed: 'x',
  format: ({ rows }) => fmt.rows(rows, { header: [rows.length] }),
  cases: [{ name: 'a', input: { rows: [[1, 2]] } }],
});
`, { expectedSolution: 'std.py' });
    expect(issues).toEqual([]);
  });

  test('flags a solution name that does not match the expected file', () => {
    const issues = lintMakerSource(`
import { defineDataset, fmt } from 'genesis-kit';
export default defineDataset({
  solution: 'solution.cpp',
  seed: 'x',
  format: ({ n }) => fmt.line(n),
  cases: [{ name: 'a', input: { n: 1 } }],
});
`, { expectedSolution: 'std.py' });
    expect(issues.map(issue => issue.code)).toContain('solution');
  });
});
