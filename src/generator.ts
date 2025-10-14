// src/generator.ts
import { shuffle as esShuffle, sampleSize as esSampleSize, chunk as esChunk } from 'es-toolkit';

/**
 * 定义了 Genesis 数据生成器 (G) 的完整接口。
 * 这是对外暴露的 API “蓝图”，包含了所有函数的类型签名和详细的中文文档。
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
  };

  /**
   * 生成一个 [min, max] 范围内的随机整数 (包含两端)。
   * @param min 最小值
   * @param max 最大值
   * @returns 一个随机整数
   * @example G.int(1, 10) // => 7
   */
  int(min: number, max: number): number;

  /**
   * 生成一个包含 n 个随机整数的数组。
   * @param count 数组元素的数量
   * @param min 每个整数的最小值
   * @param max 每个整数的最大值
   * @returns 一个随机整数数组
   * @example G.ints(5, 1, 100) // => [42, 88, 19, 7, 63]
   */
  ints(count: number, min: number, max: number): number[];

  /**
   * 生成一个包含 n 个在 [min, max] 范围内的、不重复的随机整数数组。
   * @param count 需要生成的不重复整数的数量
   * @param min 整数的最小值
   * @param max 整数的最大值
   * @returns 一个不重复的随机整数数组
   * @example G.distinctInts(5, 1, 10) // => [8, 2, 10, 5, 1]
   */
  distinctInts(count: number, min: number, max: number): number[];

  /**
   * 生成一个 [min, max] 范围内的随机浮点数。
   * @param min 最小值
   * @param max 最大值
   * @param precision 小数位数 (默认: 2)
   * @returns 一个随机浮点数
   * @example G.float(1, 2, 4) // => 1.5821
   */
  float(min: number, max: number, precision?: number): number;

  /**
   * 生成一个 [min, max] 范围内的随机偶数。
   * @param min 最小值
   * @param max 最大值
   * @returns 一个随机偶数
   * @example G.even(1, 100) // => 52
   */
  even(min: number, max: number): number;

  /**
   * 生成一个 [min, max] 范围内的随机奇数。
   * @param min 最小值
   * @param max 最大值
   * @returns 一个随机奇数
   * @example G.odd(1, 100) // => 87
   */
  odd(min: number, max: number): number;

  /**
   * 生成指定长度的随机字符串。
   * @param len 字符串长度
   * @param charset 字符集 (默认: G.CHARSET.ALPHANUMERIC)
   * @returns 一个随机字符串
   * @example G.string(10, G.CHARSET.DIGITS) // => "4815162342"
   */
  string(len: number, charset?: string): string;

  /**
   * 生成一个随机单词（由小写字母组成）。
   * @param minLen 最小长度
   * @param maxLen 最大长度
   * @returns 一个随机单词
   * @example G.word(5, 8) // => "wxyzk"
   */
  word(minLen: number, maxLen: number): string;

  /**
   * 生成一个包含 n 个随机单词的数组。
   * @param count 单词数量
   * @param minLen 每个单词的最小长度
   * @param maxLen 每个单词的最大长度
   * @returns 一个随机单词数组
   * @example G.words(3, 4, 6) // => ["pfvj", "sxwoa", "bhuql"]
   */
  words(count: number, minLen: number, maxLen: number): string[];

  /**
   * 生成一个数组，功能最强大的基础生成器。
   * @param count 数组元素数量
   * @param itemGenerator 每个元素的生成器，接收索引 `i` 作为参数
   * @returns 一个根据规则生成的数组
   * @example G.array(5, (i) => `${i}!`) // => ["0!", "1!", "2!", "3!", "4!"]
   */
  array<T>(count: number, itemGenerator: (index: number) => T): T[];

  /**
   * 生成一个矩阵（二维数组）。
   * @param rows 行数
   * @param cols 列数
   * @param cellGenerator 每个单元格的生成器，接收 `(rowIndex, colIndex)`
   * @returns 一个根据规则生成的矩阵
   * @example G.matrix(2, 3, () => 0) // => [[0, 0, 0], [0, 0, 0]]
   */
  matrix<T>(rows: number, cols: number, cellGenerator: (rowIndex: number, colIndex: number) => T): T[][];

  /**
   * 生成一个 1 到 n (或 0 to n-1) 的全排列。
   * @param n 元素数量
   * @param oneBased 是否从 1 开始 (默认: true)
   * @returns 一个随机排列
   * @example G.permutation(5) // => [3, 1, 5, 2, 4]
   */
  permutation(n: number, oneBased?: boolean): number[];

  /**
   * 随机打乱一个数组的元素顺序（返回新数组，不修改原数组）。
   * @param array 需要打乱的数组
   * @returns 一个被打乱顺序的新数组
   * @example G.shuffle([1, 2, 3]) // => [2, 3, 1]
   */
  shuffle<T>(array: readonly T[]): T[];

  /**
   * 将一个数组拆分成指定大小的块。
   * @param array 源数组
   * @param size 每个块的大小
   * @returns 一个二维数组
   * @example G.chunk([1, 2, 3, 4, 5], 2) // => [[1, 2], [3, 4], [5]]
   */
  chunk<T>(array: readonly T[], size: number): T[][];

  /**
   * 判断一个年份是否是闰年。
   * @param year 年份
   * @returns 是否为闰年
   * @example G.isLeap(2000) // => true
   */
  isLeap(year: number): boolean;

  /**
   * 生成一个指定范围内的随机年份。
   * @param minYear 最小年份 (默认: 1970)
   * @param maxYear 最大年份 (默认: 当前年份)
   * @returns 一个随机年份
   * @example G.year(2000, 2010) // => 2005
   */
  year(minYear?: number, maxYear?: number): number;

  /**
   * 生成一个指定范围内的随机日期字符串。
   * @param options 配置项
   * @returns 格式化后的随机日期字符串
   * @example G.date({ format: 'YYYY/MM/DD' }) // => "2023/07/15"
   */
  date(options?: { minYear?: number; maxYear?: number; format?: string }): string;

  /**
   * (用法1) 从数组中随机抽取一个元素。
   * @param population 源数组
   * @returns 一个随机元素
   * @example G.sample(['a', 'b', 'c']) // => 'b'
   */
  sample<T>(population: readonly T[]): T;
  /**
   * (用法2) 从数组中随机抽取 k 个不重复的元素。
   * @param population 源数组
   * @param k 抽取的数量
   * @returns 一个包含 k 个不重复元素的数组
   * @example G.sample(['a', 'b', 'c'], 2) // => ['c', 'a']
   */
  sample<T>(population: readonly T[], k: number): T[];
}

/**
 * G 对象的具体实现。
 * 它实现了 IGenerator 接口，但内部不再包含任何 JSDoc 注释，只保留核心逻辑。
 */
export const G: IGenerator = {
  CHARSET: {
    LOWERCASE: 'abcdefghijklmnopqrstuvwxyz',
    UPPERCASE: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    DIGITS: '0123456789',
    get ALPHANUMERIC() { return this.LOWERCASE + this.UPPERCASE + this.DIGITS; },
    get ALPHA() { return this.LOWERCASE + this.UPPERCASE; },
  },

  int(min, max) {
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

  word(minLen, maxLen) {
    return this.string(this.int(minLen, maxLen), G.CHARSET.LOWERCASE);
  },

  words(count, minLen, maxLen) {
    return Array.from({ length: count }, () => this.word(minLen, maxLen));
  },

  array(count, itemGenerator) {
    return Array.from({ length: count }, (_, i) => itemGenerator(i));
  },

  matrix(rows, cols, cellGenerator) {
    return Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (__, j) => cellGenerator(i, j))
    );
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
  }
};
