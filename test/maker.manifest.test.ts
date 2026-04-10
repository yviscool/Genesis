import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GenesisMaker } from '../src/maker';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function toRelativePosix(targetPath: string): string {
  return path.relative(process.cwd(), targetPath).split(path.sep).join('/');
}

describe('GenesisMaker manifest output', () => {
  let tmpDir: string;
  let stdFile: string;
  let successOutDir: string;
  let validationFailOutDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(process.cwd(), '.tmp-maker-manifest-'));
    stdFile = path.join(tmpDir, 'std.js');
    successOutDir = path.relative(process.cwd(), path.join(tmpDir, 'out-success'));
    validationFailOutDir = path.relative(process.cwd(), path.join(tmpDir, 'out-validation-fail'));

    const echoScript = [
      "const fs=require('node:fs');",
      "const input=fs.readFileSync(0,'utf8');",
      "process.stdout.write(input);",
    ].join('\n');

    await fs.writeFile(stdFile, echoScript, 'utf8');
  });

  afterAll(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('writes machine-readable manifest for successful cases', async () => {
    const maker = new GenesisMaker()
      .configure({
        solution: stdFile,
        outputDir: successOutDir,
      })
      .validate((data, context) => {
        expect(Array.isArray(data)).toBe(true);
        expect(context.caseNumber).toBe(1);
        expect(context.label).toBe('sample');
        expect(context.tags).toEqual(['sample', 'small']);
        return true;
      })
      .case({ label: 'sample', tags: ['sample', 'small', 'sample'] }, () => [[123, 456]]);

    const loggedLines: string[] = [];
    const originalConsoleLog = console.log;
    console.log = (...args: unknown[]) => {
      loggedLines.push(args.join(' '));
    };
    try {
      await maker.generate();
    } finally {
      console.log = originalConsoleLog;
    }

    const inPath = path.join(process.cwd(), successOutDir, '1.in');
    const outPath = path.join(process.cwd(), successOutDir, '1.out');
    const manifestPath = path.join(tmpDir, 'out-success.manifest.json');
    const inText = await fs.readFile(inPath, 'utf8');
    const outText = await fs.readFile(outPath, 'utf8');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

    expect(manifest.version).toBe(1);
    expect(manifest.summary.totalCases).toBe(1);
    expect(manifest.summary.succeeded).toBe(1);
    expect(manifest.summary.failed).toBe(0);
    expect(manifest.config.validatorConfigured).toBe(true);
    expect(manifest.config.manifestPath).toBe(toRelativePosix(manifestPath));
    expect(loggedLines).toContain(`Manifest: ${toRelativePosix(manifestPath)}`);
    expect(loggedLines).toContain(`GENESIS_MANIFEST=${manifestPath}`);

    const caseRecord = manifest.cases[0];
    expect(caseRecord.caseId).toBe(1);
    expect(caseRecord.caseNumber).toBe(1);
    expect(caseRecord.label).toBe('sample');
    expect(caseRecord.tags).toEqual(['sample', 'small']);
    expect(caseRecord.seed).toBeNull();
    expect(caseRecord.status).toBe('success');
    expect(caseRecord.runtimeMs).toBeGreaterThanOrEqual(0);
    expect(caseRecord.input).toEqual({
      path: toRelativePosix(inPath),
      sha256: sha256(inText),
      bytes: Buffer.byteLength(inText),
      lines: 1,
    });
    expect(caseRecord.output).toEqual({
      path: toRelativePosix(outPath),
      sha256: sha256(outText),
      bytes: Buffer.byteLength(outText),
    });
    expect(caseRecord.validator.status).toBe('passed');
    expect(caseRecord.error).toBeNull();
  });

  test('records validation failures in manifest', async () => {
    const maker = new GenesisMaker()
      .configure({
        solution: stdFile,
        outputDir: validationFailOutDir,
      })
      .validate(() => 'n must be positive')
      .case({ label: 'invalid', tags: ['invalid'] }, () => [[0]]);

    await maker.generate();

    const inPath = path.join(process.cwd(), validationFailOutDir, '1.in');
    const outPath = path.join(process.cwd(), validationFailOutDir, '1.out');
    const manifestPath = path.join(tmpDir, 'out-validation-fail.manifest.json');
    const inText = await fs.readFile(inPath, 'utf8');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

    await expect(fs.access(outPath)).rejects.toThrow();

    expect(manifest.summary.totalCases).toBe(1);
    expect(manifest.summary.succeeded).toBe(0);
    expect(manifest.summary.failed).toBe(1);

    const caseRecord = manifest.cases[0];
    expect(caseRecord.status).toBe('failure');
    expect(caseRecord.label).toBe('invalid');
    expect(caseRecord.tags).toEqual(['invalid']);
    expect(caseRecord.output).toBeNull();
    expect(caseRecord.input).toEqual({
      path: toRelativePosix(inPath),
      sha256: sha256(inText),
      bytes: Buffer.byteLength(inText),
      lines: 1,
    });
    expect(caseRecord.validator.status).toBe('failed');
    expect(caseRecord.validator.reason).toBe('n must be positive');
    expect(caseRecord.error).toEqual({
      kind: 'validation',
      message: 'n must be positive',
    });
  });
});
