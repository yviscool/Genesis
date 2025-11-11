// src/generator.ts
import type { DebugOptions, TreeOptions, GraphOptions } from './types'
import pc from 'picocolors';
import { shuffle as esShuffle, sampleSize as esSampleSize, chunk as esChunk } from 'es-toolkit';

/**
 * Defines the full interface for the Genesis data generator (G).
 * This is the exposed API "blueprint", containing type signatures and detailed English documentation for all functions.
 */
interface IGenerator {
  /**
   * Commonly used predefined character sets for string generation.
   * @example
   * G.CHARSET.LOWERCASE // 'abcdefghijklmnopqrstuvwxyz'
   * G.CHARSET.ALPHANUMERIC // 'abcdef...XYZ012...9'
   */
  readonly CHARSET: {
    readonly LOWERCASE: string;
    readonly UPPERCASE: string;
    readonly DIGITS: string;
    readonly ALPHANUMERIC: string;
    readonly ALPHA: string;
    /** The full character set for representing up to base-36. */
    readonly BASE36: string;
  };

  /**
   * Generates a random integer within a [min, max] range (inclusive).
   * @param min The minimum value.
   * @param max The maximum value.
   * @returns A random integer.
   * @example G.int(1, 10) // => 7
   */
  int(min: number, max: number): number;

  /**
   * Generates an array of n random integers.
   * @param count The number of elements in the array.
   * @param min The minimum value for each integer.
   * @param max The maximum value for each integer.
   * @returns An array of random integers.
   * @example G.ints(5, 1, 100) // => [42, 88, 19, 7, 63]
   */
  ints(count: number, min: number, max: number): number[];

  /**
   * Generates an array of n distinct random integers within a [min, max] range.
   * @param count The number of distinct integers to generate.
   * @param min The minimum value for the integers.
   * @param max The maximum value for the integers.
   * @returns An array of distinct random integers.
   * @example G.distinctInts(5, 1, 10) // => [8, 2, 10, 5, 1]
   */
  distinctInts(count: number, min: number, max: number): number[];

  /**
   * Generates a random floating-point number within a [min, max] range.
   * @param min The minimum value.
   * @param max The maximum value.
   * @param precision The number of decimal places (default: 2).
   * @returns A random float.
   * @example G.float(1, 2, 4) // => 1.5821
   */
  float(min: number, max: number, precision?: number): number;

  /**
   * Generates a random even number within a [min, max] range.
   * @param min The minimum value.
   * @param max The maximum value.
   * @returns A random even number.
   * @example G.even(1, 100) // => 52
   */
  even(min: number, max: number): number;

  /**
   * Generates a random odd number within a [min, max] range.
   * @param min The minimum value.
   * @param max The maximum value.
   * @returns A random odd number.
   * @example G.odd(1, 100) // => 87
   */
  odd(min: number, max: number): number;

  /**
   * Generates a random string of a specified length.
   * @param len The length of the string.
   * @param charset The character set to use (default: G.CHARSET.ALPHANUMERIC).
   * @returns A random string.
   * @example G.string(10, G.CHARSET.DIGITS) // => "4815162342"
   */
  string(len: number, charset?: string): string;

  /**
   * [New] Generates a random palindrome of a specified length.
   * @param len The length of the palindrome.
   * @param charset The character set to use (default: lowercase letters).
   * @returns A palindrome string.
   * @example
   * G.palindrome(5) // => "level"
   * G.palindrome(6, '01') // => "100001"
   */
  palindrome(len: number, charset?: string): string;

  /**
   * Generates a random word (composed of lowercase letters).
   * @param minLen The minimum length.
   * @param maxLen The maximum length.
   * @returns A random word.
   * @example G.word(5, 8) // => "wxyzk"
   */
  word(minLen: number, maxLen: number): string;

  /**
   * Generates an array of n random words.
   * @param count The number of words.
   * @param minLen The minimum length of each word.
   * @param maxLen The maximum length of each word.
   * @returns An array of random words.
   * @example G.words(3, 4, 6) // => ["pfvj", "sxwoa", "bhuql"]
   */
  words(count: number, minLen: number, maxLen: number): string[];

  /**
   * The most powerful primitive generator, creates an array.
   * @param count The number of elements in the array.
   * @param itemGenerator A generator for each element, receiving the index `i` as an argument.
   * @returns An array generated according to the rule.
   * @example G.array(5, (i) => `${i}!`) // => ["0!", "1!", "2!", "3!", "4!"]
   */
  array<T>(count: number, itemGenerator: (index: number) => T): T[];

  /**
   * [New] Generates a sorted sequence, designed for problems involving binary search, two pointers, etc.
   * @param count The number of elements.
   * @param min The minimum value.
   * @param max The maximum value.
   * @param options Configuration options.
   * @returns A sorted array of numbers.
   * @example
   * G.sorted(5, 1, 100) // default non-decreasing
   * G.sorted(5, 1, 20, { order: 'strictlyAsc' }) // strictly increasing
   */
  sorted(count: number, min: number, max: number, options?: { order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc' }): number[];

  /**
   * [New] Generates a sparse sequence, ensuring the absolute difference between adjacent elements is at least `gap`.
   * @param count The number of elements.
   * @param min The minimum value.
   * @param max The maximum value.
   * @param gap The minimum gap.
   * @returns A sparse array of numbers (in random order).
   * @example G.sparse(10, 1, 100, 5) // e.g. [5, 20, 11, ...]
   */
  sparse(count: number, min: number, max: number, gap: number): number[];

  /**
   * [New] Generates a sequence of positive integers that sum to S, designed for knapsack or partition problems.
   * @param count The number of positive integers in the sequence.
   * @param sum The target sum.
   * @param options Configuration options.
   * @returns An array of numbers summing to `sum` (in random order).
   * @example G.partition(5, 100, { minVal: 10 }) // 5 numbers sum to 100, each >= 10
   */
  partition(count: number, sum: number, options?: { minVal?: number }): number[];

  /**
   * Generates a numeric matrix (2D array).
   * @param rows The number of rows.
   * @param cols The number of columns.
   * @param cellGenerator A generator for each cell.
   * @returns A matrix generated according to the rule.
   * @example G.matrix(2, 3, () => G.int(0, 9))
   */
  matrix<T>(rows: number, cols: number, cellGenerator: (rowIndex: number, colIndex: number) => T): T[][];

  /**
   * [New] Generates a 0-1 matrix.
   * @param rows The number of rows.
   * @param cols The number of columns.
   * @param density The density of 1s (between 0 and 1, default 0.5).
   * @returns A matrix containing only 0s and 1s.
   * @example G.grid01(10, 10, 0.3) // 10x10, ~30% of 1s
   */
  grid01(rows: number, cols: number, density?: number): number[][];

  /**
   * [New] Generates a random maze that is guaranteed to be fully connected.
   * @param rows The number of rows.
   * @param cols The number of columns.
   * @param options Configuration options.
   * @returns A maze matrix composed of wall and road characters.
   * @example G.maze(11, 11, { wall: '#', road: '.' })
   */
  maze(rows: number, cols: number, options?: { wall?: string, road?: string }): string[][];

  /**
   * 🌳 Generates a tree with n vertices.
   * This is a convenience wrapper around `G.graph(n, n - 1, { connected: true, ... })`.
   * @param n The number of vertices.
   * @param options Configuration options for the tree.
   * @returns An edge list representing the tree.
   * @example
   * G.tree(10) // A random tree with 10 vertices
   * G.tree(5, { type: 'path' }) // A path graph: 1-2-3-4-5
   */
  tree(n: number, options?: TreeOptions): number[][];

  /**
   * 🕸️ Generates a graph with n vertices and m edges.
   * The most powerful graph generation tool.
   * @param n The number of vertices.
   * @param m The number of edges.
   * @param options Configuration options for the graph.
   * @returns An edge list representing the graph, e.g., `[[u, v, w], ...]`.
   * @example
   * // A simple undirected, connected graph with 10 vertices and 12 edges
   * G.graph(10, 12, { connected: true })
   * // A directed, weighted DAG
   * G.graph(10, 15, { type: 'dag', directed: true, weighted: [1, 100] })
   */
  graph(n: number, m: number, options?: GraphOptions): number[][];

  /**
   * Generates a permutation from 1 to n (or 0 to n-1).
   * @param n The number of elements.
   * @param oneBased Whether to start from 1 (default: true).
   * @returns A random permutation.
   * @example G.permutation(5) // => [3, 1, 5, 2, 4]
   */
  permutation(n: number, oneBased?: boolean): number[];

  /**
   * Shuffles the elements of an array randomly (returns a new array, does not modify the original).
   * @param array The array to shuffle.
   * @returns A new array with the order of elements shuffled.
   * @example G.shuffle([1, 2, 3]) // => [2, 3, 1]
   */
  shuffle<T>(array: readonly T[]): T[];

  /**
   * Splits an array into chunks of a specified size.
   * @param array The source array.
   * @param size The size of each chunk.
   * @returns A 2D array.
   * @example G.chunk([1, 2, 3, 4, 5], 2) // => [[1, 2], [3, 4], [5]]
   */
  chunk<T>(array: readonly T[], size: number): T[][];

  /**
   * Checks if a year is a leap year.
   * @param year The year.
   * @returns True if it is a leap year.
   * @example G.isLeap(2000) // => true
   */
  isLeap(year: number): boolean;

  /**
   * Generates a random year within a specified range.
   * @param minYear The minimum year (default: 1970).
   * @param maxYear The maximum year (default: current year).
   * @returns A random year.
   * @example G.year(2000, 2010) // => 2005
   */
  year(minYear?: number, maxYear?: number): number;

  /**
   * Generates a random date string within a specified range.
   * @param options Configuration options.
   * @returns A formatted random date string.
   * @example G.date({ format: 'YYYY/MM/DD' }) // => "2023/07/15"
   */
  date(options?: { minYear?: number; maxYear?: number; format?: string }): string;

  /**
   * (Usage 1) Samples a random element from an array.
   * @param population The source array.
   * @returns A random element.
   * @example G.sample(['a', 'b', 'c']) // => 'b'
   */
  sample<T>(population: readonly T[]): T;
  /**
   * (Usage 2) Samples k distinct elements from an array.
   * @param population The source array.
   * @param k The number of elements to sample.
   * @returns An array of k distinct elements.
   * @example G.sample(['a', 'b', 'c'], 2) // => ['c', 'a']
   */
  sample<T>(population: readonly T[], k: number): T[];

  /**
   * 🗺️ Generates n 2D points on a plane.
   * @param n The number of points.
   * @param minVal The minimum coordinate value.
   * @param maxVal The maximum coordinate value.
   * @param options Configuration options for generating special distributions of points.
   * @returns A list of point coordinates, e.g., [[x1, y1], [x2, y2], ...].
   * @example
   * G.points(10, -100, 100) // 10 random points
   * G.points(10, -100, 100, { type: 'collinear' }) // 10 collinear points
   */
  points(n: number, minVal: number, maxVal: number, options?: {
    type?: 'random' | 'collinear'
  }): number[][];

  /**
   * 🌀 [Internal] Radix conversion and encoding toolset.
   * Provides generic, atomic radix conversion capabilities.
   */
  readonly base: {
    /**
     * [Core] Generic radix conversion function, supports large numbers and includes strict validation.
     * @param input The number to convert (handles number, bigint, string automatically).
     * @param fromRadix The original radix (2-36).
     * @param toRadix The target radix (2-36).
     * @returns The converted number as an uppercase string.
     * @example G.base.convert('1010', 2, 10) // => '10'
     */
    convert(input: string | number | bigint, fromRadix: number, toRadix: number): string;

    /**
     * [Alias] Converts a binary string to hexadecimal. Most common in competitive programming.
     * @param binString A valid binary string.
     * @returns The converted uppercase hexadecimal string.
     * @example G.base.binToHex('111100001010') // => 'F0A'
     */
    binToHex(binString: string): string;

    /**
     * [Alias] Converts a hexadecimal string to binary. Most common in competitive programming.
     * @param hexString A valid hexadecimal string.
     * @returns The converted binary string.
     * @example G.base.hexToBin('F0A') // => '111100001010'
     */
    hexToBin(hexString: string): string;
    
    /**
     * Generates a random number string of a specified length and radix.
     * Strictly adheres to the "no extra leading zeros" convention.
     * @param length The number of digits/length of the number.
     * @param radix The base (2-36).
     * @returns A random uppercase number string in the specified radix.
     * @example
     * G.base.digits(100, 2)  // Generates a 100-digit binary number
     * G.base.digits(30, 16)  // Generates a 30-digit hexadecimal number
     */
    digits(length: number, radix: number): string;

  };

  /**
   * [Ultimate] A deep debug printing tool that can analyze and elegantly format any generated data.
   * Supports function overloading, can be passed data or "label + data".
   * @param data The data to inspect.
   * @param options Formatting options.
   */
  debug<T>(data: T, options?: DebugOptions): void;
  /**
   * [Ultimate] A deep debug printing tool that can analyze and elegantly format any generated data.
   * Supports function overloading, can be passed data or "label + data".
   * @param label A descriptive label for the data.
   * @param data The data to inspect.
   * @param options Formatting options.
   */
  debug<T>(label: string, data: T, options?: DebugOptions): void;

}

/**
 * The concrete implementation of the G object.
 */
export const G: IGenerator = {
  CHARSET: {
    LOWERCASE: 'abcdefghijklmnopqrstuvwxyz',
    UPPERCASE: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    DIGITS: '0123456789',
    get ALPHANUMERIC() { return this.LOWERCASE + this.UPPERCASE + this.DIGITS; },
    get ALPHA() { return this.LOWERCASE + this.UPPERCASE; },
    get BASE36() { return this.DIGITS + this.UPPERCASE; },
  },

  int(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  ints(count, min, max) {
    return Array.from({ length: count }, () => this.int(min, max));
  },

  distinctInts(count, min, max) {
    const range = max - min + 1;
    if (count > range) {
      throw new Error(`Cannot generate ${count} distinct integers from a range of size ${range}.`);
    }
    const s = new Set<number>();
    while (s.size < count) s.add(this.int(min, max));
    return Array.from(s);
  },

  float(min, max, precision = 2) {
    const value = Math.random() * (max - min) + min;
    return parseFloat(value.toFixed(precision));
  },

  even(min, max) {
    const start = min % 2 === 0 ? min : min + 1;
    const end = max % 2 === 0 ? max : max - 1;
    if (start > end) throw new Error(`No even numbers exist in the range [${min}, ${max}].`);
    const numChoices = (end - start) / 2;
    return start + this.int(0, numChoices) * 2;
  },

  odd(min, max) {
    const start = min % 2 !== 0 ? min : min + 1;
    const end = max % 2 !== 0 ? max : max - 1;
    if (start > end) throw new Error(`No odd numbers exist in the range [${min}, ${max}].`);
    const numChoices = (end - start) / 2;
    return start + this.int(0, numChoices) * 2;
  },

  string(len, charset = G.CHARSET.ALPHANUMERIC) {
    let result = '';
    for (let i = 0; i < len; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  },
  
  palindrome(len: number, charset = G.CHARSET.LOWERCASE): string {
    if (len <= 0) return '';
    const halfLen = Math.floor(len / 2);
    const left = this.string(halfLen, charset);
    const right = left.split('').reverse().join('');
    if (len % 2 === 1) {
        const mid = this.sample(charset.split(''));
        return left + mid + right;
    }
    return left + right;
  },

  word(minLen, maxLen) {
    return this.string(this.int(minLen, maxLen), G.CHARSET.LOWERCASE);
  },

  words(count, minLen, maxLen) {
    return Array.from({ length: count }, () => this.word(minLen, maxLen));
  },

  array(count, itemGenerator) {
    return Array.from({ length: count }, (_, i) => itemGenerator(i));
  },

  sorted(count: number, min: number, max: number, options: { order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc' } = {}): number[] {
    const { order = 'asc' } = options;
    if (order === 'strictlyAsc' || order === 'strictlyDesc') {
        const nums = this.distinctInts(count, min, max);
        return nums.sort((a, b) => order === 'strictlyAsc' ? a - b : b - a);
    }
    const nums = this.ints(count, min, max);
    return nums.sort((a, b) => order === 'asc' ? a - b : b - a);
  },

  sparse(count: number, min: number, max: number, gap: number): number[] {
    if ((count - 1) * gap > max - min) {
        throw new Error(`Cannot generate ${count} sparse numbers with gap ${gap} in range [${min}, ${max}]. Range is too small.`);
    }
    const baseValues = this.sorted(count, 0, max - min - (count - 1) * gap);
    const sparseValues = baseValues.map((val, i) => min + val + i * gap);
    return this.shuffle(sparseValues);
  },

  partition(count: number, sum: number, options: { minVal?: number } = {}): number[] {
      const { minVal = 1 } = options;
      if (count * minVal > sum) {
          throw new Error(`Cannot partition sum ${sum} into ${count} parts with minVal ${minVal}. Required sum is at least ${count * minVal}.`);
      }
      const adjustedSum = sum - count * minVal;
      const cuts = this.sorted(count - 1, 0, adjustedSum);
      const points = [0, ...cuts, adjustedSum];
      const parts = [];
      for (let i = 0; i < count; i++) {
        // Use non-null assertion to assure TypeScript that these elements exist
        const start = points[i]!;     // Assert not null/undefined
        const end = points[i + 1]!;   // Assert not null/undefined
        parts.push(end - start + minVal);
      }
      return this.shuffle(parts);
  },

  matrix(rows, cols, cellGenerator) {
    return Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (__, j) => cellGenerator(i, j))
    );
  },
  
  grid01(rows: number, cols: number, density: number = 0.5): number[][] {
    return this.matrix(rows, cols, () => Math.random() < density ? 1 : 0);
  },

  maze(rows: number, cols: number, options: { wall?: string, road?: string } = {}): string[][] {
    const { wall = '#', road = '.' } = options;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(wall));
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const stack: [number, number][] = [];

    // Start from a valid road position
    const startR = 1;
    const startC = 1;
    if (startR >= rows || startC >= cols) return grid; // Maze too small

    grid[startR][startC] = road;
    visited[startR][startC] = true;
    stack.push([startR, startC]);

    while (stack.length > 0) {
        const [r, c] = stack.pop()!;
        const neighbors: [number, number, number, number][] = []; // [nextR, nextC, wallR, wallC]
        
        // Check neighbors at distance 2
        const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
        this.shuffle(dirs);

        for (const [dr, dc] of dirs) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && !visited[nr][nc]) {
                neighbors.push([nr, nc, r + dr / 2, c + dc / 2]);
            }
        }
        
        if (neighbors.length > 0) {
            stack.push([r, c]);
            const [nextR, nextC, wallR, wallC] = this.sample(neighbors);
            
            grid[wallR][wallC] = road;
            grid[nextR][nextC] = road;
            visited[nextR][nextC] = true;
            stack.push([nextR, nextC]);
        }
    }
    return grid;
  },

  tree(n: number, options: TreeOptions = {}): number[][] {
    const { type = 'random', oneBased = true, weighted = false } = options;

    if (n <= 0) return [];
    if (n === 1) return [];

    const edges: number[][] = [];

    if (type === 'path') {
      const nodes = this.permutation(n, false);
      for (let i = 0; i < n - 1; i++) {
        edges.push([nodes[i], nodes[i+1]]);
      }
    } else if (type === 'star') {
      const nodes = this.permutation(n, false);
      const center = nodes[0];
      for (let i = 1; i < n; i++) {
        edges.push([center, nodes[i]]);
      }
    } else { // random
      const nodes = this.permutation(n, false);
      // A simple and effective way to generate a random tree (related to Prüfer sequences)
      for (let i = 1; i < n; i++) {
        const u = nodes[i];
        const v = nodes[this.int(0, i - 1)];
        edges.push([u, v]);
      }
    }
    
    let result = this.shuffle(edges);

    if (weighted) {
      const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1_000_000_000];
      result.forEach(edge => edge.push(this.int(minW, maxW)));
    }

    if (oneBased) {
      result = result.map(edge => edge.map(val => val + 1));
    }

    return result;
  },

  graph(n: number, m: number, options: GraphOptions = {}): number[][] {
    const {
      type = 'simple',
      directed = false,
      weighted = false,
      connected = false,
      noSelfLoops = true,
      oneBased = true,
    } = options;

    // --- 1. Input Validation ---
    if (n <= 0) return [];
    if (type === 'tree') {
      if (m !== n - 1) throw new Error(`A tree with ${n} vertices must have ${n - 1} edges, but ${m} were requested.`);
    }
    if (connected && m < n - 1) {
      throw new Error(`A connected graph with ${n} vertices must have at least ${n - 1} edges.`);
    }
    const maxEdges = noSelfLoops ? n * (n - 1) / 2 : n * (n + 1) / 2;
    if (!directed && m > maxEdges) {
      throw new Error(`An undirected simple graph with ${n} vertices can have at most ${maxEdges} edges.`);
    }

    // --- 2. Edge Generation ---
    const edgeSet = new Set<string>();
    const addEdge = (u: number, v: number) => {
      if (noSelfLoops && u === v) return false;
      const key = directed ? `${u},${v}` : `${Math.min(u, v)},${Math.max(u, v)}`;
      if (edgeSet.has(key)) return false;
      edgeSet.add(key);
      return true;
    };

    if (type === 'tree') {
      return this.tree(n, { oneBased, weighted });
    }

    if (connected) {
      // Start by generating a random tree to ensure connectivity
      const treeEdges = this.tree(n, { type: 'random', oneBased: false });
      treeEdges.forEach(([u, v]) => addEdge(u, v));
    }

    if (type === 'dag') {
      const nodes = this.permutation(n, false); // Defines a topological sort
      while (edgeSet.size < m) {
        const u_idx = this.int(0, n - 1);
        const v_idx = this.int(0, n - 1);
        if (u_idx === v_idx) continue;
        const u = nodes[Math.min(u_idx, v_idx)];
        const v = nodes[Math.max(u_idx, v_idx)];
        addEdge(u, v); // Edge always goes from lower index to higher index in permutation
      }
    } else if (type === 'bipartite') {
      const nodes = this.permutation(n, false);
      const partition_size = this.int(1, n - 1);
      const setA = nodes.slice(0, partition_size);
      const setB = nodes.slice(partition_size);
      while (edgeSet.size < m) {
        const u = this.sample(setA);
        const v = this.sample(setB);
        addEdge(u, v);
      }
    } else { // 'simple'
      while (edgeSet.size < m) {
        const u = this.int(0, n - 1);
        const v = this.int(0, n - 1);
        addEdge(u, v);
      }
    }

    // --- 3. Post-processing ---
    let result = Array.from(edgeSet).map(key => key.split(',').map(Number));

    if (weighted) {
      const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1_000_000_000];
      result.forEach(edge => edge.push(this.int(minW, maxW)));
    }

    if (oneBased) {
      result = result.map(edge => edge.map(val => val + 1));
    }

    return this.shuffle(result);
  },

  permutation(n, oneBased = true) {
    const arr = Array.from({ length: n }, (_, i) => (oneBased ? i + 1 : i));
    return esShuffle(arr);
  },
  
  sample(population: readonly any[], k?: number): any {
    if (k === undefined) {
      if (population.length === 0) throw new Error('Cannot sample from an empty array.');
      return population[Math.floor(Math.random() * population.length)]!;
    }
    return esSampleSize(population, k);
  },

  shuffle: esShuffle,
  
  chunk: esChunk,
  
  isLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  },

  year(minYear = 1970, maxYear = new Date().getFullYear()) {
    return this.int(minYear, maxYear);
  },

  date(options = {}) {
    const { 
      minYear = 1970, 
      maxYear = new Date().getFullYear(), 
      format = 'YYYY-MM-DD' 
    } = options;
    const year = this.year(minYear, maxYear);
    const month = this.int(1, 12);
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (this.isLeap(year)) daysInMonth[1] = 29;
    const day = this.int(1, daysInMonth[month - 1]!);
    const yyyy = String(year);
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return format.replace('YYYY', yyyy).replace('MM', mm).replace('DD', dd);
  },

  points(n: number, minVal: number, maxVal: number, options: { type?: 'random' | 'collinear' } = {}): number[][] {
    const { type = 'random' } = options;

    if (type === 'random') {
        const pointSet = new Set<string>();
        // To avoid infinite loops when generating many points in a small range, we ensure points are unique
        // and only attempt to generate up to the maximum possible number of points in the coordinate range.
        const maxPossiblePoints = (maxVal - minVal + 1) ** 2;
        const targetCount = Math.min(n, maxPossiblePoints);

        while (pointSet.size < targetCount) {
            const x = this.int(minVal, maxVal);
            const y = this.int(minVal, maxVal);
            pointSet.add(`${x},${y}`);
        }
        return Array.from(pointSet).map(p => p.split(',').map(Number));
    }

    if (type === 'collinear') {
        if (n <= 1) return this.points(n, minVal, maxVal, { type: 'random' });
        
        let dx: number, dy: number, x0: number, y0: number;

        // Try up to 50 times to find a line segment that can fit n points, to prevent infinite loops.
        for (let attempt = 0; attempt < 50; attempt++) {
            // Generate a random, non-zero direction vector
            do {
                dx = this.int(-10, 10);
                dy = this.int(-10, 10);
            } while (dx === 0 && dy === 0);

            // Based on the direction vector (dx, dy) and number of points n, calculate the safe range for the starting point (x0, y0)
            const x0_min = dx >= 0 ? minVal : minVal - (n - 1) * dx;
            const x0_max = dx >= 0 ? maxVal - (n - 1) * dx : maxVal;

            const y0_min = dy >= 0 ? minVal : minVal - (n - 1) * dy;
            const y0_max = dy >= 0 ? maxVal - (n - 1) * dy : maxVal;

            // If the safe range is valid, generate the point set and return
            if (x0_min <= x0_max && y0_min <= y0_max) {
                x0 = this.int(x0_min, x0_max);
                y0 = this.int(y0_min, y0_max);
                
                const points = Array.from({ length: n }, (_, i) => [x0 + i * dx, y0 + i * dy]);
                return this.shuffle(points); // Shuffle to avoid regularity
            }
        }

        // If it still fails after multiple attempts (e.g., n is too large or the range is too small), warn and fall back to random points.
        console.warn(`Could not generate collinear points for n=${n} in range [${minVal}, ${maxVal}]. Falling back to random points.`);
        return this.points(n, minVal, maxVal, { type: 'random' });
    }
    
    // Theoretically unreachable
    return [];
  },

  base: {
    convert(input: string | number | bigint, fromRadix: number, toRadix: number): string {
      // 1. Strictly validate radix range
      if (fromRadix < 2 || fromRadix > 36 || toRadix < 2 || toRadix > 36) {
        throw new Error(`Radix must be an integer between 2 and 36. Received: from=${fromRadix}, to=${toRadix}`);
      }
      
      const inputStr = String(input);
      let valueAsBigInt: bigint;

      // 2. Any radix -> BigInt (as an intermediate state), and validate input legality
      try {
        if (fromRadix === 10) {
          valueAsBigInt = BigInt(inputStr);
        } else {
          valueAsBigInt = BigInt(0);
          const fromBase = BigInt(fromRadix);
          for (const char of inputStr.toUpperCase()) {
            const digit = G.CHARSET.BASE36.indexOf(char);
            // 3. Strictly validate each digit
            if (digit === -1 || digit >= fromRadix) {
              throw new Error(); // Throw error to be handled by the unified catch block
            }
            valueAsBigInt = valueAsBigInt * fromBase + BigInt(digit);
          }
        }
      } catch {
        throw new Error(`Input "${inputStr}" contains invalid characters for base ${fromRadix}.`);
      }

      // 4. BigInt -> Target radix
      if (valueAsBigInt === BigInt(0)) return '0';
      
      let result = '';
      const toBase = BigInt(toRadix);
      let current = valueAsBigInt;
      while (current > 0) {
        const remainder = Number(current % toBase);
        result = G.CHARSET.BASE36[remainder] + result;
        current = current / toBase;
      }
      return result;
    },

    binToHex(binString: string): string {
      return this.convert(binString, 2, 16);
    },

    hexToBin(hexString: string): string {
      return this.convert(hexString, 16, 2);
    },

    digits(length: number, radix: number): string {
      if (length <= 0) return '';
      if (radix < 2 || radix > 36) {
        throw new Error(`Radix must be an integer between 2 and 36. Received: ${radix}`);
      }
      
      const charset = G.CHARSET.BASE36.slice(0, radix);
      // 5. Strictly ensure no leading zeros
      if (length === 1) return G.sample(charset.split(''));

      const firstChar = G.sample(charset.replace('0', '').split(''));
      const restChars = G.string(length - 1, charset);
      return firstChar + restChars;
    },

  },

  debug<T>(labelOrData: string | T, dataOrOptions?: T | DebugOptions, options?: DebugOptions): void {
    // --- 1. Argument parsing and config merging ---
    let label: string | null = null;
    let data: T;
    let config: Required<Omit<DebugOptions, 'colors'>>; // We no longer manage colors manually

    const defaults: Required<Omit<DebugOptions, 'colors'>> = {
      separator: ' ',
      printDims: false,
      printType: true,
      printStats: false,
      truncate: 50,
    };

    if (typeof labelOrData === 'string') {
      label = labelOrData;
      data = dataOrOptions as T;
      config = { ...defaults, ...options };
    } else {
      data = labelOrData as T;
      config = { ...defaults, ...(dataOrOptions as DebugOptions) };
    }
    
    // --- 2. Core printing logic ---
    console.log(pc.bold(pc.cyan(`---[ ${label || 'Genesis Debug'} ]`)) + pc.gray(' ---'));

    // a. Handle Null / Undefined
    if (data === null || data === undefined) {
      console.log(pc.magenta(String(data)));
      console.log(pc.gray('------------------------------------'));
      return;
    }

    // b. Handle non-arrays (primitive types)
    if (!Array.isArray(data)) {
      if (config.printType) {
        console.log(`${pc.yellow('Type:')} ${pc.green(typeof data)}`);
      }
      console.log(data);
      console.log(pc.gray('------------------------------------'));
      return;
    }

    // c. Handle arrays
    if (data.length === 0) {
      console.log(pc.yellow('Type:') + pc.green(' Array (empty)'));
      console.log('[]');
      console.log(pc.gray('------------------------------------'));
      return;
    }
    
    const is2D = Array.isArray(data[0]);
    const isTruncated = data.length > config.truncate;
    const displayData = isTruncated ? data.slice(0, config.truncate) : data;

    // --- Print metadata ---
    if (config.printType) {
        const itemType = is2D ? typeof (data[0] as any[])?.[0] : typeof data[0];
        const typeStr = is2D ? `Matrix<${itemType}>` : `Array<${itemType}>`;
        const dimsStr = is2D ? `(${data.length}x${(data[0] as any[]).length})` : `(len=${data.length})`;
        console.log(`${pc.yellow('Type:')} ${pc.green(typeStr)}  ${pc.yellow('Dims:')} ${pc.green(dimsStr)}`);
    }

    // --- Print statistics (if applicable) ---
    if (config.printStats && typeof data[0] === 'number') {
        const flatNums = (is2D ? (data as number[][]).flat() : data as number[]).filter(n => typeof n === 'number');
        if(flatNums.length > 0) {
            const stats = {
                min: Math.min(...flatNums),
                max: Math.max(...flatNums),
                sum: flatNums.reduce((a, b) => a + b, 0),
            };
            console.log(`${pc.yellow('Stats:')} ${pc.gray(`min=`)}${stats.min} ${pc.gray(`max=`)}${stats.max} ${pc.gray(`sum=`)}${stats.sum}`);
        }
    }

    // --- Print data body ---
    if (config.printDims) {
        const dims = is2D ? `${data.length}${config.separator}${(data[0] as any[]).length}` : `${data.length}`;
        console.log(pc.magenta(dims));
    }

    if (is2D) { // 2D Matrix, with alignment
      const matrix = displayData as any[][];
      const colWidths = Array(matrix[0]?.length || 0).fill(0);
      
      for (const row of matrix) {
        for (let i = 0; i < row.length; i++) {
          const cellStr = String(row[i] ?? ''); // Handle null/undefined cells
          if (cellStr.length > colWidths[i]) {
            colWidths[i] = cellStr.length;
          }
        }
      }
      
      matrix.forEach(row => {
        const rowStr = row
          .map((cell, i) => String(cell ?? '').padEnd(colWidths[i], ' '))
          .join(config.separator);
        console.log(rowStr);
      });
    } else { // 1D Array
      console.log(displayData.join(config.separator));
    }
    
    if (isTruncated) {
        console.log(pc.gray(`... (truncated, ${data.length - config.truncate} more items)`));
    }
    
    console.log(pc.gray('------------------------------------'));
  }
};


