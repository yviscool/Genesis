// src/types.ts

/**
 * The core configuration object for Genesis.
 * Users pass this object to `Maker.configure()` to customize generation behavior.
 */
export interface GenesisConfig {
  /**
   * The path to the C++ solution source file.
   * @default ['std.cpp', 'main.cpp', 'solution.cpp'] // Automatically searched in order
   */
  solution?: string;

  /**
   * The output directory for the generated test data.
   * @default 'data'
   */
  outputDir?: string;

  /**
   * The starting number for test case files.
   * @default 1
   */
  startFrom?: number;

  /**
   * Specifies the C++ compiler command to use.
   * If not specified, Genesis will automatically detect 'g++' or 'clang++'.
   * @example 'g++-12'
   */
  compiler?: string;

  /**
   * Extra flags to pass to the C++ compiler.
   * @default ['-O2', '-std=c++17']
   */
  compilerFlags?: string[];
}

/**
 * Describes the internal structure of a test case to be generated.
 */
export interface Case {
  /**
   * The generator function that returns structured data.
   */
  generator: () => any;
  /**
   * An optional label for the test case, used in logging.
   */
  label?: string;
}

export interface DebugOptions {
  /**
   * The separator between array elements.
   * @default ' '
   */
  separator?: string;
  /**
   * Whether to print the dimensions before an array/matrix (e.g., "5", "10 5").
   * @default false
   */
  printDims?: boolean;
  /**
   * Whether to print the inferred data type.
   * @default true
   */
  printType?: boolean;
  /**
   * For numeric arrays/matrices, whether to print statistics (min, max, sum).
   * @default false
   */
  printStats?: boolean;
  /**
   * For large arrays, the maximum number of rows/elements to display. Others are shown as '...'.
   * @default 50
   */
  truncate?: number;
}

/**
 * The comparison mode for the checker.
 * - `normalized`: Ignores trailing whitespace and blank lines (simulates `diff -bB`).
 * - `exact`: Performs a strict, character-by-character comparison.
 */
export type CompareMode = 'normalized' | 'exact';

/**
 * The core configuration object for the Checker.
 */
export interface CheckerConfig {
  /**
   * The path to the source file of the standard (correct) solution.
   */
  std: string;

  /**
   * The path to the source file of the program to be tested.
   */
  target: string;

  /**
   * Specifies the C++ compiler command to use.
   * If not specified, Genesis will automatically detect 'g++' or 'clang++'.
   * @example 'g++-12'
   */
  compiler?: GenesisConfig['compiler'];

  /**
   * Extra flags to pass to the C++ compiler.
   * @default ['-O2', '-std=c++17']
   */
  compilerFlags?: GenesisConfig['compilerFlags'];

  /**
   * The comparison mode.
   * @default 'normalized'
   */
  compareMode?: CompareMode;
}