import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
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

  test('selects a minimal contract for scalar-input problems even if the output is a matrix', async () => {
    const statementPath = path.join(process.cwd(), 'test', 'fixtures', 'ai-maker', 'arithmetic-matrix', 'problem.md');
    const statement = await fs.readFile(statementPath, 'utf8');
    const selection = selectAiContract(statement);
    const contract = renderAiGenesisContractDts(selection);

    expect(selection.profile.matrix).toBeFalse();
    expect(selection.profile.grid).toBeFalse();
    expect(selection.fmtMethods).toEqual(['line', 'lines', 'table']);
    expect(selection.generatorMethods).not.toContain('matrix');
    expect(selection.generatorMethods).not.toContain('grid01');
    expect(contract).toContain("declare module 'genesis-kit'");
    expect(contract).not.toContain('grid(rows: readonly (string | readonly FormatAtom[])[]): FormatGrid;');
    expect(contract).not.toContain('matrix<T>(rows: number, cols: number, cellGenerator: (rowIndex: number, colIndex: number) => T): T[][];');
  });

  test('enables only structure-specific helpers for tree and interval problems', async () => {
    const treeStatementPath = path.join(process.cwd(), 'test', 'fixtures', 'ai-maker', 'tree-max-degree', 'problem.md');
    const intervalStatementPath = path.join(process.cwd(), 'test', 'fixtures', 'ai-maker', 'interval-union', 'problem.md');
    const [treeStatement, intervalStatement] = await Promise.all([
      fs.readFile(treeStatementPath, 'utf8'),
      fs.readFile(intervalStatementPath, 'utf8'),
    ]);

    const treeSelection = selectAiContract(treeStatement);
    const intervalSelection = selectAiContract(intervalStatement);

    expect(treeSelection.generatorMethods).toContain('tree');
    expect(treeSelection.generatorMethods).not.toContain('intervals');
    expect(intervalSelection.generatorMethods).toContain('intervals');
    expect(intervalSelection.generatorMethods).not.toContain('tree');
  });

  test('keeps the checked-in declaration snapshot in sync with the runtime contract', async () => {
    const filePath = path.join(process.cwd(), 'examples', 'ai-genesis-contract.d.ts');
    const snapshot = await fs.readFile(filePath, 'utf8');
    expect(snapshot).toBe(renderAiGenesisContractDts());
  });
});
