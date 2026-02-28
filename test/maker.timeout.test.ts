import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GenesisMaker } from '../src/maker';

describe('GenesisMaker runTimeoutMs', () => {
  let tmpDir: string;
  let stdFile: string;
  let defaultOutDir: string;
  let timeoutOutDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(process.cwd(), '.tmp-maker-timeout-'));
    stdFile = path.join(tmpDir, 'std.js');
    defaultOutDir = path.relative(process.cwd(), path.join(tmpDir, 'out-default'));
    timeoutOutDir = path.relative(process.cwd(), path.join(tmpDir, 'out-timeout'));

    const delayedScript = [
      "const fs=require('node:fs');",
      "const input=fs.readFileSync(0,'utf8');",
      "setTimeout(()=>{process.stdout.write((input.trim()||'0')+'\\n');},50);",
    ].join('\n');

    await fs.writeFile(stdFile, delayedScript, 'utf8');
  });

  afterAll(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('uses default timeout when runTimeoutMs is not configured', async () => {
    const maker = new GenesisMaker()
      .configure({
        solution: stdFile,
        outputDir: defaultOutDir,
      })
      .case(() => [[123]]);

    await maker.generate();

    const outPath = path.join(process.cwd(), defaultOutDir, '1.out');
    const output = await fs.readFile(outPath, 'utf8');
    expect(output.trim()).toBe('123');
  });

  test('stops writing .out when runTimeoutMs is too small', async () => {
    const maker = new GenesisMaker()
      .configure({
        solution: stdFile,
        outputDir: timeoutOutDir,
        runTimeoutMs: 10,
      })
      .case(() => [[456]]);

    await maker.generate();

    const inPath = path.join(process.cwd(), timeoutOutDir, '1.in');
    const outPath = path.join(process.cwd(), timeoutOutDir, '1.out');

    await fs.access(inPath);
    await expect(fs.access(outPath)).rejects.toThrow();
  });
});
