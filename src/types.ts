// src/types.ts

/**
 * Genesis 的核心配置对象。
 * 用户通过 Maker.configure() 传入此对象来定制生成行为。
 */
export interface GenesisConfig {
  /**
   * C++ 解决方案的源文件路径。
   * @default ['std.cpp', 'main.cpp', 'solution.cpp'] // 会自动按顺序查找
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
   * 指定要使用的 C++ 编译器命令。
   * 如果不指定，Genesis 会自动探测 'g++' 或 'clang++'。
   * @example 'g++-12'
   */
  compiler?: string;

  /**
   * 传递给 C++ 编译器的额外标志。
   * @default ['-O2', '-std=c++17']
   */
  compilerFlags?: string[];
}

/**
 * 描述一个待生成的测试用例的内部结构。
 */
export interface Case {
  /**
   * 生成器函数，返回结构化数据。
   */
  generator: () => any;
  /**
   * 测试用例的可选标签，用于日志输出。
   */
  label?: string;
}

export interface DebugOptions {
  /** * 数组元素之间的分隔符. 
   * @default ' ' 
   */
  separator?: string;
  /** * 是否在数组/矩阵前打印其维度 (e.g., "5", "10 5").
   * @default false 
   */
  printDims?: boolean;
  /** * 是否打印推断出的数据类型.
   * @default true 
   */
  printType?: boolean;
  /**
   * 对于数字数组/矩阵, 是否打印统计信息 (min, max, sum).
   * @default false
   */
  printStats?: boolean;
  /**
   * 对于大型数组, 最多显示的行数/元素数. 超出部分会显示 '...'.
   * @default 50
   */
  truncate?: number;
}