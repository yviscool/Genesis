import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GenesisChecker } from '../src/checker';

describe('GenesisChecker parallel workers', () => {
  let tmpDir: string;
  let stdFile: string;
  let targetFile: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'genesis-checker-parallel-'));
    stdFile = path.join(tmpDir, 'std.js');
    targetFile = path.join(tmpDir, 'target.js');

    // Each run intentionally waits so the speed-up from multiple workers is measurable.
    const delayedScript = `const fs=require('node:fs');\nconst n=Number(fs.readFileSync(0,'utf8').trim()||0);\nsetTimeout(()=>{console.log(n*2)},20);`;
    await fs.writeFile(stdFile, delayedScript, 'utf8');
    await fs.writeFile(targetFile, delayedScript, 'utf8');
  });

  afterAll(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('runs faster with multiple workers', async () => {
    const runWithWorkers = async (workers: number): Promise<number> => {
      const checker = new GenesisChecker()
        .configure({
          std: stdFile,
          target: targetFile,
          compareMode: 'exact',
          workers,
        })
        .gen(() => [[1]]);

      const startedAt = Date.now();
      await checker.run(8);
      return Date.now() - startedAt;
    };

    const serialDuration = await runWithWorkers(1);
    const parallelDuration = await runWithWorkers(4);

    expect(parallelDuration).toBeLessThan(serialDuration * 0.75);
  }, 10000);
});
