// src/generator.ts
import type { DebugOptions, TreeOptions, GraphOptions } from './types'
import pc from 'picocolors';
import { shuffle as esShuffle, sampleSize as esSampleSize, chunk as esChunk } from 'es-toolkit';

/**
 * 定义 Genesis 数据生成器 (G) 的完整接口。
 * 这是对外暴露的 API "蓝图"，包含所有函数的类型签名和详细的中文文档。
 */
interface IGenerator {
  /**
   * 常用的预定义字符集，用于字符串生成。
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
    /** 用于表示最高 36 进制的完整字符集。 */
    readonly BASE36: string;
  };

  /**
   * 生成一个 [min, max] 范围内的随机整数 (包含边界)。
   * @param min 最小值。
   * @param max 最大值。
   * @returns 一个随机整数。
   * @example G.int(1, 10) // => 7
   */
  int(min: number, max: number): number;

  /**
   * 生成包含 n 个随机整数的数组。
   * @param count 数组元素个数。
   * @param min 每个整数的最小值。
   * @param max 每个整数的最大值。
   * @returns 一个随机整数数组。
   * @example G.ints(5, 1, 100) // => [42, 88, 19, 7, 63]
   */
  ints(count: number, min: number, max: number): number[];

  /**
   * 生成包含 n 个互不相同的随机整数的数组 (在 [min, max] 范围内)。
   * @param count 要生成的不同整数的个数。
   * @param min 整数的最小值。
   * @param max 整数的最大值。
   * @returns 一个包含不重复随机整数的数组。
   * @example G.distinctInts(5, 1, 10) // => [8, 2, 10, 5, 1]
   */
  distinctInts(count: number, min: number, max: number): number[];

  /**
   * 生成一个 [min, max] 范围内的随机浮点数。
   * @param min 最小值。
   * @param max 最大值。
   * @param precision 小数位精度 (默认: 2)。
   * @returns 一个随机浮点数。
   * @example G.float(1, 2, 4) // => 1.5821
   */
  float(min: number, max: number, precision?: number): number;

  /**
   * 生成一个 [min, max] 范围内的随机偶数。
   * @param min 最小值。
   * @param max 最大值。
   * @returns 一个随机偶数。
   * @example G.even(1, 100) // => 52
   */
  even(min: number, max: number): number;

  /**
   * 生成一个 [min, max] 范围内的随机奇数。
   * @param min 最小值。
   * @param max 最大值。
   * @returns 一个随机奇数。
   * @example G.odd(1, 100) // => 87
   */
  odd(min: number, max: number): number;

  /**
   * 生成指定长度的随机字符串。
   * @param len 字符串长度。
   * @param charset 使用的字符集 (默认: G.CHARSET.ALPHANUMERIC)。
   * @returns 一个随机字符串。
   * @example G.string(10, G.CHARSET.DIGITS) // => "4815162342"
   */
  string(len: number, charset?: string): string;

  /**
   * [新增] 生成指定长度的随机回文字符串。
   * @param len 回文串长度。
   * @param charset 使用的字符集 (默认: 小写字母)。
   * @returns 一个回文字符串。
   * @example
   * G.palindrome(5) // => "level"
   * G.palindrome(6, '01') // => "100001"
   */
  palindrome(len: number, charset?: string): string;

  /**
   * 生成一个随机单词 (由小写字母组成)。
   * @param minLen 最小长度。
   * @param maxLen 最大长度。
   * @returns 一个随机单词。
   * @example G.word(5, 8) // => "wxyzk"
   */
  word(minLen: number, maxLen: number): string;

  /**
   * 生成包含 n 个随机单词的数组。
   * @param count 单词个数。
   * @param minLen 每个单词的最小长度。
   * @param maxLen 每个单词的最大长度。
   * @returns 一个随机单词数组。
   * @example G.words(3, 4, 6) // => ["pfvj", "sxwoa", "bhuql"]
   */
  words(count: number, minLen: number, maxLen: number): string[];

  /**
   * 最强大的基础生成函数，用于根据规则构建数组。
   * @param count 数组元素个数。
   * @param itemGenerator 每个元素的生成器函数，接收当前索引 `i` 作为参数。
   * @returns 根据规则生成的数组。
   * @example G.array(5, (i) => `${i}!`) // => ["0!", "1!", "2!", "3!", "4!"]
   */
  array<T>(count: number, itemGenerator: (index: number) => T): T[];

  /**
   * [新增] 生成有序序列，专为二分查找、双指针等题目设计。
   * @param count 元素个数。
   * @param min 最小值。
   * @param max 最大值。
   * @param options 配置选项。
   * @returns 一个有序数字数组。
   * @example
   * G.sorted(5, 1, 100) // 默认非降序
   * G.sorted(5, 1, 20, { order: 'strictlyAsc' }) // 严格递增
   */
  sorted(count: number, min: number, max: number, options?: { order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc' }): number[];

  /**
   * [新增] 生成稀疏序列，保证相邻元素绝对差值至少为 `gap`。
   * @param count 元素个数。
   * @param min 最小值。
   * @param max 最大值。
   * @param gap 最小间隔。
   * @returns 一个稀疏数字数组 (顺序随机)。
   * @example G.sparse(10, 1, 100, 5) // e.g. [5, 20, 11, ...]
   */
  sparse(count: number, min: number, max: number, gap: number): number[];

  /**
   * [新增] 生成和为 S 的正整数序列，专为背包或划分问题设计。
   * @param count 序列中正整数的个数。
   * @param sum 目标和。
   * @param options 配置选项。
   * @returns 一个和为 `sum` 的数组 (顺序随机)。
   * @example G.partition(5, 100, { minVal: 10 }) // 5 个数和为 100，且每个数 >= 10
   */
  partition(count: number, sum: number, options?: { minVal?: number }): number[];

  /**
   * 生成数字矩阵 (二维数组)。
   * @param rows 行数。
   * @param cols 列数。
   * @param cellGenerator 每个单元格的生成器函数。
   * @returns 根据规则生成的矩阵。
   * @example G.matrix(2, 3, () => G.int(0, 9))
   */
  matrix<T>(rows: number, cols: number, cellGenerator: (rowIndex: number, colIndex: number) => T): T[][];

  /**
   * [新增] 生成 0-1 矩阵。
   * @param rows 行数。
   * @param cols 列数。
   * @param density 1 的密度 (0 到 1 之间，默认为 0.5)。
   * @returns 一个只包含 0 和 1 的矩阵。
   * @example G.grid01(10, 10, 0.3) // 10x10, 约 30% 是 1
   */
  grid01(rows: number, cols: number, density?: number): number[][];

  /**
   * [新增] 生成保证完全连通的随机迷宫。
   * @param rows 行数。
   * @param cols 列数。
   * @param options 配置选项。
   * @returns 由墙壁和道路字符组成的迷宫矩阵。
   * @example G.maze(11, 11, { wall: '#', road: '.' })
   */
  maze(rows: number, cols: number, options?: { wall?: string, road?: string }): string[][];

  /**
   * 🌳 生成包含 n 个顶点的树。
   * 这是一个便捷包装器，等价于 `G.graph(n, n - 1, { connected: true, ... })`。
   * @param n 顶点数。
   * @param options 树的配置选项。
   * @returns 表示树的边列表。
   * @example
   * G.tree(10) // 一个 10 个顶点的随机树
   * G.tree(5, { type: 'path' }) // 一条链: 1-2-3-4-5
   */
  tree(n: number, options?: TreeOptions): number[][];

  /**
   * 🕸️ 生成包含 n 个顶点 m 条边的图。
   * 最强大的图生成工具。
   * @param n 顶点数。
   * @param m 边数。
   * @param options 图的配置选项。
   * @returns 表示图的边列表，例如 `[[u, v, w], ...]`。
   * @example
   * // 一个包含 10 个顶点 12 条边的简单无向连通图
   * G.graph(10, 12, { connected: true })
   * // 一个带权的有向无环图 (DAG)
   * G.graph(10, 15, { type: 'dag', directed: true, weighted: [1, 100] })
   */
  graph(n: number, m: number, options?: GraphOptions): number[][];

  /**
   * 生成 1 到 n (或 0 到 n-1) 的全排列。
   * @param n 元素个数。
   * @param oneBased 是否从 1 开始 (默认: true)。
   * @returns 一个随机排列。
   * @example G.permutation(5) // => [3, 1, 5, 2, 4]
   */
  permutation(n: number, oneBased?: boolean): number[];

  /**
   * 随机打乱数组元素 (返回新数组，不修改原数组)。
   * @param array 待打乱的数组。
   * @returns 元素顺序被打乱的新数组。
   * @example G.shuffle([1, 2, 3]) // => [2, 3, 1]
   */
  shuffle<T>(array: readonly T[]): T[];

  /**
   * 将数组按指定大小分块。
   * @param array 源数组。
   * @param size 每个块的大小。
   * @returns 一个二维数组。
   * @example G.chunk([1, 2, 3, 4, 5], 2) // => [[1, 2], [3, 4], [5]]
   */
  chunk<T>(array: readonly T[], size: number): T[][];

  /**
   * 判断是否为闰年。
   * @param year 年份。
   * @returns 如果是闰年则返回 true。
   * @example G.isLeap(2000) // => true
   */
  isLeap(year: number): boolean;

  /**
   * 生成指定范围内的随机年份。
   * @param minYear 最小年份 (默认: 1970)。
   * @param maxYear 最大年份 (默认: 当前年份)。
   * @returns 一个随机年份。
   * @example G.year(2000, 2010) // => 2005
   */
  year(minYear?: number, maxYear?: number): number;

  /**
   * 生成指定范围内的随机日期字符串。
   * @param options 配置选项。
   * @returns 格式化后的随机日期字符串。
   * @example G.date({ format: 'YYYY/MM/DD' }) // => "2023/07/15"
   */
  date(options?: { minYear?: number; maxYear?: number; format?: string }): string;

  /**
   * (用法 1) 从数组中随机抽取一个元素。
   * @param population 源数组。
   * @returns 一个随机元素。
   * @example G.sample(['a', 'b', 'c']) // => 'b'
   */
  sample<T>(population: readonly T[]): T;
  /**
   * (用法 2) 从数组中随机抽取 k 个不重复元素。
   * @param population 源数组。
   * @param k 抽取的元素个数。
   * @returns 包含 k 个不重复元素的数组。
   * @example G.sample(['a', 'b', 'c'], 2) // => ['c', 'a']
   */
  sample<T>(population: readonly T[], k: number): T[];

  /**
   * 🗺️ 在平面上生成 n 个二维点坐标。
   * @param n 点的个数。
   * @param minVal 坐标最小值。
   * @param maxVal 坐标最大值。
   * @param options 用于生成特殊分布点的配置选项。
   * @returns 点坐标列表, 例如 [[x1, y1], [x2, y2], ...]。
   * @example
   * G.points(10, -100, 100) // 10 个随机点
   * G.points(10, -100, 100, { type: 'collinear' }) // 10 个共线点
   */
  points(n: number, minVal: number, maxVal: number, options?: {
    type?: 'random' | 'collinear'
  }): number[][];

  /**
   * 🌀 [内部] 进制转换与编码工具集。
   * 提供通用、原子的进制转换能力。
   */
  readonly base: {
    /**
     * [核心] 通用进制转换函数，支持大数并包含严格验证。
     * @param input 待转换的数字 (自动处理 number, bigint, string)。
     * @param fromRadix 原进制 (2-36)。
     * @param toRadix 目标进制 (2-36)。
     * @returns 转换后的大写字符串。
     * @example G.base.convert('1010', 2, 10) // => '10'
     */
    convert(input: string | number | bigint, fromRadix: number, toRadix: number): string;

    /**
     * [别名] 将二进制字符串转换为十六进制。在算法竞赛中很常见。
     * @param binString 有效的二进制字符串。
     * @returns 转换后的大写十六进制字符串。
     * @example G.base.binToHex('111100001010') // => 'F0A'
     */
    binToHex(binString: string): string;

    /**
     * [别名] 将十六进制字符串转换为二进制。在算法竞赛中很常见。
     * @param hexString 有效的十六进制字符串。
     * @returns 转换后的二进制字符串。
     * @example G.base.hexToBin('F0A') // => '111100001010'
     */
    hexToBin(hexString: string): string;
    
    /**
     * 生成指定长度和进制的随机数字符串。
     * 严格遵守 "无多余前导零" 的约定。
     * @param length 数字的位数/长度。
     * @param radix 进制 (2-36)。
     * @returns 指定进制的大写随机数字符串。
     * @example
     * G.base.digits(100, 2)  // 生成一个 100 位的二进制数
     * G.base.digits(30, 16)  // 生成一个 30 位的十六进制数
     */
    digits(length: number, radix: number): string;

  };

  /**
   * [终极] 深度调试打印工具，能够分析并优雅地展示任何生成的数据。
   * 支持函数重载，可以直接传数据，也可以传 "标签 + 数据"。
   * @param data 要检查的数据。
   * @param options 格式化选项。
   */
  debug<T>(data: T, options?: DebugOptions): void;
  /**
   * [终极] 深度调试打印工具，能够分析并优雅地展示任何生成的数据。
   * 支持函数重载，可以直接传数据，也可以传 "标签 + 数据"。
   * @param label 数据的描述性标签。
   * @param data 要检查的数据。
   * @param options 格式化选项。
   */
  debug<T>(label: string, data: T, options?: DebugOptions): void;

}

/**
 * G 对象的具体实现。
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
        const start = points[i]!;
        const end = points[i + 1]!;
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

    // 从一个合法的道路位置开始
    const startR = 1;
    const startC = 1;
    if (startR >= rows || startC >= cols) return grid; // 迷宫太小

    grid[startR][startC] = road;
    visited[startR][startC] = true;
    stack.push([startR, startC]);

    while (stack.length > 0) {
        const [r, c] = stack.pop()!;
        const neighbors: [number, number, number, number][] = []; // [nextR, nextC, wallR, wallC]
        
        // 检查距离为 2 的邻居
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
      result = result.map(edge => {
        const newEdge = [edge[0] + 1, edge[1] + 1];
        if (edge.length > 2) {
          newEdge.push(edge[2]);
        }
        return newEdge;
      });
    }

    return result;
  },

  graph(n: number, m: number, options: GraphOptions = {}): number[][] {
    const {
      type = 'simple',
      weighted = false,
      connected = false,
      noSelfLoops = true,
      oneBased = true,
    } = options;

    // type='dag' 隐含 directed=true，除非用户强制设为 false (通常是错误用法，但我们做检查)
    // 通常默认 'directed' 为 false，但 DAG 默认为 true。
    let { directed = false } = options;
    if (type === 'dag' && options.directed === undefined) {
        directed = true;
    }

    // --- 1. 输入验证 ---
    if (n <= 0) return [];
    if (type === 'tree') {
      if (m !== n - 1) throw new Error(`A tree with ${n} vertices must have ${n - 1} edges, but ${m} were requested.`);
      return this.tree(n, { oneBased, weighted });
    }

    // 检查连通图的最小边数
    if (connected && m < n - 1) {
      throw new Error(`A connected graph with ${n} vertices must have at least ${n - 1} edges.`);
    }

    // 检查最大边数
    let maxEdges: number;
    if (type === 'dag') {
        // DAG 最大边数是 n*(n-1)/2 (有向，无环 -> 无自环，最大就像无向完全图)
        maxEdges = n * (n - 1) / 2;
    } else if (type === 'bipartite') {
        // 当两部分划分尽可能相等时边数最大: floor(n/2) * ceil(n/2)
        // 如果是有向图，边可以双向，所以 * 2。
        const half = Math.floor(n / 2);
        const other = n - half;
        maxEdges = half * other * (directed ? 2 : 1);
    } else { // simple
        if (directed) {
            maxEdges = noSelfLoops ? n * (n - 1) : n * n;
        } else {
            maxEdges = noSelfLoops ? n * (n - 1) / 2 : n * (n + 1) / 2;
        }
    }

    if (m > maxEdges) {
        throw new Error(`Graph with ${n} vertices of type '${type}' (directed: ${directed}) can have at most ${maxEdges} edges. Requested: ${m}.`);
    }

    // --- 2. 边生成 ---
    const edgeSet = new Set<string>();
    const addEdge = (u: number, v: number) => {
      if (noSelfLoops && u === v) return false;
      const key = directed ? `${u},${v}` : `${Math.min(u, v)},${Math.max(u, v)}`;
      if (edgeSet.has(key)) return false;
      edgeSet.add(key);
      return true;
    };

    if (type === 'dag') {
        const nodes = this.permutation(n, false); // 拓扑排序

        if (connected) {
             // 保证连通性，且符合 DAG 性质 (只连向后的边)
             for (let i = 1; i < n; i++) {
                 const j = this.int(0, i - 1);
                 const u = nodes[j];
                 const v = nodes[i];
                 addEdge(u, v);
             }
        }

        while (edgeSet.size < m) {
            const idx1 = this.int(0, n - 1);
            const idx2 = this.int(0, n - 1);
            if (idx1 === idx2) continue;
            const u = nodes[Math.min(idx1, idx2)];
            const v = nodes[Math.max(idx1, idx2)];
            addEdge(u, v);
        }

    } else if (type === 'bipartite') {
        const nodes = this.permutation(n, false);

        // 计算合法的划分范围 k (setA 的大小)
        // 容量 = k * (n-k) * C >= m
        const C = directed ? 2 : 1;
        const disc = n * n - 4 * m / C;
        // maxEdges 检查保证了 disc >= 0
        const sqrtD = Math.sqrt(disc);
        const minK = Math.ceil((n - sqrtD) / 2);
        const maxK = Math.floor((n + sqrtD) / 2);

        const validMin = Math.max(1, minK);
        const validMax = Math.min(n - 1, maxK);

        // 如果通过了 maxEdges 检查，这种情况不应发生，但为了安全起见：
        if (validMin > validMax) {
             throw new Error(`Cannot find a bipartite partition for ${n} vertices and ${m} edges.`);
        }

        const partition_size = this.int(validMin, validMax);
        const setA = nodes.slice(0, partition_size);
        const setB = nodes.slice(partition_size);

        if (connected) {
             // 保证跨划分的连通性
             const connectedA = [setA[0]];
             const connectedB = [setB[0]];
             addEdge(setA[0], setB[0]);

             const remaining = [];
             for(let i=1; i<setA.length; i++) remaining.push(setA[i]);
             for(let i=1; i<setB.length; i++) remaining.push(setB[i]);
             this.shuffle(remaining);

             for(const u of remaining) {
                 if (setA.includes(u)) {
                     const v = this.sample(connectedB);
                     addEdge(u, v);
                     connectedA.push(u);
                 } else {
                     const v = this.sample(connectedA);
                     addEdge(u, v);
                     connectedB.push(u);
                 }
             }
        }

        while (edgeSet.size < m) {
            const u = this.sample(setA);
            const v = this.sample(setB);
            addEdge(u, v);
        }

    } else { // Simple (普通图)
        if (connected) {
             const treeEdges = this.tree(n, { type: 'random', oneBased: false });
             treeEdges.forEach(([u, v]) => addEdge(u, v));
        }

        while (edgeSet.size < m) {
            const u = this.int(0, n - 1);
            const v = this.int(0, n - 1);
            addEdge(u, v);
        }
    }

    // --- 3. 后处理 ---
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

        for (let attempt = 0; attempt < 50; attempt++) {
            do {
                dx = this.int(-10, 10);
                dy = this.int(-10, 10);
            } while (dx === 0 && dy === 0);

            const x0_min = dx >= 0 ? minVal : minVal - (n - 1) * dx;
            const x0_max = dx >= 0 ? maxVal - (n - 1) * dx : maxVal;

            const y0_min = dy >= 0 ? minVal : minVal - (n - 1) * dy;
            const y0_max = dy >= 0 ? maxVal - (n - 1) * dy : maxVal;

            if (x0_min <= x0_max && y0_min <= y0_max) {
                x0 = this.int(x0_min, x0_max);
                y0 = this.int(y0_min, y0_max);
                
                const points = Array.from({ length: n }, (_, i) => [x0 + i * dx, y0 + i * dy]);
                return this.shuffle(points);
            }
        }

        console.warn(`Could not generate collinear points for n=${n} in range [${minVal}, ${maxVal}]. Falling back to random points.`);
        return this.points(n, minVal, maxVal, { type: 'random' });
    }
    
    return [];
  },

  base: {
    convert(input: string | number | bigint, fromRadix: number, toRadix: number): string {
      if (fromRadix < 2 || fromRadix > 36 || toRadix < 2 || toRadix > 36) {
        throw new Error(`Radix must be an integer between 2 and 36. Received: from=${fromRadix}, to=${toRadix}`);
      }
      
      const inputStr = String(input);
      let valueAsBigInt: bigint;

      try {
        if (fromRadix === 10) {
          valueAsBigInt = BigInt(inputStr);
        } else {
          valueAsBigInt = BigInt(0);
          const fromBase = BigInt(fromRadix);
          for (const char of inputStr.toUpperCase()) {
            const digit = G.CHARSET.BASE36.indexOf(char);
            if (digit === -1 || digit >= fromRadix) {
              throw new Error();
            }
            valueAsBigInt = valueAsBigInt * fromBase + BigInt(digit);
          }
        }
      } catch {
        throw new Error(`Input "${inputStr}" contains invalid characters for base ${fromRadix}.`);
      }

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
      if (length === 1) return G.sample(charset.split(''));

      const firstChar = G.sample(charset.replace('0', '').split(''));
      const restChars = G.string(length - 1, charset);
      return firstChar + restChars;
    },

  },

  debug<T>(labelOrData: string | T, dataOrOptions?: T | DebugOptions, options?: DebugOptions): void {
    let label: string | null = null;
    let data: T;
    let config: Required<Omit<DebugOptions, 'colors'>>;

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
    
    console.log(pc.bold(pc.cyan(`---[ ${label || 'Genesis Debug'} ]`)) + pc.gray(' ---'));

    if (data === null || data === undefined) {
      console.log(pc.magenta(String(data)));
      console.log(pc.gray('------------------------------------'));
      return;
    }

    if (!Array.isArray(data)) {
      if (config.printType) {
        console.log(`${pc.yellow('Type:')} ${pc.green(typeof data)}`);
      }
      console.log(data);
      console.log(pc.gray('------------------------------------'));
      return;
    }

    if (data.length === 0) {
      console.log(pc.yellow('Type:') + pc.green(' Array (empty)'));
      console.log('[]');
      console.log(pc.gray('------------------------------------'));
      return;
    }
    
    const is2D = Array.isArray(data[0]);
    const isTruncated = data.length > config.truncate;
    const displayData = isTruncated ? data.slice(0, config.truncate) : data;

    if (config.printType) {
        const itemType = is2D ? typeof (data[0] as any[])?.[0] : typeof data[0];
        const typeStr = is2D ? `Matrix<${itemType}>` : `Array<${itemType}>`;
        const dimsStr = is2D ? `(${data.length}x${(data[0] as any[]).length})` : `(len=${data.length})`;
        console.log(`${pc.yellow('Type:')} ${pc.green(typeStr)}  ${pc.yellow('Dims:')} ${pc.green(dimsStr)}`);
    }

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

    if (config.printDims) {
        const dims = is2D ? `${data.length}${config.separator}${(data[0] as any[]).length}` : `${data.length}`;
        console.log(pc.magenta(dims));
    }

    if (is2D) {
      const matrix = displayData as any[][];
      const colWidths = Array(matrix[0]?.length || 0).fill(0);
      
      for (const row of matrix) {
        for (let i = 0; i < row.length; i++) {
          const cellStr = String(row[i] ?? '');
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
    } else {
      console.log(displayData.join(config.separator));
    }
    
    if (isTruncated) {
        console.log(pc.gray(`... (truncated, ${data.length - config.truncate} more items)`));
    }
    
    console.log(pc.gray('------------------------------------'));
  }
};
