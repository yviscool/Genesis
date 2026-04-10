import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { formatData, writeFormattedData } from '../src/formatter';

describe('formatter streaming writer', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'genesis-formatter-stream-'));
  });

  afterAll(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('writes the same output as formatData without building stdin twice', async () => {
    const filePath = path.join(tmpDir, 'case.in');
    const data = [
      [3, 2],
      [[1, 2], [3, 4], [5, 6]],
      'done',
    ];

    const expected = formatData(data);
    const written = await writeFormattedData(filePath, data);
    const actual = await fs.readFile(filePath, 'utf8');

    expect(actual).toBe(expected);
    expect(written.bytesWritten).toBe(Buffer.byteLength(expected));
  });
});
