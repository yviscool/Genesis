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
   * 生成一个 [min, max] 范围内的随机整数 (包含两端)。
   * @param min 最小值
   * @param max 最大值
   * @returns {number} 一个随机整数
   * @example
   * G.int(1, 10)
   * // => 7
   */
  int(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * (新增) 生成一个包含 n 个随机整数的数组。
   * 这是 G.array(n, () => G.int(min, max)) 的便捷写法，非常常用。
   * @param count 数组元素的数量
   * @param min 每个整数的最小值
   * @param max 每个整数的最大值
   * @returns {number[]} 一个随机整数数组
   * @example
   * G.ints(5, 1, 100)
   * // => [42, 88, 19, 7, 63]
   */
  ints(count: number, min: number, max: number): number[] {
    return Array.from({ length: count }, () => this.int(min, max));
  },

  /**
   * (新增) 生成一个包含 n 个在 [min, max] 范围内的、不重复的随机整数数组。
   * 在需要生成唯一 ID、唯一的坐标或排列问题中极为有用。
   * @param count 需要生成的不重复整数的数量
   * @param min 整数的最小值
   * @param max 整数的最大值
   * @returns {number[]} 一个不重复的随机整数数组
   * @example
   * G.distinctInts(5, 1, 10)
   * // => [8, 2, 10, 5, 1]
   */
  distinctInts(count: number, min: number, max: number): number[] {
    const range = max - min + 1;
    if (count > range) {
      throw new Error(`Cannot generate ${count} distinct integers from a range of size ${range}.`);
    }
    const s = new Set<number>();
    while (s.size < count) {
      s.add(this.int(min, max));
    }
    return Array.from(s);
  },

  /**
   * 生成一个 [min, max] 范围内的随机浮点数，可指定小数位数。
   * @param min 最小值
   * @param max 最大值
   * @param precision 小数位数 (default: 2)
   * @returns {number} 一个随机浮点数
   * @example
   * G.float(1, 2, 4)
   * // => 1.5821
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
   * @returns {string} 一个随机字符串
   * @example
   * G.string(10, G.CHARSET.LOWERCASE + G.CHARSET.DIGITS)
   * // => "a4t2k7p9z1"
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
   * @returns {string} 一个随机单词
   * @example
   * G.word(5, 8)
   * // => "wxyzk"
   */
  word(minLen: number, maxLen: number): string {
    const len = this.int(minLen, maxLen);
    return this.string(len, CHARSET.LOWERCASE);
  },

  /**
   * (新增) 生成一个包含 n 个随机单词的数组。
   * @param count 单词数量
   * @param minLen 每个单词的最小长度
   * @param maxLen 每个单词的最大长度
   * @returns {string[]} 一个随机单词数组
   * @example
   * G.words(3, 4, 6)
   * // => ["pfvj", "sxwoa", "bhuql"]
   */
  words(count: number, minLen: number, maxLen: number): string[] {
    return Array.from({ length: count }, () => this.word(minLen, maxLen));
  },

  // --- 数组 & 集合 ---

  /**
   * 生成一个数组，功能最强大的基础生成器。
   * @param count 数组元素数量
   * @param itemGenerator 每个元素的生成器，接收索引 `i` 作为参数
   * @returns {T[]} 一个根据规则生成的数组
   * @example
   * // 生成 ['0!', '1!', '2!', '3!', '4!']
   * G.array(5, (i) => `${i}!`)
   * // => ["0!", "1!", "2!", "3!", "4!"]
   */
  array<T>(count: number, itemGenerator: (index: number) => T): T[] {
    return Array.from({ length: count }, (_, i) => itemGenerator(i));
  },

  /**
   * 生成一个矩阵（二维数组）。
   * @param rows 行数
   * @param cols 列数
   * @param cellGenerator 每个单元格的生成器，接收 `(rowIndex, colIndex)`
   * @returns {T[][]} 一个根据规则生成的矩阵
   * @example
   * // 生成一个 3x4 的矩阵，每个元素是其坐标之和
   * G.matrix(3, 4, (r, c) => r + c)
   * // => [[0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5]]
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
   * @returns {number[]} 一个随机排列
   * @example
   * G.permutation(5)
   * // => [3, 1, 5, 2, 4]
   */
  permutation(n: number, oneBased: boolean = true): number[] {
    const arr = Array.from({ length: n }, (_, i) => oneBased ? i + 1 : i);
    return esShuffle(arr);
  },

  /**
   * 从数组中随机抽取 k 个不重复的元素。
   * @param population 源数组
   * @param k 抽取的数量
   * @returns {T[]} 一个包含 k 个不重复元素的数组
   * @example
   * G.sample(['a', 'b', 'c', 'd', 'e'], 3)
   * // => ['d', 'a', 'e']
   */
  sample: esSample,

  /**
   * 随机打乱一个数组的元素顺序（返回新数组，不修改原数组）。
   * @param array 需要打乱的数组
   * @returns {T[]} 一个被打乱顺序的新数组
   * @example
   * G.shuffle([1, 2, 3, 4, 5])
   * // => [4, 1, 5, 3, 2]
   */
  shuffle: esShuffle,
  
  /**
   * 将一个数组拆分成指定大小的块。
   * @param array 源数组
   * @param size 每个块的大小
   * @returns {T[][]} 一个二维数组
   * @example
   * G.chunk([1, 2, 3, 4, 5, 6], 2)
   * // => [[1, 2], [3, 4], [5, 6]]
   */
  chunk: esChunk,

  // --- 日期与时间 (新增) ---

  /**
   * (新增) 判断一个年份是否是闰年。
   * 这是很多日期相关问题的基础。
   * @param year 年份
   * @returns {boolean} 是否为闰年
   * @example
   * G.isLeap(2000) // => true
   * G.isLeap(1900) // => false
   * G.isLeap(2024) // => true
   */
  isLeap(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  },

  /**
   * (新增) 生成一个指定范围内的随机年份。
   * @param minYear 最小年份 (default: 1970)
   * @param maxYear 最大年份 (default: 当前年份)
   * @returns {number} 一个随机年份
   * @example
   * G.year(2000, 2010)
   * // => 2005
   */
  year(minYear: number = 1970, maxYear: number = new Date().getFullYear()): number {
    return this.int(minYear, maxYear);
  },

  /**
   * (新增) 生成一个随机日期，并按指定格式输出字符串。
   * 对于需要解析日期或计算日期间隔的题目非常有用。
   * @param options 配置项
   * @param options.minYear 最小年份 (default: 1970)
   * @param options.maxYear 最大年份 (default: 当前年份)
   * @param options.format 日期格式 (default: 'YYYY-MM-DD')
   * @returns {string} 格式化后的随机日期字符串
   * @example
   * G.date({ minYear: 2022, maxYear: 2023, format: 'YYYY/MM/DD' })
   * // => "2023/07/15"
   */
  date(options: { minYear?: number, maxYear?: number, format?: string } = {}): string {
    const { 
      minYear = 1970, 
      maxYear = new Date().getFullYear(), 
      format = 'YYYY-MM-DD' 
    } = options;
    
    const year = this.year(minYear, maxYear);
    const month = this.int(1, 12);
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (this.isLeap(year)) {
      daysInMonth[1] = 29;
    }
    const day = this.int(1, daysInMonth[month - 1]);

    const yyyy = String(year);
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');

    return format
      .replace('YYYY', yyyy)
      .replace('MM', mm)
      .replace('DD', dd);
  }
};