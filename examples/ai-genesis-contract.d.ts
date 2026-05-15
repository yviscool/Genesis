// Genesis AI contract for maker.ts
// Only use declarations present in this file.
// If a helper is missing, write plain TypeScript instead of inventing a Genesis API.

declare module 'genesis-kit' {
  export type SeedInput = string | number | bigint;

  export type OjProfile = 'auto' | 'linux' | 'windows' | 'none';

  export type MaybePromise<T> = T | Promise<T>;

  export interface DebugOptions {
      separator?: string;
      printDims?: boolean;
      printType?: boolean;
      printStats?: boolean;
      truncate?: number;
      colors?: boolean;
  }

  export type WeightOption = boolean | [
      min: number,
      max: number
  ];

  export type GraphType = 'simple' | 'tree' | 'dag' | 'bipartite' | 'wheel' | 'complete';

  export interface GraphOptions {
      type?: GraphType;
      directed?: boolean;
      weighted?: WeightOption;
      connected?: boolean;
      noSelfLoops?: boolean;
      oneBased?: boolean;
      negativeCycle?: boolean;
  }

  export type TreeType = 'random' | 'path' | 'star';

  export interface TreeOptions {
      type?: TreeType;
      weighted?: WeightOption;
      oneBased?: boolean;
  }

  export type BinaryTreeType = 'random' | 'complete' | 'skewed';

  export interface BinaryTreeOptions {
      type?: BinaryTreeType;
      oneBased?: boolean;
  }

  export type SequenceOptions = {
      type: 'arithmetic';
      start: number;
      diff: number;
      count: number;
  } | {
      type: 'geometric';
      start: number;
      ratio: number;
      count: number;
  } | {
      type: 'fibonacci';
      count: number;
      first?: number;
      second?: number;
  } | {
      type: 'custom';
      init: number[];
      fn: (prev: number[]) => number;
      count: number;
  };

  export type FormatAtom = string | number | bigint | boolean | null | undefined;

  export interface FormatLine {
      readonly kind: 'line';
      readonly items: readonly FormatAtom[];
  }

  export interface FormatTable {
      readonly kind: 'table';
      readonly rows: readonly (readonly FormatAtom[])[];
  }

  export interface FormatGrid {
      readonly kind: 'grid';
      readonly rows: readonly (string | readonly FormatAtom[])[];
  }

  export interface FormatRaw {
      readonly kind: 'raw';
      readonly text: string;
  }

  export type FormatNode = FormatLine | FormatTable | FormatGrid | FormatRaw;

  export interface FormatDocument {
      readonly __genesisFormat: 2;
      readonly nodes: readonly FormatNode[];
  }

  export const fmt: {
    line(...items: FormatAtom[]): FormatLine;
    /** Multiple rows. Each item may be one atom, one atom array, or one fmt.* node. */
    /** Atom arrays become one space-separated line; nested fmt.* nodes are embedded verbatim. */
    lines(...rows: (FormatNode | readonly FormatAtom[] | FormatAtom)[]): FormatDocument;
    table(rows: readonly (readonly FormatAtom[])[]): FormatTable;
    /** Grid-style rows with no separator inside each row. */
    /** Use fmt.table(...) instead when row items should be separated by spaces. */
    grid(rows: readonly (string | readonly FormatAtom[])[]): FormatGrid;
    /** Raw text passthrough. */
    /** Text is emitted exactly as provided, including embedded newlines. */
    raw(text: string): FormatRaw;
  };

  export interface DatasetGenerator {
    readonly CHARSET: {
      readonly LOWERCASE: string;
      readonly UPPERCASE: string;
      readonly DIGITS: string;
      readonly ALPHANUMERIC: string;
      readonly ALPHA: string;
      readonly BASE36: string;
    };
    int(min: number, max: number): number;
    ints(count: number, min: number, max: number): number[];
    distinctInts(count: number, min: number, max: number): number[];
    float(min: number, max: number, precision?: number): number;
    even(min: number, max: number): number;
    odd(min: number, max: number): number;
    prime(min: number, max: number): number;
    coprime(min: number, max: number): [
        number,
        number
    ];
    divisible(min: number, max: number, d: number): number;
    sequence(options: SequenceOptions): number[];
    string(len: number, charset?: string): string;
    palindrome(len: number, charset?: string): string;
    word(minLen: number, maxLen: number): string;
    words(count: number, minLen: number, maxLen: number): string[];
    brackets(n: number, options?: {
        types?: string;
    }): string;
    array<T>(count: number, itemGenerator: (index: number) => T): T[];
    sorted(count: number, min: number, max: number, options?: {
        order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc';
    }): number[];
    /** Numeric array whose sorted order has adjacent differences >= gap. */
    /** Final output order may be shuffled. Sort it yourself if order matters. */
    sparse(count: number, min: number, max: number, gap: number): number[];
    /** Positive integers whose sum is sum. */
    /** Final output order may be shuffled. */
    partition(count: number, sum: number, options?: {
        minVal?: number;
    }): number[];
    matrix<T>(rows: number, cols: number, cellGenerator: (r: number, c: number) => T): T[][];
    grid01(rows: number, cols: number, density?: number): number[][];
    maze(rows: number, cols: number, options?: {
        wall?: string;
        road?: string;
    }): string[][];
    /** Interval list. */
    /** When overlapping is false and sorted is not set, interval order may be shuffled. */
    intervals(n: number, min: number, max: number, options?: { overlapping?: boolean; sorted?: boolean; minLen?: number; maxLen?: number; allowGaps?: boolean; }): Array<[number, number]>;
    permutation(n: number, oneBased?: boolean): number[];
    shuffle<T>(array: readonly T[]): T[];
    /** Pick one element from a candidate list. */
    /** Pick k distinct elements without replacement from a candidate list. */
    sample<T>(population: readonly T[]): T;
    sample<T>(population: readonly T[], k: number): T[];
    chunk<T>(array: readonly T[], size: number): T[][];
    tree(n: number, options?: TreeOptions): Array<[number, number] | [number, number, number]>;
    graph(n: number, m: number, options?: GraphOptions): Array<[number, number] | [number, number, number]>;
    points(n: number, minVal: number, maxVal: number, options?: { type?: 'random' | 'collinear'; }): Array<[number, number]>;
    convexHull(n: number, minVal: number, maxVal: number): Array<[number, number]>;
    polygon(n: number, minVal: number, maxVal: number): Array<[number, number]>;
    /** Binary tree edges and the actual root label of this generated tree. */
    binaryTree(n: number, options?: BinaryTreeOptions): {
      edges: Array<[number, number]>;
      root: number;
    };
    isLeap(year: number): boolean;
    year(minYear?: number, maxYear?: number): number;
    /** Supported format tokens are YYYY, MM, and DD. */
    date(options?: {
        minYear?: number;
        maxYear?: number;
        format?: string;
    }): string;
    debug<T>(data: T, options?: DebugOptions): void;
    debug<T>(label: string, data: T, options?: DebugOptions): void;
    readonly base: {
      convert(input: string | number | bigint, fromRadix: number, toRadix: number): string;
      binToHex(binString: string): string;
      hexToBin(hexString: string): string;
      /** For length > 1, the first digit is non-zero. */
      digits(length: number, radix: number): string;
    };
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

  /** void/true => pass, false => fail with a generic message, string => fail with that reason. */
  /** { ok: false, reason } => fail with a structured reason. */
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
// - Canonical explicit format style: fmt.lines(fmt.line(...), fmt.table(...), fmt.grid(...), fmt.raw(...))
// - Matrix/grid input pattern: { n, m, rows } with fmt.lines(fmt.line(n, m), fmt.table(rows)) or fmt.lines(fmt.line(n, m), fmt.grid(rows))
// - Graph/tree input pattern: { n, edges } or { n, m, edges } with fmt.lines(fmt.line(...header), fmt.table(edges))
// - Multi-test input pattern: { tests: [...] } with fmt.lines(fmt.line(t), ...tests.flatMap(...))

// Notes:
// - Import only defineDataset and fmt from genesis-kit
// - Use only the fmt.* and g.* declarations shown above
