//#region src/format.d.ts
type FormatAtom = string | number | bigint | boolean | null | undefined;
interface FormatLine {
  readonly kind: 'line';
  readonly items: readonly FormatAtom[];
}
interface FormatTable {
  readonly kind: 'table';
  readonly rows: readonly (readonly FormatAtom[])[];
}
interface FormatGrid {
  readonly kind: 'grid';
  readonly rows: readonly (string | readonly FormatAtom[])[];
}
interface FormatRaw {
  readonly kind: 'raw';
  readonly text: string;
}
type FormatNode = FormatLine | FormatTable | FormatGrid | FormatRaw;
interface FormatDocument {
  readonly __genesisFormat: 2;
  readonly nodes: readonly FormatNode[];
}
declare const fmt: {
  readonly line: (...items: FormatAtom[]) => FormatLine;
  readonly lines: (...rows: (FormatNode | readonly FormatAtom[] | FormatAtom)[]) => FormatDocument;
  readonly table: (rows: readonly (readonly FormatAtom[])[]) => FormatTable;
  readonly grid: (rows: readonly (string | readonly FormatAtom[])[]) => FormatGrid;
  readonly raw: (text: string) => FormatRaw;
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
//#region src/dataset-runner.d.ts
interface DatasetRunOptions {
  mode: 'generate' | 'validate';
  datasetFile?: string | null;
  replay?: DatasetReplayInfo | null;
  outputDir?: string;
  manifestPath?: string | false;
  cleanOutputDir?: boolean;
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
type DatasetCaseStatus = 'success' | 'failure';
type DatasetErrorPhase = 'config' | 'materialize' | 'format' | 'validate' | 'write-input' | 'execution' | 'write-output' | 'manifest';
interface DatasetErrorRecord {
  phase: DatasetErrorPhase;
  kind: 'generator' | 'formatter' | 'validation' | 'io' | 'execution' | 'timeout' | 'config';
  message: string;
}
interface DatasetFileRecord {
  path: string;
  sha256: string;
  bytes: number;
  lines?: number;
}
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
  input: DatasetFileRecord | null;
  output: DatasetFileRecord | null;
  error: DatasetErrorRecord | null;
}
interface DatasetManifest {
  version: 2;
  tool: {
    name: 'genesis-kit';
    version: string;
  };
  generatedAt: string;
  dataset: {
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
  };
  execution: {
    runArgs: string[];
    executablePath: string;
    fingerprint: string;
  } | null;
  replay: DatasetReplayInfo | null;
  summary: {
    totalCases: number;
    succeeded: number;
    failed: number;
    durationMs: number;
  };
  cases: DatasetCaseRecord[];
}
interface DatasetRunResult {
  manifest: DatasetManifest | null;
  results: DatasetCaseRecord[];
  summary: DatasetManifest['summary'];
}
declare function loadDatasetFromFile(entryFile?: string): Promise<Dataset<unknown>>;
declare function validateDatasetFromFile(entryFile?: string): Promise<DatasetRunResult>;
declare function generateDatasetFromFile(entryFile?: string): Promise<DatasetRunResult>;
declare function replayDatasetFromFile(entryFile: string, selector: DatasetReplaySelector): Promise<DatasetRunResult>;
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
export { AI_BASE_METHOD_SIGNATURES, AI_CHARSET_PROPERTIES, AI_FMT_METHOD_SIGNATURES, AI_GENERATOR_METHOD_SIGNATURES, type AiContractAllowance, type AiContractSelection, type AiProblemProfile, type Dataset, type DatasetCase, type DatasetCaseRecord, type DatasetConfig, type DatasetErrorPhase, type DatasetErrorRecord, type DatasetFileRecord, type DatasetGenerateContext, type DatasetGeneratedCase, type DatasetGenerator, type DatasetManifest, type DatasetReplayInfo, type DatasetReplaySelector, type DatasetRunOptions, type DatasetRunResult, type DatasetStaticCase, type DatasetValidationContext, type DatasetValidationResult, type DatasetValidationReturn, type DatasetValidationSummary, type ExpandedDatasetCase, type FormatAtom, type FormatDocument, type FormatGrid, type FormatLine, type FormatNode, type FormatRaw, type FormatTable, type SeedInput, analyzeProblemStatement, createFormatDocument, createGenerator, createSeededRng, defineDataset, expandDatasetCases, fmt, generateDataset, generateDatasetFromFile, isAiFormatMethodName, isAiGeneratorMethodName, isDataset, isFormatDocument, isFormatNode, loadDatasetFromFile, normalizeFormat, renderAiGenesisContractDts, renderAiGenesisContractMarkdown, renderFormatDocument, replayDataset, replayDatasetFromFile, resolveAiContractAllowance, selectAiContract, validateDataset, validateDatasetFromFile };
//# sourceMappingURL=index.d.mts.map