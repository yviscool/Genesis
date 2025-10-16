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
    /** 用于表示高达36进制的完整字符集 */
    readonly BASE36: string;
  };

  // ... (原有函数保持不变)

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
   * [新增] 生成一个指定长度的随机回文串。
   * @param len 回文串的长度
   * @param charset 字符集 (默认: 小写字母)
   * @returns 一个回文串
   * @example
   * G.palindrome(5) // => "level"
   * G.palindrome(6, '01') // => "100001"
   */
  palindrome(len: number, charset?: string): string;

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
   * [新增] 生成排序序列，专为二分、双指针等题目设计。
   * @param count 元素数量
   * @param min 最小值
   * @param max 最大值
   * @param options 配置项
   * @returns 一个有序的数字数组
   * @example
   * G.sorted(5, 1, 100) // 默认 non-decreasing
   * G.sorted(5, 1, 20, { order: 'strictlyAsc' }) // 严格递增
   */
  sorted(count: number, min: number, max: number, options?: { order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc' }): number[];

  /**
   * [新增] 生成稀疏序列，保证相邻元素差的绝对值至少为 gap。
   * @param count 元素数量
   * @param min 最小值
   * @param max 最大值
   * @param gap 最小间距
   * @returns 一个稀疏的数字数组（顺序随机）
   * @example G.sparse(10, 1, 100, 5) // e.g. [5, 20, 11, ...]
   */
  sparse(count: number, min: number, max: number, gap: number): number[];

  /**
   * [新增] 生成和为 S 的正整数序列，专为背包、划分问题设计。
   * @param count 序列中正整数的数量
   * @param sum 目标和
   * @param options 配置项
   * @returns 一个和为 sum 的数字数组（顺序随机）
   * @example G.partition(5, 100, { minVal: 10 }) // 5个数和为100, 每个数>=10
   */
  partition(count: number, sum: number, options?: { minVal?: number }): number[];

  /**
   * 生成一个数值矩阵（二维数组）。
   * @param rows 行数
   * @param cols 列数
   * @param cellGenerator 每个单元格的生成器
   * @returns 一个根据规则生成的矩阵
   * @example G.matrix(2, 3, () => G.int(0, 9))
   */
  matrix<T>(rows: number, cols: number, cellGenerator: (rowIndex: number, colIndex: number) => T): T[][];

  /**
   * [新增] 生成 01 矩阵。
   * @param rows 行数
   * @param cols 列数
   * @param density 1 的密度 (0 到 1 之间, 默认 0.5)
   * @returns 一个只包含 0 和 1 的矩阵
   * @example G.grid01(10, 10, 0.3) // 10x10, 约30%的1
   */
  grid01(rows: number, cols: number, density?: number): number[][];

  /**
   * [新增] 生成保证全连通的随机迷宫。
   * @param rows 行数
   * @param cols 列数
   * @param options 配置项
   * @returns 一个由 wall 和 road 字符构成的迷宫矩阵
   * @example G.maze(11, 11, { wall: '#', road: '.' })
   */
  maze(rows: number, cols: number, options?: { wall?: string, road?: string }): string[][];

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

  /**
   * 🗺️ 生成 n 个二维平面点。
   * @param n 点的数量
   * @param minVal 坐标最小值
   * @param maxVal 坐标最大值
   * @param options 配置项，可生成特殊分布的点
   * @returns 点坐标列表, e.g., [[x1, y1], [x2, y2], ...]
   * @example
   * G.points(10, -100, 100) // 10个随机点
   * G.points(10, -100, 100, { type: 'collinear' }) // 10个共线的点
   */
  points(n: number, minVal: number, maxVal: number, options?: {
    type?: 'random' | 'collinear'
  }): number[][];

  /**
   * 🌀 [底层] 进制转换与编码工具集
   * 提供通用的、原子化的进制转换能力
   */
  readonly base: {
    /**
     * [核心] 通用进制转换函数，支持超大数，并内置严格校验。
     * @param input 要转换的数 (自动处理 number, bigint, string)
     * @param fromRadix 原始进制 (2-36)
     * @param toRadix 目标进制 (2-36)
     * @returns 转换后的【大写】字符串
     * @example G.base.convert('1010', 2, 10) // => '10'
     */
    convert(input: string | number | bigint, fromRadix: number, toRadix: number): string;

    /**
     * [语义化别名] 转换二进制字符串到十六进制。竞赛最常用。
     * @param binString 一个合法的二进制字符串
     * @returns 转换后的【大写】十六进制字符串
     * @example G.base.binToHex('111100001010') // => 'F0A'
     */
    binToHex(binString: string): string;

    /**
     * [语义化别名] 转换十六进制字符串到二进制。竞赛最常用。
     * @param hexString 一个合法的十六进制字符串
     * @returns 转换后的二进制字符串
     * @example G.base.hexToBin('F0A') // => '111100001010'
     */
    hexToBin(hexString: string): string;
    
    /**
     * 生成一个指定位数的、指定进制的随机数（以字符串形式）。
     * 严格遵守“无多余前导0”的约定。
     * @param length 数字的位数/长度
     * @param radix 进制 (2-36)
     * @returns 一个随机的、指定进制的【大写】数字字符串
     * @example
     * G.base.digits(100, 2)  // 生成一个100位的二进制数
     * G.base.digits(30, 16)  // 生成一个30位的十六进制数
     */
    digits(length: number, radix: number): string;

  };

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
          parts.push(points[i+1] - points[i] + minVal);
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
        // 为避免在小范围内生成大量点时陷入死循环，我们确保生成的点不重复
        // 并且只尝试生成坐标范围内可能存在的最大点数
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

        // 尝试最多50次来找到一条可以容纳n个点的线段，防止死循环
        for (let attempt = 0; attempt < 50; attempt++) {
            // 生成一个随机的、非零的方向向量
            do {
                dx = this.int(-10, 10);
                dy = this.int(-10, 10);
            } while (dx === 0 && dy === 0);

            // 基于方向向量(dx, dy)和点数n, 计算出起始点(x0, y0)的安全范围
            const x0_min = dx >= 0 ? minVal : minVal - (n - 1) * dx;
            const x0_max = dx >= 0 ? maxVal - (n - 1) * dx : maxVal;

            const y0_min = dy >= 0 ? minVal : minVal - (n - 1) * dy;
            const y0_max = dy >= 0 ? maxVal - (n - 1) * dy : maxVal;

            // 如果安全范围有效，则生成点集并返回
            if (x0_min <= x0_max && y0_min <= y0_max) {
                x0 = this.int(x0_min, x0_max);
                y0 = this.int(y0_min, y0_max);
                
                const points = Array.from({ length: n }, (_, i) => [x0 + i * dx, y0 + i * dy]);
                return this.shuffle(points); // 打乱顺序，避免规律性
            }
        }

        // 如果多次尝试后仍失败（例如n过大或范围过小），则发出警告并回退到生成随机点
        console.warn(`Could not generate collinear points for n=${n} in range [${minVal}, ${maxVal}]. Falling back to random points.`);
        return this.points(n, minVal, maxVal, { type: 'random' });
    }
    
    // 理论上不可达
    return [];
  },

  base: {
    convert(input: string | number | bigint, fromRadix: number, toRadix: number): string {
      // 1. 严格校验进制范围
      if (fromRadix < 2 || fromRadix > 36 || toRadix < 2 || toRadix > 36) {
        throw new Error(`Radix must be an integer between 2 and 36. Received: from=${fromRadix}, to=${toRadix}`);
      }
      
      const inputStr = String(input);
      let valueAsBigInt: bigint;

      // 2. 任何进制 -> BigInt (作为中间态)，并校验输入合法性
      try {
        if (fromRadix === 10) {
          valueAsBigInt = BigInt(inputStr);
        } else {
          valueAsBigInt = BigInt(0);
          const fromBase = BigInt(fromRadix);
          for (const char of inputStr.toUpperCase()) {
            const digit = G.CHARSET.BASE36.indexOf(char);
            // 3. 严格校验每一位数字是否合法
            if (digit === -1 || digit >= fromRadix) {
              throw new Error(); // 抛出错误由 catch 统一处理
            }
            valueAsBigInt = valueAsBigInt * fromBase + BigInt(digit);
          }
        }
      } catch {
        throw new Error(`Input "${inputStr}" contains invalid characters for base ${fromRadix}.`);
      }

      // 4. BigInt -> 目标进制
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
      // 5. 严格保证无前导 0
      if (length === 1) return G.sample(charset.split(''));

      const firstChar = G.sample(charset.replace('0', '').split(''));
      const restChars = G.string(length - 1, charset);
      return firstChar + restChars;
    },


  }

};

