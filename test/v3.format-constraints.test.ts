import { describe, expect, test } from 'bun:test';
import { checkConstraints, fmt, normalizeFormat, renderFormatDocument } from '../src/index';

const render = (node: Parameters<typeof renderFormatDocument>[0]) => renderFormatDocument(node);

describe('fmt sequence primitives', () => {
  test('seq joins nodes with a custom separator', () => {
    const document = fmt.seq([fmt.line(1, 2), fmt.line(3, 4)], '\n\n');
    expect(render(document)).toBe('1 2\n\n3 4');
  });

  test('block separates records with one blank line', () => {
    const document = fmt.block(fmt.line('case-a'), fmt.line('case-b'), fmt.line('case-c'));
    expect(render(document)).toBe('case-a\n\ncase-b\n\ncase-c');
  });

  test('nested seq keeps inner and outer separators independent', () => {
    const document = fmt.block(
      fmt.seq([fmt.line(3), fmt.line(1, 0, 1)], '\n'),
      fmt.seq([fmt.line(2), fmt.line(0, 0)], '\n'),
    );
    expect(render(document)).toBe('3\n1 0 1\n\n2\n0 0');
  });
});

describe('fmt row helpers', () => {
  test('rows renders header plus matrix', () => {
    const node = fmt.rows([[1, 2], [3, 4]], { header: [2, 2] });
    expect(render(node)).toBe('2 2\n1 2\n3 4');
  });

  test('rows without header renders only the matrix', () => {
    expect(render(fmt.rows([[1, 2], [3, 4]]))).toBe('1 2\n3 4');
  });

  test('rows honours custom separators', () => {
    expect(render(fmt.rows([[1, 2], [3, 4]], { sep: ',', rowSep: ';' }))).toBe('1,2;3,4');
  });

  test('flat renders one line holding every value', () => {
    expect(render(fmt.flat([5, 4, 3, 2, 1]))).toBe('5 4 3 2 1');
  });

  test('tuple renders parenthesised pairs without spaces', () => {
    expect(render(fmt.tuple(3, 1))).toBe('(3,1)');
  });

  test('join renders an arbitrary separator', () => {
    expect(render(fmt.join('', '(', 3, ',', 1, ')'))).toBe('(3,1)');
    expect(render(fmt.join('-', 'a', 'b', 'c'))).toBe('a-b-c');
  });

  test('table supports empty atom separator for grid-like rows', () => {
    expect(render(fmt.table([['.', '#'], ['#', '.']], { sep: '' }))).toBe('.#\n#.');
  });

  test('normalizeFormat accepts a bare seq node', () => {
    expect(normalizeFormat(fmt.block(fmt.line(1), fmt.line(2))).nodes).toHaveLength(1);
  });
});

describe('declarative constraints', () => {
  const input = {
    n: 3,
    m: 2,
    edges: [
      [1, 2],
      [2, 3],
    ],
  };

  test('accepts valid input', () => {
    expect(checkConstraints(input, {
      n: { int: true, min: 1, max: 10 },
      m: { int: true, eq: 'edges.length' },
      'edges[*][0]': { int: true, min: 1, ref: 'n' },
      'edges[*][1]': { int: true, min: 1, ref: 'n' },
    })).toBeNull();
  });

  test('reports range violations with the resolved path', () => {
    const message = checkConstraints({ ...input, edges: [[1, 2], [2, 9]] }, {
      'edges[*][1]': { int: true, min: 1, ref: 'n' },
    });
    expect(message).toBe('edges[1][1] = 9 exceeds maximum n=3');
  });

  test('rejects non-integers', () => {
    expect(checkConstraints({ n: 2.5 }, { n: { int: true } })).toBe('n must be an integer, got 2.5');
  });

  test('checks array length against a referenced field', () => {
    expect(checkConstraints(input, { edges: { len: 'm' } })).toBeNull();
    expect(checkConstraints({ ...input, m: 5 }, { edges: { len: 'm' } })).toBe('edges length must be 5, got 2');
  });

  test('checks scalar equality against a referenced field', () => {
    expect(checkConstraints({ a: 2, b: 2 }, { a: { eq: 'b' } })).toBeNull();
    expect(checkConstraints({ a: 3, b: 2 }, { a: { eq: 'b' } })).toBe('a must equal b=2, got 3');
  });

  test('enforces oneOf membership', () => {
    expect(checkConstraints({ op: 'Q' }, { op: { oneOf: ['Q', 'C'] } })).toBeNull();
    expect(checkConstraints({ op: 'X' }, { op: { oneOf: ['Q', 'C'] } })).toBe(
      'op must be one of [Q, C], got "X"',
    );
  });

  test('reports unresolved paths instead of silently passing', () => {
    expect(checkConstraints({ n: 1 }, { 'missing[0]': { int: true } })).toBe(
      "constraint 'missing[0]' did not resolve to any value",
    );
  });

  test('supports minLen / maxLen bounds', () => {
    expect(checkConstraints({ edges: [] }, { edges: { minLen: 1 } })).toBe(
      'edges length 0 is below minimum 1',
    );
    expect(checkConstraints({ edges: [1, 2, 3] }, { edges: { maxLen: 2 } })).toBe(
      'edges length 3 exceeds maximum 2',
    );
    expect(checkConstraints({ edges: [1, 2] }, { edges: { minLen: 1, maxLen: 2 } })).toBeNull();
  });

  test('treats a wildcard over an empty array as vacuously satisfied', () => {
    expect(checkConstraints({ ans: [] }, { 'ans[*]': { oneOf: [0, 1] } })).toBeNull();
  });

  test('still reports a missing collection behind a wildcard', () => {
    expect(checkConstraints({ other: [] }, { 'ans[*]': { oneOf: [0, 1] } })).toBe(
      "constraint 'ans[*]' did not resolve to any value",
    );
  });

  test('reports dangling references', () => {
    expect(checkConstraints({ a: 1 }, { a: { ref: 'nope' } })).toBe(
      "constraint 'a' references unknown field 'nope'",
    );
  });
});

describe('new APIs end to end', () => {
  test('generates input from fmt.rows and enforces constraints before the solution runs', async () => {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { defineDataset, generateDataset, validateDataset } = await import('../src/index');

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), '.tmp-v3-dataset-'));
    const solutionPath = path.join(tmpDir, 'std.js');
    await fs.writeFile(
      solutionPath,
      "const fs=require('node:fs'); process.stdout.write(fs.readFileSync(0,'utf8'));",
      'utf8',
    );

    try {
      const outputDir = path.relative(process.cwd(), path.join(tmpDir, 'data'));
      const dataset = defineDataset<{ n: number; m: number; edges: number[][] }>({
        solution: solutionPath,
        outputDir,
        seed: 'v3-demo',
        constraints: {
          n: { int: true, min: 1, max: 1000 },
          m: { int: true, eq: 'edges.length' },
          'edges[*][0]': { int: true, min: 1, ref: 'n' },
          'edges[*][1]': { int: true, min: 1, ref: 'n' },
        },
        format: ({ n, edges }) => fmt.rows(edges, { header: [n, edges.length] }),
        cases: [{ name: 'sample', input: { n: 3, m: 2, edges: [[1, 2], [2, 3]] } }],
      });

      const result = await generateDataset(dataset);
      expect(result.summary).toMatchObject({ totalCases: 1, failed: 0 });
      expect(await fs.readFile(path.join(process.cwd(), outputDir, '1.in'), 'utf8'))
        .toBe('3 2\n1 2\n2 3');

      const broken = defineDataset<{ n: number; m: number; edges: number[][] }>({
        solution: solutionPath,
        outputDir,
        seed: 'v3-demo',
        constraints: { 'edges[*][1]': { int: true, min: 1, ref: 'n' } },
        format: ({ n, edges }) => fmt.rows(edges, { header: [n, edges.length] }),
        cases: [{ name: 'bad', input: { n: 3, m: 1, edges: [[1, 9]] } }],
      });

      const validation = await validateDataset(broken);
      expect(validation.summary.failed).toBe(1);
      expect(validation.results[0]?.error?.message).toContain('edges[0][1] = 9 exceeds maximum n=3');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
