import type { FormatDocument, FormatNode } from './format';
import type { DatasetGenerator, SeedInput } from './generator/factory';
import type { OjProfile } from './types';

export type MaybePromise<T> = T | Promise<T>;

export interface DatasetGenerateContext {
  caseIndex: number;
  caseNumber: number;
  caseName: string;
  repeatIndex: number;
  seed: string;
  g: DatasetGenerator;
}

export interface DatasetValidationContext {
  caseIndex: number;
  caseNumber: number;
  caseName: string;
  repeatIndex: number;
  tags: string[];
  seed: string;
  formattedInput: string;
}

export interface DatasetValidationResult {
  ok: boolean;
  reason?: string;
}

export type DatasetValidationReturn =
  | void
  | boolean
  | string
  | DatasetValidationResult;

export interface DatasetStaticCase<TInput> {
  name: string;
  tags?: string[];
  input: TInput;
  generate?: never;
  repeat?: never;
}

export interface DatasetGeneratedCase<TInput> {
  name: string;
  tags?: string[];
  repeat?: number;
  generate(ctx: DatasetGenerateContext): MaybePromise<TInput>;
  input?: never;
}

export type DatasetCase<TInput> = DatasetStaticCase<TInput> | DatasetGeneratedCase<TInput>;

export interface DatasetConfig<TInput> {
  solution: string;
  outputDir?: string;
  seed: SeedInput;
  startFrom?: number;
  runTimeoutMs?: number;
  caseConcurrency?: number;
  compiler?: string;
  compilerFlags?: string[];
  ojProfile?: OjProfile;
  stackSizeBytes?: number;
  manifestPath?: string | false;
  format(input: TInput): FormatDocument | FormatNode;
  validate?(
    input: TInput,
    context: DatasetValidationContext,
  ): MaybePromise<DatasetValidationReturn>;
  cases: DatasetCase<TInput>[];
}

export interface Dataset<TInput = unknown> {
  readonly __genesisDataset: 2;
  readonly config: DatasetConfig<TInput>;
}

export function defineDataset<TInput>(config: DatasetConfig<TInput>): Dataset<TInput> {
  return {
    __genesisDataset: 2,
    config,
  };
}

export function isDataset(value: unknown): value is Dataset {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { __genesisDataset?: unknown }).__genesisDataset === 2
      && typeof (value as { config?: unknown }).config === 'object',
  );
}
