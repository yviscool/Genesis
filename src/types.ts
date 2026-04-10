// src/types.ts

/**
 * Genesis 的核心配置对象。
 * 用户通过 `Maker.configure()` 传入此对象，以此来定制数据生成器的行为。
 */
export interface GenesisConfig {
  /**
   * 标程（标准解答）的源文件路径 (例如 'std.cpp', 'main.go')。
   * 如果未指定，Genesis 会自动搜索常见的默认文件名。
   */
  solution?: string;

  /**
   * 生成的测试数据的输出目录。
   * @default 'data'
   */
  outputDir?: string;

  /**
   * 测试用例文件的起始编号。
   * @default 1
   */
  startFrom?: number;

  /**
   * Timeout (ms) for running the standard solution while generating `.out` files.
   * @default 10000
   */
  runTimeoutMs?: number;

  /**
   * 用于编译型语言的编译器命令。
   * 如果未指定，Genesis 会自动根据文件后缀检测合适的编译器
   * (例如 'g++', 'clang++', 'go', 'rustc', 'javac')。
   * @example 'g++-12'
   */
  compiler?: string;

  /**
   * 传递给编译器的额外参数/标志。
   * 这些参数会被追加到对应语言的默认编译命令之后。
   * @example ['-std=c++20']
   */
  compilerFlags?: string[];

  /**
   * Maximum number of generation workers.
   * If `caseConcurrency` is also set, `caseConcurrency` takes precedence.
   */
  maxWorkers?: number;

  /**
   * Configurable generation concurrency.
   * Genesis may still lower it automatically for large inputs or low free memory.
   */
  caseConcurrency?: number;

  /**
   * Preferred OJ environment profile for platform-specific compiler tweaks.
   * `auto` keeps Genesis defaults. `none` disables automatic stack tuning.
   */
  ojProfile?: OjProfile;

  /**
   * Override stack size for compiled programs when a platform-specific stack flag is applicable.
   * The value is expressed in bytes.
   */
  stackSizeBytes?: number;

  /**
   * Optional path for the machine-readable generation manifest.
   * Defaults to a sibling file next to `outputDir`, such as `data.manifest.json`.
   * Set to `false` to disable manifest output.
   */
  manifestPath?: string | false;
}

export type OjProfile = 'auto' | 'linux' | 'windows' | 'none';

/**
 * 描述待生成的单个测试点的内部结构。
 */
export interface Case {
  /**
   * 返回结构化数据的生成器函数。
   */
  generator: () => any;
  /**
   * 测试点的可选标签，用于日志输出，方便识别。
   */
  label?: string;
  /**
   * Optional machine-readable tags for downstream tooling.
   */
  tags?: string[];
}

export interface CaseMetadata {
  label?: string;
  tags?: string[];
}

export interface MakerValidationContext {
  caseNumber: number;
  label?: string;
  tags: string[];
  inputPath: string;
  outputDir: string;
}

export interface MakerValidationResult {
  ok: boolean;
  reason?: string;
}

export type MakerValidationReturn =
  | void
  | boolean
  | string
  | MakerValidationResult;

export type MakerValidator = (
  data: any,
  context: MakerValidationContext,
) => MakerValidationReturn | Promise<MakerValidationReturn>;

/**
 * 调试输出的配置选项。
 */
export interface DebugOptions {
  /**
   * 数组/矩阵元素之间的分隔符。
   * @default ' '
   */
  separator?: string;
  /**
   * 是否在打印数组/矩阵内容前先打印其维度信息 (例如 "5", "10 5")。
   * @default false
   */
  printDims?: boolean;
  /**
   * 是否打印推断出的数据类型信息。
   * @default true
   */
  printType?: boolean;
  /**
   * 对于数值型数组/矩阵，是否打印统计信息 (最小值, 最大值, 和)。
   * @default false
   */
  printStats?: boolean;
  /**
   * 对于大型数组，指定最多显示多少行/个元素。超出的部分将显示为 '...'。
   * @default 50
   */
  truncate?: number;
  /**
   * 是否启用颜色输出。设为 false 可禁用（适用于 CI 环境）。
   * @default true
   */
  colors?: boolean;
}

/**
 * 要生成的图的类型。
 * - `simple`: 普通图（允许存在环和不连通分量）。
 * - `tree`: 树（连通无环图）。
 * - `dag`: 有向无环图 (DAG)。
 * - `bipartite`: 二分图（顶点可被划分为两个互不相交的集合）。
 * - `wheel`: [新增] 轮图（一个中心点连接所有外围顶点，外围形成环）。
 * - `complete`: [新增] 完全图（每对顶点之间都有边）。
 */
export type GraphType = 'simple' | 'tree' | 'dag' | 'bipartite' | 'wheel' | 'complete';

/**
 * 边权配置选项。
 * - `true`: 随机生成 1 到 10^9 之间的权重。
 * - `[min, max]`: 在指定范围内生成权重。
 */
export type WeightOption = boolean | [min: number, max: number];

/**
 * `G.graph` 的配置选项。
 */
export interface GraphOptions {
  /** 图的类型。 @default 'simple' */
  type?: GraphType;
  /** 是否为有向图。 @default false */
  directed?: boolean;
  /** 边权配置。 @default false */
  weighted?: WeightOption;
  /** 是否保证图是连通的。 @default false */
  connected?: boolean;
  /** 是否禁止自环 (例如 u-u 的边)。 @default true */
  noSelfLoops?: boolean;
  /** 顶点编号是否从 1 开始。 @default true */
  oneBased?: boolean;
  /** [新增] 是否生成带负权环的图 (用于卡 Bellman-Ford)。 @default false */
  negativeCycle?: boolean;
}

/**
 * 要生成的树的类型。
 * - `random`: 随机树结构。
 * - `path`: 链（路径图），顶点连成一条线。
 * - `star`: 菊花图（星形图），一个中心点连接所有其他点。
 */
export type TreeType = 'random' | 'path' | 'star';

/**
 * `G.tree` 的配置选项。
 */
export interface TreeOptions {
  /** 树的结构类型。 @default 'random' */
  type?: TreeType;
  /** 边权配置。 @default false */
  weighted?: WeightOption;
  /** 顶点编号是否从 1 开始。 @default true */
  oneBased?: boolean;
}

/**
 * 二叉树的结构类型。
 * - `random`: 随机二叉树。
 * - `complete`: 完全二叉树。
 * - `skewed`: 倾斜二叉树（链状）。
 */
export type BinaryTreeType = 'random' | 'complete' | 'skewed';

/**
 * `G.binaryTree` 的配置选项。
 */
export interface BinaryTreeOptions {
  /** 二叉树的结构类型。 @default 'random' */
  type?: BinaryTreeType;
  /** 顶点编号是否从 1 开始。 @default true */
  oneBased?: boolean;
}

/**
 * 对拍器 (Checker) 的比对模式。
 * - `normalized`: 标准化比对，忽略行末空格和文末空行（模拟 `diff -bB`）。
 * - `exact`: 严格比对，逐字符完全一致。
 */
export type CompareMode = 'normalized' | 'exact';

/**
 * Checker (对拍器) 的核心配置对象。
 */
export interface CheckerConfig {
  /**
   * 标程（正确解法）的源文件路径。
   */
  std: string;

  /**
   * 待测程序（用户代码）的源文件路径。
   */
  target: string;

  /**
   * 用于编译型语言的编译器命令。
   * 如果未指定，Genesis 会自动检测合适的编译器。
   * @example 'g++-12'
   */
  compiler?: GenesisConfig['compiler'];

  /**
   * 传递给编译器的额外参数/标志。
   */
  compilerFlags?: GenesisConfig['compilerFlags'];

  /**
   * Preferred OJ environment profile for platform-specific compiler tweaks.
   */
  ojProfile?: GenesisConfig['ojProfile'];

  /**
   * Override stack size for compiled programs when a platform-specific stack flag is applicable.
   */
  stackSizeBytes?: GenesisConfig['stackSizeBytes'];

  /**
   * 比对模式。
   * @default 'normalized'
   */
  compareMode?: CompareMode;
  workers?: number;
}
