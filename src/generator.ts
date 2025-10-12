// src/generator.ts
import { shuffle as esShuffle, sample as esSample, chunk as esChunk } from 'es-toolkit';

// --- 预定义字符集 ---
const CHARSET = {
  LOWERCASE: 'abcdefghijklmnopqrstuvwxyz',
  UPPERCASE: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  DIGITS: '0123456789',
  get ALPHANUMERIC() { return this.LOWERCASE + this.UPPERCASE + this.DIGITS; },
  get ALPHA() { return this.LOWERCASE + this.UPPERCASE; },
} as const;


export const G = {
  // --- 常量 ---
  /**
   * 常用的预定义字符集，用于字符串生成。
   * G.CHARSET.LOWERCASE, G.CHARSET.UPPERCASE, G.CHARSET.DIGITS,
   * G.CHARSET.ALPHANUMERIC, G.CHARSET.ALPHA
   */
  CHARSET,

  // --- 数字 ---

  /**
   * 生成一个 [min, max] 范围内的随机整数 (inclusive)。
   */
  int(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * 生成一个 [min, max] 范围内的随机 BigInt (inclusive)。
   */
  bigint(min: bigint, max: bigint): bigint {
    if (min > max) [min, max] = [max, min];
    
    const range = max - min + 1n;
    const bits = range.toString(2).length;
    // 计算容纳这么多位所需要的最少字节数
    const bytes = Math.ceil(bits / 8);
    // 掩码，用于从生成的随机数中只取出我们需要的位数
    // 例如，如果需要 10 位，掩码就是 0b1111111111 (即 2^10 - 1)
    const mask = (1n << BigInt(bits)) - 1n;

    let randomBigInt;
    
    // 这个循环在统计上会极快地终止。
    // 每次迭代的成功率都大于 50%。
    do {
      const randomBytes = crypto.getRandomValues(new Uint8Array(bytes));
      // 从随机字节创建 BigInt
      randomBigInt = BigInt('0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
      
      // 应用掩码，确保我们的随机数在 [0, 2^bits - 1] 的范围内
      randomBigInt = randomBigInt & mask;

    } while (randomBigInt >= range);

    return min + randomBigInt;
  },

  /**
   * 生成一个 [min, max] 范围内的随机浮点数，可指定小数位数。
   * @param min 最小值
   * @param max 最大值
   * @param precision 小数位数 (default: 2)
   */
  float(min: number, max: number, precision: number = 2): number {
    const value = Math.random() * (max - min) + min;
    return parseFloat(value.toFixed(precision));
  },

  // --- 字符串 ---

  /**
   * 生成指定长度的随机字符串。
   * @param len 字符串长度
   * @param charset 字符集 (default: G.CHARSET.ALPHANUMERIC)
   */
  string(len: number, charset: string = CHARSET.ALPHANUMERIC): string {
    let result = '';
    const charsetLength = charset.length;
    for (let i = 0; i < len; i++) {
      result += charset.charAt(Math.floor(Math.random() * charsetLength));
    }
    return result;
  },
  
  /**
   * 生成一个随机单词（由小写字母组成）。
   * @param minLen 最小长度
   * @param maxLen 最大长度
   */
  word(minLen: number, maxLen: number): string {
    const len = this.int(minLen, maxLen);
    return this.string(len, CHARSET.LOWERCASE);
  },

  // --- 数组 & 集合 ---

  /**
   * 生成一个数组。
   * @param count 数组元素数量
   * @param itemGenerator 每个元素的生成器，接收索引 `i`
   */
  array<T>(count: number, itemGenerator: (index: number) => T): T[] {
    return Array.from({ length: count }, (_, i) => itemGenerator(i));
  },

  /**
   * 生成一个矩阵（二维数组）。
   * @param rows 行数
   * @param cols 列数
   * @param cellGenerator 每个单元格的生成器，接收 `(rowIndex, colIndex)`
   */
  matrix<T>(rows: number, cols: number, cellGenerator: (rowIndex: number, colIndex: number) => T): T[][] {
    return Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (__, j) => cellGenerator(i, j))
    );
  },
  
  /**
   * 生成一个 1 到 n (或 0 to n-1) 的全排列。
   * @param n 元素数量
   * @param oneBased 是否从 1 开始 (default: true)
   */
  permutation(n: number, oneBased: boolean = true): number[] {
    const arr = Array.from({ length: n }, (_, i) => oneBased ? i + 1 : i);
    return esShuffle(arr);
  },

  /**
   * 从数组中随机抽取 k 个不重复的元素。
   * @param population 源数组
   * @param k 抽取的数量
   */
  sample: esSample,

  /**
   * 随机打乱一个数组的元素顺序（返回新数组，不修改原数组）。
   */
  shuffle: esShuffle,
  
  /**
   * 将一个数组拆分成指定大小的块，常用于按行打印。
   * 例: `G.chunk(G.array(100, G.int), 10)` 会返回一个 10x10 的矩阵。
   */
  chunk: esChunk,

  /**
   * 生成一对数字，可指定是否必须不相等。
   * @param min 最小值
   * @param max 最大值
   * @param options.distinct 是否必须不相等 (default: true)
   */
  pair(min: number, max: number, options: { distinct?: boolean } = {}): [number, number] {
    const { distinct = true } = options;
    const a = this.int(min, max);
    if (!distinct) {
      return [a, this.int(min, max)];
    }
    let b: number;
    do {
      b = this.int(min, max);
    } while (a === b);
    return [a, b];
  },
  
  // --- 结构化 (高级) ---
  // 这些是未来的扩展点，现在先定义 API 签名
  /**
   * (未来) 生成一棵树。
   * @param n 节点数量
   * @param options.type 树的类型: 'random', 'chain', 'star'
   * @param options.weighted 是否带权
   */
  tree(n: number, options: { type?: 'random' | 'chain' | 'star', weighted?: boolean } = {}) {
    // TODO: 实现树生成逻辑
    // 应该返回一个结构化对象，例如边列表：[[u, v, w?], ...]
    console.warn('G.tree() is not implemented yet.');
    return []; 
  },

  /**
   * (未来) 生成一张图。
   * @param n 节点数量
   * @param m 边数量
   * @param options.directed 是否有向
   * @param options.weighted 是否带权
   * @param options.noSelfLoops 是否禁止自环
   * @param options.noDuplicateEdges 是否禁止重边
   */
  graph(n: number, m: number, options: {} = {}) {
    // TODO: 实现图生成逻辑
    // 应该返回一个结构化对象，例如边列表
    console.warn('G.graph() is not implemented yet.');
    return [];
  }
};