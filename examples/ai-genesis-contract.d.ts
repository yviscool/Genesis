// Genesis AI contract for maker.ts
// Only use declarations present in this file.
// If a helper is missing, write plain TypeScript instead of inventing a Genesis API.

declare module 'genesis-kit' {
  export type SeedInput = string | number | bigint;
  export type OjProfile = 'auto' | 'linux' | 'windows' | 'none';
  export type MaybePromise<T> = T | Promise<T>;
  export type FormatAtom = string | number | bigint | boolean | null | undefined;

  export interface FormatLine { readonly kind: 'line'; readonly items: readonly FormatAtom[]; }
  export interface FormatTable { readonly kind: 'table'; readonly rows: readonly (readonly FormatAtom[])[]; }
  export interface FormatGrid { readonly kind: 'grid'; readonly rows: readonly (string | readonly FormatAtom[])[]; }
  export interface FormatRaw { readonly kind: 'raw'; readonly text: string; }
  export type FormatNode = FormatLine | FormatTable | FormatGrid | FormatRaw;
  export interface FormatDocument { readonly __genesisFormat: 2; readonly nodes: readonly FormatNode[]; }

  export const fmt: {
    /** One space-separated output row. Example: fmt.line(n, m) */
    line(...items: FormatAtom[]): FormatLine;
    /** Multiple rows. Each item may be one atom, one atom array, or one fmt.* node. */
    lines(...rows: Array<FormatNode | readonly FormatAtom[] | FormatAtom>): FormatDocument;
    /** Table-style rows. Example: fmt.table(edges) */
    table(rows: readonly (readonly FormatAtom[])[]): FormatTable;
  };

  export interface DatasetGenerator {
    /** One integer in [min, max]. Example: g.int(1, 50) */
    int(min: number, max: number): number;
    /** An array of integers. Example: g.ints(n, 1, 100) */
    ints(count: number, min: number, max: number): number[];
    /** Unique integers. Example: g.distinctInts(n, 1, 100) */
    distinctInts(count: number, min: number, max: number): number[];
    /** Sorted numeric array. */
    sorted(count: number, min: number, max: number, options?: { order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc' }): number[];
    /** General array builder. */
    array<T>(count: number, itemGenerator: (index: number) => T): T[];
    /** Pick one element from a candidate list. */
    sample<T>(population: readonly T[]): T;
    /** Pick k elements from a candidate list. */
    sample<T>(population: readonly T[], k: number): T[];
    /** Shuffled copy of the input array. */
    shuffle<T>(array: readonly T[]): T[];
    /** Positive integers whose sum is sum. */
    partition(count: number, sum: number, options?: { minVal?: number }): number[];
  }

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

  export type DatasetValidationReturn = void | boolean | string | DatasetValidationResult;

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
    validate?(input: TInput, context: DatasetValidationContext): MaybePromise<DatasetValidationReturn>;
    cases: DatasetCase<TInput>[];
  }

  export interface Dataset<TInput = unknown> {
    readonly __genesisDataset: 2;
    readonly config: DatasetConfig<TInput>;
  }

  export function defineDataset<TInput>(config: DatasetConfig<TInput>): Dataset<TInput>;
}

// Canonical patterns:
// - Default dataset shape: export default defineDataset<Input>({ solution, seed, format, validate, cases })
// - Static case: { name, input }
// - Generated case: { name, repeat?, generate: ({ g, caseIndex, caseNumber, caseName, repeatIndex, seed }) => input }

// Notes:
// - Import only defineDataset and fmt from genesis-kit
// - Use only the fmt.* and g.* declarations shown above
// - Prefer fmt.line, fmt.lines, and fmt.table unless the contract above exposes a more specific helper
// - Keep seed descriptive and lowercase kebab-case
// - Always define validate for semantic invariants
