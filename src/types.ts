// src/types.ts

/**
 * The core configuration object for Genesis.
 * Users pass this object to `Maker.configure()` to customize generation behavior.
 */
export interface GenesisConfig {
  /**
   * The path to the solution source file (e.g., 'std.cpp', 'main.go').
   * If not specified, Genesis will search for common default filenames.
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
   * Specifies the compiler command to use for compiled languages.
   * If not specified, Genesis automatically detects the appropriate compiler 
   * (e.g., 'g++', 'clang++', 'go', 'rustc', 'javac').
   * @example 'g++-12'
   */
  compiler?: string;

  /**
   * Extra flags to pass to the compiler for compiled languages.
   * These are appended to the default flags for the detected language.
   * @example ['-std=c++20']
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
 * The type of graph to generate.
 * - `simple`: A standard graph allowing cycles and multiple components.
 * - `tree`: A connected acyclic graph.
 * - `dag`: A directed acyclic graph.
 * - `bipartite`: A graph whose vertices can be divided into two disjoint sets.
 */
export type GraphType = 'simple' | 'tree' | 'dag' | 'bipartite';

/**
 * Configuration options for `G.graph`.
 */
export interface GraphOptions {
  /** The type of graph to generate. @default 'simple' */
  type?: GraphType;
  /** Whether the graph is directed. @default false */
  directed?: boolean;
  /** 
   * Whether edges are weighted. 
   * - `true`: weights from 1 to 1,000,000,000.
   * - `[min, max]`: weights in the specified range.
   * @default false
   */
  weighted?: boolean | [number, number];
  /** Whether to ensure the graph is connected. @default false */
  connected?: boolean;
  /** Whether to prevent self-loops (e.g., u-u). @default true */
  noSelfLoops?: boolean;
  /** Whether vertex numbering is 1-based. @default true */
  oneBased?: boolean;
}

/**
 * The type of tree to generate.
 * - `random`: A random tree structure.
 * - `path`: A tree where vertices form a single chain.
 * - `star`: A tree with a central vertex connected to all others.
 */
export type TreeType = 'random' | 'path' | 'star';

/**
 * Configuration options for `G.tree`.
 */
export interface TreeOptions {
  /** The type of tree structure to generate. @default 'random' */
  type?: TreeType;
  /** 
   * Whether edges are weighted. 
   * - `true`: weights from 1 to 1,000,000,000.
   * - `[min, max]`: weights in the specified range.
   * @default false
   */
  weighted?: boolean | [number, number];
  /** Whether vertex numbering is 1-based. @default true */
  oneBased?: boolean;
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
   * Specifies the compiler command to use for compiled languages.
   * If not specified, Genesis automatically detects the appropriate compiler.
   * @example 'g++-12'
   */
  compiler?: GenesisConfig['compiler'];

  /**
   * Extra flags to pass to the compiler for compiled languages.
   */
  compilerFlags?: GenesisConfig['compilerFlags'];

  /**
   * The comparison mode.
   * @default 'normalized'
   */
  compareMode?: CompareMode;
}