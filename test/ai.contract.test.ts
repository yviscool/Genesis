import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildAiContractGeneratedData } from '../src/ai-contract-builder';
import { AI_CONTRACT_GENERATED } from '../src/ai-contract.generated';
import {
  AI_BASE_METHOD_SIGNATURES,
  AI_CHARSET_PROPERTIES,
  AI_FMT_METHOD_SIGNATURES,
  AI_GENERATOR_METHOD_SIGNATURES,
  renderAiGenesisContractDts,
  selectAiContract,
} from '../src/ai-contract';
import { fmt } from '../src/format';
import { createGenerator } from '../src/generator/factory';

describe('Genesis AI contract', () => {
  test('keeps generated contract metadata in sync with fresh declaration emit', () => {
    expect(AI_CONTRACT_GENERATED).toEqual(buildAiContractGeneratedData());
  });

  test('keeps fmt spec coverage aligned with the public runtime API', () => {
    expect(Object.keys(AI_FMT_METHOD_SIGNATURES).sort()).toEqual(Object.keys(fmt).sort());
  });

  test('keeps generator spec coverage aligned with the public runtime API', () => {
    const generatorKeys = Object.keys(createGenerator('seed')).sort();
    const documentedKeys = [
      ...Object.keys(AI_GENERATOR_METHOD_SIGNATURES),
      'CHARSET',
      'base',
    ].sort();

    expect(generatorKeys).toEqual(documentedKeys);

    expect(Object.keys(AI_BASE_METHOD_SIGNATURES).sort()).toEqual(['binToHex', 'convert', 'digits', 'hexToBin']);
    expect(Object.keys(AI_CHARSET_PROPERTIES).sort()).toEqual([
      'ALPHA',
      'ALPHANUMERIC',
      'BASE36',
      'DIGITS',
      'LOWERCASE',
      'UPPERCASE',
    ]);
  });

  test('keeps problem-profile hints while exposing the full runtime contract', async () => {
    const statementPath = path.join(process.cwd(), 'test', 'fixtures', 'ai-maker', 'arithmetic-matrix', 'problem.md');
    const statement = await fs.readFile(statementPath, 'utf8');
    const selection = selectAiContract(statement);
    const contract = renderAiGenesisContractDts(selection);

    expect(selection.profile.matrix).toBeFalse();
    expect(selection.profile.grid).toBeFalse();
    expect([...selection.fmtMethods].sort()).toEqual(Object.keys(AI_FMT_METHOD_SIGNATURES).sort());
    expect([...selection.generatorMethods].sort()).toEqual(Object.keys(AI_GENERATOR_METHOD_SIGNATURES).sort());
    expect(contract).toContain("declare module 'genesis-kit'");
    expect(contract).toContain('grid(rows: readonly (string | readonly FormatAtom[])[]): FormatGrid;');
    expect(contract).toContain('sequence(options: SequenceOptions): number[];');
    expect(contract).toContain('tree(n: number, options?: TreeOptions): Array<[number, number] | [number, number, number]>;');
    expect(contract).toContain('/** Supported format tokens are YYYY, MM, and DD. */');
    expect(contract).toContain('/** { ok: false, reason } => fail with a structured reason. */');
  });

  test('keeps profile analysis but renders one stable contract across problem shapes', async () => {
    const treeStatementPath = path.join(process.cwd(), 'test', 'fixtures', 'ai-maker', 'tree-max-degree', 'problem.md');
    const intervalStatementPath = path.join(process.cwd(), 'test', 'fixtures', 'ai-maker', 'interval-union', 'problem.md');
    const [treeStatement, intervalStatement] = await Promise.all([
      fs.readFile(treeStatementPath, 'utf8'),
      fs.readFile(intervalStatementPath, 'utf8'),
    ]);

    const treeSelection = selectAiContract(treeStatement);
    const intervalSelection = selectAiContract(intervalStatement);

    expect(treeSelection.profile.tree).toBeTrue();
    expect(intervalSelection.profile.interval).toBeTrue();
    expect(renderAiGenesisContractDts(treeSelection)).toBe(renderAiGenesisContractDts(intervalSelection));
  });

  test('keeps the checked-in declaration snapshot in sync with the runtime contract', async () => {
    const filePath = path.join(process.cwd(), 'examples', 'ai-genesis-contract.d.ts');
    const snapshot = await fs.readFile(filePath, 'utf8');
    expect(snapshot).toBe(renderAiGenesisContractDts());
  });
});
