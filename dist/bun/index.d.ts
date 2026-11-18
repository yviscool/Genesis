//#region src/constraints.d.ts
/**
 * Declarative input constraints.
 *
 * Every dataset in practice re-implements the same range checks by hand:
 *
 * ```ts
 * if (!Number.isInteger(n) || n < 1 || n > N_MAX) return `n out of range: ${n}`;
 * ```
 *
 * `constraints` expresses that once, per field, and leaves `validate` for the
 * cross-field invariants that actually need code (graph connectivity, order,
 * duplicate detection, ...).
 */
interface FieldConstraint {
  /** Reject non-integers (also rejects NaN / Infinity). */
  int?: boolean;
  min?: number;
  max?: number;
  /** Upper bound read from another field, e.g. `ref: 'n'`. */
  ref?: string;
  /** Exact value, or exact array/string length. `'m'` refers to `input.m`. */
  eq?: number | string;
  /** Exact length of an array or string. `'m'` refers to `input.m`. */
  len?: number | string;
  /** Minimum length of an array or string. `'m'` refers to `input.m`. */
  minLen?: number | string;
  /** Maximum length of an array or string. `'m'` refers to `input.m`. */
  maxLen?: number | string;
  oneOf?: readonly (string | number)[];
}
type DatasetConstraints = Record<string, FieldConstraint>;
type Segment = {
  readonly kind: 'key';
  readonly name: string;
} | {
  readonly kind: 'index';
  readonly index: number | '*';
};
declare function parseConstraintPath(pattern: string): Segment[];
/**
 * Check `input` against `constraints`.
 *
 * Returns a human readable message on the first violation, or `null` when the
 * input satisfies every constraint.
 */
declare function checkConstraints(input: unknown, constraints: DatasetConstraints): string | null;
//#endregion
//#region src/format.d.ts
type FormatAtom = string | number | bigint | boolean | null | undefined;
interface FormatLine {
  readonly kind: 'line';
  readonly items: readonly FormatAtom[];
  /** Separator between atoms. Defaults to a single space. */
  readonly sep?: string;
}
interface FormatTable {
  readonly kind: 'table';
  readonly rows: readonly (readonly FormatAtom[])[];
  /** Separator between atoms inside a row. Defaults to a single space. */
  readonly sep?: string;
  /** Separator between rows. Defaults to a newline. */
  readonly rowSep?: string;
}
interface FormatGrid {
  readonly kind: 'grid';
  readonly rows: readonly (string | readonly FormatAtom[])[];
}
interface FormatRaw {
  readonly kind: 'raw';
  readonly text: string;
}
/**
 * Ordered list of nodes joined by an arbitrary separator.
 *
 * This is the piece v2 was missing: `fmt.lines` can only join with `\n`, so
 * problems that need a blank line between records (multi-test inputs, block
 * output) had no way to express it and fell back to hand-built strings.
 */
interface FormatSeq {
  readonly kind: 'seq';
  readonly nodes: readonly FormatNode[];
  readonly sep: string;
}
type FormatNode = FormatLine | FormatTable | FormatGrid | FormatRaw | FormatSeq;
interface FormatDocument {
  readonly __genesisFormat: 2;
  readonly nodes: readonly FormatNode[];
}
interface FormatTableOptions {
  sep?: string;
  rowSep?: string;
}
interface FormatRowsOptions extends FormatTableOptions {
  /** Optional header line rendered before the rows. */
  header?: readonly FormatAtom[];
}
declare const fmt: {
  readonly line: (...items: FormatAtom[]) => FormatLine;
  readonly lines: (...rows: (FormatNode | readonly FormatAtom[] | FormatAtom)[]) => FormatDocument;
  readonly table: (rows: readonly (readonly FormatAtom[])[], options?: FormatTableOptions) => FormatTable;
  readonly grid: (rows: readonly (string | readonly FormatAtom[])[]) => FormatGrid;
  readonly raw: (text: string) => FormatRaw;
  /** Join atoms with a custom separator, e.g. `fmt.join('', '(', a, ',', b, ')')`. */
  readonly join: (sep: string, ...items: FormatAtom[]) => FormatLine;
  /** One line holding every value, space separated: `n` then the whole array. */
  readonly flat: (values: readonly FormatAtom[]) => FormatLine;
  /** Parenthesised tuple without spaces, e.g. `(3,1)`. */
  readonly tuple: (...items: FormatAtom[]) => FormatLine;
  /** Join nodes with a custom separator. Use `'\n\n'` for a blank line between records. */
  readonly seq: (nodes: readonly FormatNode[], sep?: string) => FormatSeq;
  /** Consecutive blocks separated by one blank line. */
  readonly block: (...nodes: FormatNode[]) => FormatSeq;
  /**
   * Header line plus a matrix of rows — the single most common input shape.
   *
   * ```ts
   * format: ({ n, edges }) => fmt.rows(edges, { header: [n, edges.length] })
   * ```
   */
  readonly rows: (rows: readonly (readonly FormatAtom[])[], options?: FormatRowsOptions) => FormatNode;
};
declare function createFormatDocument(nodes: readonly FormatNode[]): FormatDocument;
declare function isFormatNode(value: unknown): value is FormatNode;
declare function isFormatDocument(value: unknown): value is FormatDocument;
declare function normalizeFormat(value: unknown): FormatDocument;
declare function renderFormatDocument(document: FormatDocument | FormatNode): string;
//#endregion
//#region src/generator/core.d.ts
type RandomSource = () => number;
//#endregion
//#region src/types.d.ts
type OjProfile = 'auto' | 'linux' | 'windows' | 'none';
interface DebugOptions {
  separator?: string;
  printDims?: boolean;
  printType?: boolean;
  printStats?: boolean;
  truncate?: number;
  colors?: boolean;
}
type WeightOption = boolean | [min: number, max: number];
type GraphType = 'simple' | 'tree' | 'dag' | 'bipartite' | 'wheel' | 'complete';
interface GraphOptions {
  type?: GraphType;
  directed?: boolean;
  weighted?: WeightOption;
  connected?: boolean;
  noSelfLoops?: boolean;
  oneBased?: boolean;
  negativeCycle?: boolean;
}
type TreeType = 'random' | 'path' | 'star';
interface TreeOptions {
  type?: TreeType;
  weighted?: WeightOption;
  oneBased?: boolean;
}
type BinaryTreeType = 'random' | 'complete' | 'skewed';
interface BinaryTreeOptions {
  type?: BinaryTreeType;
  oneBased?: boolean;
}
//#endregion
//#region src/generator/numbers.d.ts
type SequenceOptions = {
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
//#endregion
//#region src/generator/types.d.ts
/**
 * 定义 Genesis 数据生成器 (G) 的完整接口。
 */
interface IGenerator {
  /**
   * 常用的预定义字符集。
   */
  readonly CHARSET: {
    readonly LOWERCASE: string;
    readonly UPPERCASE: string;
    readonly DIGITS: string;
    readonly ALPHANUMERIC: string;
    readonly ALPHA: string;
    readonly BASE36: string;
  };
  /** 生成一个 [min, max] 范围内的随机整数 */
  int(min: number, max: number): number;
  /** 生成包含 n 个随机整数的数组 */
  ints(count: number, min: number, max: number): number[];
  /** 生成包含 n 个互不相同的随机整数的数组 */
  distinctInts(count: number, min: number, max: number): number[];
  /** 生成一个随机浮点数 */
  float(min: number, max: number, precision?: number): number;
  /** 生成一个随机偶数 */
  even(min: number, max: number): number;
  /** 生成一个随机奇数 */
  odd(min: number, max: number): number;
  /** [新增] 生成一个随机质数 */
  prime(min: number, max: number): number;
  /** [新增] 生成一对互质数 */
  coprime(min: number, max: number): [number, number];
  /** [新增] 生成能被 d 整除的随机数 */
  divisible(min: number, max: number, d: number): number;
  /** [新增] 生成数列（等差/等比/斐波那契/自定义递推） */
  sequence(options: SequenceOptions): number[];
  /** 生成指定长度的随机字符串 */
  string(len: number, charset?: string): string;
  /** 生成随机回文字符串 */
  palindrome(len: number, charset?: string): string;
  /** 生成一个随机单词 */
  word(minLen: number, maxLen: number): string;
  /** 生成包含 n 个随机单词的数组 */
  words(count: number, minLen: number, maxLen: number): string[];
  /** [新增] 生成合法括号序列 */
  brackets(n: number, options?: {
    types?: string;
  }): string;
  /** 根据规则构建数组 */
  array<T>(count: number, itemGenerator: (index: number) => T): T[];
  /** 生成有序序列 */
  sorted(count: number, min: number, max: number, options?: {
    order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc';
  }): number[];
  /** 生成稀疏序列 */
  sparse(count: number, min: number, max: number, gap: number): number[];
  /** 生成和为 S 的正整数序列 */
  partition(count: number, sum: number, options?: {
    minVal?: number;
  }): number[];
  /** 生成数字矩阵 */
  matrix<T>(rows: number, cols: number, cellGenerator: (r: number, c: number) => T): T[][];
  /** 生成 0-1 矩阵 */
  grid01(rows: number, cols: number, density?: number): number[][];
  /** 生成迷宫 */
  maze(rows: number, cols: number, options?: {
    wall?: string;
    road?: string;
  }): string[][];
  /** [新增] 生成区间列表 */
  intervals(n: number, min: number, max: number, options?: {
    overlapping?: boolean;
    sorted?: boolean;
    minLen?: number;
    maxLen?: number;
    allowGaps?: boolean;
  }): number[][];
  /** 生成全排列 */
  permutation(n: number, oneBased?: boolean): number[];
  /** 随机打乱数组 */
  shuffle<T>(array: readonly T[]): T[];
  /** 随机采样 */
  sample<T>(population: readonly T[]): T;
  sample<T>(population: readonly T[], k: number): T[];
  /** 分块 */
  chunk<T>(array: readonly T[], size: number): T[][];
  /** 注入随机源（返回值应在 [0,1)） */
  withRng(rng: RandomSource): void;
  /** 重置为默认随机源 Math.random */
  resetRng(): void;
  /** 生成树 */
  tree(n: number, options?: TreeOptions): number[][];
  /** 生成图 */
  graph(n: number, m: number, options?: GraphOptions): number[][];
  /** 生成二维点坐标 */
  points(n: number, minVal: number, maxVal: number, options?: {
    type?: 'random' | 'collinear';
  }): number[][];
  /** [新增] 生成凸包上的点 */
  convexHull(n: number, minVal: number, maxVal: number): number[][];
  /** [新增] 生成简单多边形（无自交） */
  polygon(n: number, minVal: number, maxVal: number): number[][];
  /** [新增] 生成二叉树 */
  binaryTree(n: number, options?: BinaryTreeOptions): {
    edges: number[][];
    root: number;
  };
  /** 判断闰年 */
  isLeap(year: number): boolean;
  /** 生成随机年份 */
  year(minYear?: number, maxYear?: number): number;
  /** 生成随机日期 */
  date(options?: {
    minYear?: number;
    maxYear?: number;
    format?: string;
  }): string;
  readonly base: {
    convert(input: string | number | bigint, fromRadix: number, toRadix: number): string;
    binToHex(binString: string): string;
    hexToBin(hexString: string): string;
    digits(length: number, radix: number): string;
  };
  debug<T>(data: T, options?: DebugOptions): void;
  debug<T>(label: string, data: T, options?: DebugOptions): void;
}
//#endregion
//#region src/generator/factory.d.ts
type SeedInput = string | number | bigint;
type DatasetGenerator = Omit<IGenerator, 'withRng' | 'resetRng'>;
declare function createGenerator(seedOrRng: SeedInput | RandomSource): DatasetGenerator;
declare function createSeededRng(seed: SeedInput): RandomSource;
//#endregion
//#region src/dataset.d.ts
type MaybePromise<T> = T | Promise<T>;
interface DatasetGenerateContext {
  caseIndex: number;
  caseNumber: number;
  caseName: string;
  repeatIndex: number;
  seed: string;
  g: DatasetGenerator;
}
interface DatasetValidationContext {
  caseIndex: number;
  caseNumber: number;
  caseName: string;
  repeatIndex: number;
  tags: string[];
  seed: string;
  formattedInput: string;
}
interface DatasetValidationResult {
  ok: boolean;
  reason?: string;
}
type DatasetValidationReturn = void | boolean | string | DatasetValidationResult;
interface DatasetStaticCase<TInput> {
  name: string;
  tags?: string[];
  input: TInput;
  generate?: never;
  repeat?: never;
}
interface DatasetGeneratedCase<TInput> {
  name: string;
  tags?: string[];
  repeat?: number;
  generate(ctx: DatasetGenerateContext): MaybePromise<TInput>;
  input?: never;
}
type DatasetCase<TInput> = DatasetStaticCase<TInput> | DatasetGeneratedCase<TInput>;
interface DatasetConfig<TInput> {
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
  /** Declarative per-field checks, evaluated before `validate`. */
  constraints?: DatasetConstraints;
  format(input: TInput): FormatDocument | FormatNode;
  validate?(input: TInput, context: DatasetValidationContext): MaybePromise<DatasetValidationReturn>;
  cases: DatasetCase<TInput>[];
}
interface Dataset<TInput = unknown> {
  readonly __genesisDataset: 2;
  readonly config: DatasetConfig<TInput>;
}
declare function defineDataset<TInput>(config: DatasetConfig<TInput>): Dataset<TInput>;
declare function isDataset(value: unknown): value is Dataset;
//#endregion
//#region src/execution.d.ts
interface ExecutionResult {
  runArgs: string[];
  executablePath: string;
}
//#endregion
//#region src/manifest.d.ts
/**
 * Manifest format version.
 *
 * v2 stored absolute, machine-specific paths (temp directories included) and had no
 * fingerprint of the inputs that produced the data, so a manifest could not answer
 * "is this data still in sync with maker.ts / std.py?".
 *
 * v3 makes the manifest portable and self-verifying:
 *   - every path is relative to the manifest file itself (`pathBase: 'manifest'`)
 *   - `sources` records the sha256 of the maker module and the standard solution
 *   - `execution` records the runtime and relative run arguments
 */
declare const MANIFEST_VERSION: 3;
/** Documents the anchor used by every path stored in the manifest. */
declare const MANIFEST_PATH_BASE: "manifest";
interface ManifestFileRef {
  path: string;
  sha256: string;
  bytes: number;
  lines?: number;
}
type DatasetCaseStatus = 'success' | 'failure';
type DatasetErrorPhase = 'config' | 'materialize' | 'format' | 'validate' | 'write-input' | 'execution' | 'write-output' | 'manifest';
interface DatasetErrorRecord {
  phase: DatasetErrorPhase;
  kind: 'generator' | 'formatter' | 'validation' | 'io' | 'execution' | 'timeout' | 'config';
  message: string;
}
/** Backwards-compatible alias: a case file record is a manifest file reference. */
type DatasetFileRecord = ManifestFileRef;
interface DatasetValidationSummary {
  status: 'not-run' | 'passed' | 'failed';
  durationMs: number;
  reason?: string;
}
interface DatasetCaseRecord {
  caseId: number;
  caseNumber: number;
  name: string;
  repeatIndex: number;
  tags: string[];
  seed: string;
  status: DatasetCaseStatus;
  durationMs: number;
  phases: {
    materializeMs: number;
    formatMs: number;
    validateMs: number;
    writeInputMs: number;
    executionMs: number;
    writeOutputMs: number;
  };
  validation: DatasetValidationSummary;
  input: ManifestFileRef | null;
  output: ManifestFileRef | null;
  error: DatasetErrorRecord | null;
}
interface ManifestSourceRef {
  path: string;
  sha256: string;
  bytes: number;
}
interface ManifestExecutionRef {
  /** Interpreter or launcher that runs the standard solution, e.g. `python3`. */
  runtime: string;
  /** Arguments with every path made relative to the manifest. */
  runArgs: string[];
  executablePath: string;
  fingerprint: string;
}
interface ManifestReplayRef {
  caseNumber: number;
  caseName: string;
  repeatIndex: number;
  outputDir: string;
}
interface DatasetManifestSummary {
  totalCases: number;
  succeeded: number;
  failed: number;
  durationMs: number;
}
interface DatasetManifestDataset {
  modulePath: string | null;
  solution: string;
  outputDir: string;
  seed: string;
  startFrom: number;
  runTimeoutMs: number;
  caseConcurrency: number | null;
  compiler: string | null;
  compilerFlags: string[];
  ojProfile: string | null;
  stackSizeBytes: number | null;
  manifestPath: string | null;
}
interface DatasetManifest {
  version: typeof MANIFEST_VERSION;
  tool: {
    name: 'genesis-kit';
    version: string;
  };
  generatedAt: string;
  /** Every path in this file is relative to the directory holding this file. */
  pathBase: typeof MANIFEST_PATH_BASE;
  dataset: DatasetManifestDataset;
  sources: {
    /** The dataset module (`make.ts`). `null` when the dataset was not loaded from a file. */
    maker: ManifestSourceRef | null;
    /** The standard solution referenced by `config.solution`. */
    solution: ManifestSourceRef;
  };
  execution: ManifestExecutionRef | null;
  replay: ManifestReplayRef | null;
  summary: DatasetManifestSummary;
  cases: DatasetCaseRecord[];
}
interface ManifestBuildInput {
  config: DatasetConfig<unknown>;
  results: DatasetCaseRecord[];
  summary: DatasetManifestSummary;
  datasetFile?: string | null;
  execution?: ExecutionResult | null;
  replay?: ManifestReplayRef | null;
}
interface ManifestBuildResult {
  manifest: DatasetManifest;
  manifestPath: string;
}
declare function toPortablePath(filePath: string): string;
/**
 * Express `target` relative to `baseDir` using forward slashes.
 *
 * Paths that escape `baseDir` stay absolute: a relative path with `../..` is harder to
 * audit than an obvious absolute one, and both are equally unusable on another machine.
 */
declare function relativizePath(target: string, baseDir: string): string;
/** Turn a manifest-relative path back into an absolute one. */
declare function resolveManifestPath(manifestPath: string, storedPath: string): string;
/** Where the manifest lives when the dataset does not pin an explicit path. */
declare function defaultManifestPath(config: Pick<DatasetConfig<unknown>, 'outputDir' | 'manifestPath'>): string | null;
interface FileDigest {
  sha256: string;
  bytes: number;
  lines: number;
}
/** Stream a file through sha256 while counting bytes and newlines. */
declare function digestFile(filePath: string): Promise<FileDigest>;
declare function describeFile(filePath: string, baseDir: string): Promise<ManifestFileRef>;
/** True when `filePath` still hashes to what the manifest recorded. */
declare function sourceMatches(ref: ManifestSourceRef | null | undefined, filePath: string | null): Promise<boolean>;
/**
 * The execution fingerprint must change whenever anything that can change the produced
 * `.out` files changes: the solution bytes, the runtime, and its arguments.
 */
declare function buildExecutionFingerprint(input: {
  runArgs: readonly string[];
  executablePath: string;
  solutionSha256: string;
}): string;
/**
 * Build and persist a manifest. Returns `null` when `config.manifestPath === false`.
 */
declare function writeManifest(input: ManifestBuildInput): Promise<ManifestBuildResult | null>;
interface LoadedManifest {
  manifest: DatasetManifest;
  manifestPath: string;
  manifestDir: string;
}
declare function readManifest(manifestPath: string): Promise<LoadedManifest | null>;
//#endregion
//#region src/dataset-runner.d.ts
interface DatasetRunOptions {
  mode: 'generate' | 'validate';
  datasetFile?: string | null;
  replay?: DatasetReplayInfo | null;
  outputDir?: string;
  manifestPath?: string | false;
  cleanOutputDir?: boolean;
  /** Restrict the run to a subset of the expanded cases. */
  caseSelector?: DatasetCaseSelector | null;
  /** Skip cases whose existing artifacts already match the manifest. */
  resume?: boolean;
  /** Delete numbered `.in` / `.out` files that the current run did not produce. */
  prune?: boolean;
  /** Override `config.caseConcurrency`. */
  caseConcurrency?: number;
  /**
   * Append a final newline to the rendered `.in` when the format does not end with one.
   * Off by default: `fmt` output is taken literally.
   */
  ensureTrailingNewline?: boolean;
}
/** Everything a caller may pass to the `*FromFile` helpers. */
type DatasetFileRunOptions = Omit<DatasetRunOptions, 'mode' | 'datasetFile'>;
/**
 * `--only` grammar: comma separated items, each of
 *   `N` (case number), `N-M` (inclusive range), or a case name.
 */
interface DatasetCaseSelector {
  only?: string;
  from?: number;
  to?: number;
}
interface DatasetReplaySelector {
  caseNumber?: number;
  caseName?: string;
  repeatIndex?: number;
  outputDir?: string;
  manifestPath?: string | false;
}
interface DatasetReplayInfo {
  caseNumber: number;
  caseName: string;
  repeatIndex: number;
  outputDir: string;
}
interface DatasetRunResult {
  manifest: DatasetManifest | null;
  results: DatasetCaseRecord[];
  /** Describes the manifest, i.e. every case the dataset declares. */
  summary: DatasetManifestSummary;
  /** Describes this invocation only — `skipped` counts carried-over / resumed cases. */
  executed: {
    totalCases: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
}
declare function loadDatasetFromFile(entryFile?: string): Promise<Dataset<unknown>>;
declare function validateDatasetFromFile(entryFile?: string, options?: DatasetFileRunOptions): Promise<DatasetRunResult>;
declare function generateDatasetFromFile(entryFile?: string, options?: DatasetFileRunOptions): Promise<DatasetRunResult>;
declare function replayDatasetFromFile(entryFile: string, selector: DatasetReplaySelector, options?: DatasetFileRunOptions): Promise<DatasetRunResult>;
declare function validateDataset<TInput>(dataset: Dataset<TInput>, options?: Omit<DatasetRunOptions, 'mode'>): Promise<DatasetRunResult>;
declare function generateDataset<TInput>(dataset: Dataset<TInput>, options?: Omit<DatasetRunOptions, 'mode'>): Promise<DatasetRunResult>;
declare function replayDataset<TInput>(dataset: Dataset<TInput>, selector: DatasetReplaySelector, options?: Omit<DatasetRunOptions, 'mode' | 'replay'>): Promise<DatasetRunResult>;
declare function expandDatasetCases<TInput>(config: DatasetConfig<TInput>): ExpandedDatasetCase<TInput>[];
interface ExpandedDatasetCase<TInput> {
  caseIndex: number;
  caseNumber: number;
  name: string;
  repeatIndex: number;
  repeatTotal: number;
  tags: string[];
  kind: 'static' | 'generated';
  input?: TInput;
  generate?: DatasetGeneratedCase<TInput>['generate'];
  seed: string;
}
/**
 * Narrow an expanded case list down to what the caller asked for.
 *
 * `from` / `to` are inclusive case-number bounds; `only` accepts a comma separated mix of
 * case numbers, inclusive ranges (`3-5`) and case names. Name matching is exact and applies
 * to every repeat of that case.
 */
declare function selectDatasetCases<TInput>(cases: ExpandedDatasetCase<TInput>[], selector?: DatasetCaseSelector | null): ExpandedDatasetCase<TInput>[];
/**
 * Resolve a dataset's config the same way a run would, without touching any file.
 * Shared with `checkDataset` so both agree on where the output and manifest live.
 */
declare function resolveDatasetConfig<TInput>(dataset: Dataset<TInput>, options?: {
  datasetFile?: string | null;
  outputDir?: string;
  manifestPath?: string | false;
}): DatasetConfig<TInput>;
//#endregion
//#region src/check.d.ts
/**
 * Drift codes.
 *
 * `error` means the data on disk is not what the dataset would produce today.
 * `warning` means the data is usable but the directory is not tidy.
 */
type DriftCode = 'manifest-missing' | 'manifest-version' | 'source-drift' | 'case-missing' | 'case-extra' | 'artifact-missing' | 'artifact-modified' | 'orphan-artifact' | 'case-failed';
interface DriftIssue {
  code: DriftCode;
  severity: 'error' | 'warning';
  message: string;
  caseNumber?: number;
  /** Manifest-relative path of the file the issue is about, when applicable. */
  path?: string;
}
interface DatasetCheckReport {
  /** `ok` = data matches the dataset; `stale` = it does not; `missing` = no manifest at all. */
  status: 'ok' | 'stale' | 'missing';
  manifestPath: string | null;
  manifestVersion: number | null;
  expectedCases: number;
  recordedCases: number;
  /** Case numbers that the dataset declares but the manifest does not cover. */
  missingCases: number[];
  issues: DriftIssue[];
}
interface DatasetCheckOptions {
  datasetFile?: string | null;
  outputDir?: string;
  manifestPath?: string | false;
}
/**
 * Compare the dataset's *intent* (its config plus the bytes of `maker` / `std`) against the
 * artifacts currently on disk. Reads only — never generates, never writes.
 *
 * This is what makes `--check` cheap: without it the only way to know whether a change to
 * `maker.ts` invalidated 2 GB of test data is to regenerate all of it.
 */
declare function checkDataset<TInput>(dataset: Dataset<TInput>, options?: DatasetCheckOptions): Promise<DatasetCheckReport>;
declare function checkDatasetFromFile(entryFile?: string, options?: Omit<DatasetCheckOptions, 'datasetFile'>): Promise<DatasetCheckReport>;
//#endregion
//#region src/lint.d.ts
/**
 * Static contract check for `make.ts` files.
 *
 * The previous implementation was a pile of regexes, which made it both over- and
 * under-sensitive: `format: ({ n, m, g }) => g.join(' ')` was reported as
 * "g.join is not part of the Genesis AI contract" because a local field happened to be
 * called `g`, while `g['join']` slipped through entirely.
 *
 * This version parses the file and resolves what an identifier actually refers to:
 * the generator `g` is only injected inside a `generate` callback, so a `g` destructured
 * by `format` is just the user's own data.
 */
type LintSeverity = 'error' | 'warning';
interface LintIssue {
  code: string;
  severity: LintSeverity;
  message: string;
  /** 1-based. */
  line?: number;
  /** 1-based. */
  column?: number;
}
interface LintOptions {
  /** Used only in messages. */
  filename?: string;
  /** When set, a literal `solution` property must equal this value. */
  expectedSolution?: string | null;
}
interface LintAllowance {
  fmtMethods: readonly string[];
  generatorMethods: readonly string[];
  baseMethods: readonly string[];
  charsetProperties: readonly string[];
  generatorPropertyRoots: readonly string[];
}
/** The complete v2 contract surface — what a hand-written maker may use. */
declare function defaultLintAllowance(): LintAllowance;
declare function lintMakerSource(code: string, options?: LintOptions): LintIssue[];
/**
 * Runtime counterpart of the source lint: checks the object a `make.ts` actually produced.
 *
 * Source lint cannot see computed keys or values produced by helpers, so the loaded config
 * is verified too.
 */
declare function lintDatasetConfig(config: Record<string, unknown>, options?: {
  expectedSolution?: string | null;
}): LintIssue[];
/** Pretty one-line rendering used by the CLI. */
declare function formatLintIssue(issue: LintIssue, filename?: string): string;
//#endregion
//#region src/ai-contract.types.d.ts
type AiContractGeneratedBlock = {
  name: string;
  declarationLines: readonly string[];
};
type AiContractGeneratedMethod = {
  name: string;
  signature: string;
  declarationLines: readonly string[];
};
type AiContractGeneratedData = {
  headerDeclarations: readonly AiContractGeneratedBlock[];
  datasetDeclarations: readonly AiContractGeneratedBlock[];
  fmtMethods: readonly AiContractGeneratedMethod[];
  generatorMethods: readonly AiContractGeneratedMethod[];
  baseMethods: readonly AiContractGeneratedMethod[];
  charsetProperties: readonly string[];
};
//#endregion
//#region src/ai-contract.generated.d.ts
declare const AI_CONTRACT_GENERATED: AiContractGeneratedData;
//#endregion
//#region src/ai-contract.d.ts
type AiFmtMethodName = typeof AI_CONTRACT_GENERATED.fmtMethods[number]['name'];
type AiGeneratorMethodName = typeof AI_CONTRACT_GENERATED.generatorMethods[number]['name'];
type AiBaseMethodName = typeof AI_CONTRACT_GENERATED.baseMethods[number]['name'];
type AiCharsetPropertyName = typeof AI_CONTRACT_GENERATED.charsetProperties[number];
type AiProblemProfile = {
  multiTest: boolean;
  matrix: boolean;
  tree: boolean;
  graph: boolean;
  interval: boolean;
  string: boolean;
  grid: boolean;
  geometry: boolean;
};
type AiContractSelection = {
  profile: AiProblemProfile;
  fmtMethods: readonly AiFmtMethodName[];
  generatorMethods: readonly AiGeneratorMethodName[];
  baseMethods: readonly AiBaseMethodName[];
  charsetProperties: readonly AiCharsetPropertyName[];
  canonicalPatterns: readonly string[];
};
type AiContractAllowance = {
  fmtMethods: readonly string[];
  generatorMethods: readonly string[];
  baseMethods: readonly string[];
  charsetProperties: readonly string[];
  generatorPropertyRoots: readonly string[];
};
declare const AI_FMT_METHOD_SIGNATURES: Record<AiFmtMethodName, string>;
declare const AI_GENERATOR_METHOD_SIGNATURES: Record<AiGeneratorMethodName, string>;
declare const AI_BASE_METHOD_SIGNATURES: Record<AiBaseMethodName, string>;
declare const AI_CHARSET_PROPERTIES: Record<AiCharsetPropertyName, AiCharsetPropertyName>;
declare function analyzeProblemStatement(statement: string): AiProblemProfile;
declare function selectAiContract(statement: string): AiContractSelection;
declare function resolveAiContractAllowance(selection: AiContractSelection): AiContractAllowance;
declare function renderAiGenesisContractDts(selection?: AiContractSelection): string;
declare function renderAiGenesisContractMarkdown(selection?: AiContractSelection): string;
declare function isAiFormatMethodName(value: string): value is AiFmtMethodName;
declare function isAiGeneratorMethodName(value: string): value is AiGeneratorMethodName;
//#endregion
export { AI_BASE_METHOD_SIGNATURES, AI_CHARSET_PROPERTIES, AI_FMT_METHOD_SIGNATURES, AI_GENERATOR_METHOD_SIGNATURES, type AiContractAllowance, type AiContractSelection, type AiProblemProfile, type Dataset, type DatasetCase, type DatasetCaseRecord, type DatasetCaseSelector, type DatasetCaseStatus, type DatasetCheckOptions, type DatasetCheckReport, type DatasetConfig, type DatasetConstraints, type DatasetErrorPhase, type DatasetErrorRecord, type DatasetFileRecord, type DatasetGenerateContext, type DatasetGeneratedCase, type DatasetGenerator, type DatasetManifest, type DatasetManifestSummary, type DatasetReplayInfo, type DatasetReplaySelector, type DatasetRunOptions, type DatasetRunResult, type DatasetStaticCase, type DatasetValidationContext, type DatasetValidationResult, type DatasetValidationReturn, type DatasetValidationSummary, type DriftCode, type DriftIssue, type ExpandedDatasetCase, type FieldConstraint, type FileDigest, type FormatAtom, type FormatDocument, type FormatGrid, type FormatLine, type FormatNode, type FormatRaw, type FormatRowsOptions, type FormatSeq, type FormatTable, type FormatTableOptions, type LintAllowance, type LintIssue, type LintOptions, type LintSeverity, type LoadedManifest, MANIFEST_PATH_BASE, MANIFEST_VERSION, type ManifestBuildInput, type ManifestBuildResult, type ManifestExecutionRef, type ManifestFileRef, type ManifestReplayRef, type ManifestSourceRef, type SeedInput, analyzeProblemStatement, buildExecutionFingerprint, checkConstraints, checkDataset, checkDatasetFromFile, createFormatDocument, createGenerator, createSeededRng, defaultLintAllowance, defaultManifestPath, defineDataset, describeFile, digestFile, expandDatasetCases, fmt, formatLintIssue, generateDataset, generateDatasetFromFile, isAiFormatMethodName, isAiGeneratorMethodName, isDataset, isFormatDocument, isFormatNode, lintDatasetConfig, lintMakerSource, loadDatasetFromFile, normalizeFormat, parseConstraintPath, readManifest, relativizePath, renderAiGenesisContractDts, renderAiGenesisContractMarkdown, renderFormatDocument, replayDataset, replayDatasetFromFile, resolveAiContractAllowance, resolveDatasetConfig, resolveManifestPath, selectAiContract, selectDatasetCases, sourceMatches, toPortablePath, validateDataset, validateDatasetFromFile, writeManifest };
//# sourceMappingURL=index.d.ts.map