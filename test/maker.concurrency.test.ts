import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GenesisMaker } from '../src/maker';

describe('GenesisMaker concurrency controls', () => {
  let tmpDir: string;
  let stdFile: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(process.cwd(), '.tmp-maker-concurrency-'));
    stdFile = path.join(tmpDir, 'std.js');

    const delayedScript = [
      "const fs=require('node:fs');",
      "const input=fs.readFileSync(0,'utf8').trim()||'0';",
      "setTimeout(()=>{process.stdout.write(input+'\\n');},40);",
    ].join('\n');

    await fs.writeFile(stdFile, delayedScript, 'utf8');
  });

  afterAll(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('caseConcurrency limits generation workers', async () => {
    const runWithConcurrency = async (caseConcurrency: number, outputDirName: string): Promise<number> => {
      const outputDir = path.relative(process.cwd(), path.join(tmpDir, outputDirName));
      const maker = new GenesisMaker()
        .configure({
          solution: stdFile,
          outputDir,
          caseConcurrency,
        });

      for (let index = 0; index < 8; index++) {
        maker.case(() => [[index + 1]]);
      }

      const startedAt = Date.now();
      await maker.generate();
      return Date.now() - startedAt;
    };

    const serialDuration = await runWithConcurrency(1, 'out-serial');
    const parallelDuration = await runWithConcurrency(4, 'out-parallel');

    expect(parallelDuration).toBeLessThan(serialDuration * 0.75);
  });
});
