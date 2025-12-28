// src/generator/types.ts
// Generator 接口定义

import type { DebugOptions, TreeOptions, GraphOptions } from '../types';

/**
 * 定义 Genesis 数据生成器 (G) 的完整接口。
 */
export interface IGenerator {
    /**
     * 常用的预定义字符集。
     */
    readonly CHARSET: {
        readonly LOWERCASE: string;
        readonly UPPERCASE: string;
        readonly DIGITS: string;
        readonly ALPHANUMERIC: string;
        readonly ALPHA: string;
        readonly BASE36: string;
    };

    // ============ 数值生成 ============

    /** 生成一个 [min, max] 范围内的随机整数 */
    int(min: number, max: number): number;

    /** 生成包含 n 个随机整数的数组 */
    ints(count: number, min: number, max: number): number[];

    /** 生成包含 n 个互不相同的随机整数的数组 */
    distinctInts(count: number, min: number, max: number): number[];

    /** 生成一个随机浮点数 */
    float(min: number, max: number, precision?: number): number;

    /** 生成一个随机偶数 */
    even(min: number, max: number): number;

    /** 生成一个随机奇数 */
    odd(min: number, max: number): number;

    /** [新增] 生成一个随机质数 */
    prime(min: number, max: number): number;

    /** [新增] 生成一对互质数 */
    coprime(min: number, max: number): [number, number];

    /** [新增] 生成能被 d 整除的随机数 */
    divisible(min: number, max: number, d: number): number;

    // ============ 字符串生成 ============

    /** 生成指定长度的随机字符串 */
    string(len: number, charset?: string): string;

    /** 生成随机回文字符串 */
    palindrome(len: number, charset?: string): string;

    /** 生成一个随机单词 */
    word(minLen: number, maxLen: number): string;

    /** 生成包含 n 个随机单词的数组 */
    words(count: number, minLen: number, maxLen: number): string[];

    /** [新增] 生成合法括号序列 */
    brackets(n: number, options?: { types?: string }): string;

    // ============ 数组/矩阵 ============

    /** 根据规则构建数组 */
    array<T>(count: number, itemGenerator: (index: number) => T): T[];

    /** 生成有序序列 */
    sorted(count: number, min: number, max: number, options?: { order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc' }): number[];

    /** 生成稀疏序列 */
    sparse(count: number, min: number, max: number, gap: number): number[];

    /** 生成和为 S 的正整数序列 */
    partition(count: number, sum: number, options?: { minVal?: number }): number[];

    /** 生成数字矩阵 */
    matrix<T>(rows: number, cols: number, cellGenerator: (r: number, c: number) => T): T[][];

    /** 生成 0-1 矩阵 */
    grid01(rows: number, cols: number, density?: number): number[][];

    /** 生成迷宫 */
    maze(rows: number, cols: number, options?: { wall?: string; road?: string }): string[][];

    /** [新增] 生成区间列表 */
    intervals(n: number, min: number, max: number, options?: {
        overlapping?: boolean;
        sorted?: boolean;
        minLen?: number;
        maxLen?: number;
    }): number[][];

    // ============ 排列/采样 ============

    /** 生成全排列 */
    permutation(n: number, oneBased?: boolean): number[];

    /** 随机打乱数组 */
    shuffle<T>(array: readonly T[]): T[];

    /** 随机采样 */
    sample<T>(population: readonly T[]): T;
    sample<T>(population: readonly T[], k: number): T[];

    /** 分块 */
    chunk<T>(array: readonly T[], size: number): T[][];

    // ============ 图论 ============

    /** 生成树 */
    tree(n: number, options?: TreeOptions): number[][];

    /** 生成图 */
    graph(n: number, m: number, options?: GraphOptions): number[][];

    // ============ 几何 ============

    /** 生成二维点坐标 */
    points(n: number, minVal: number, maxVal: number, options?: { type?: 'random' | 'collinear' }): number[][];

    /** [新增] 生成凸包上的点 */
    convexHull(n: number, minVal: number, maxVal: number): number[][];

    // ============ 日期 ============

    /** 判断闰年 */
    isLeap(year: number): boolean;

    /** 生成随机年份 */
    year(minYear?: number, maxYear?: number): number;

    /** 生成随机日期 */
    date(options?: { minYear?: number; maxYear?: number; format?: string }): string;

    // ============ 进制 ============

    readonly base: {
        convert(input: string | number | bigint, fromRadix: number, toRadix: number): string;
        binToHex(binString: string): string;
        hexToBin(hexString: string): string;
        digits(length: number, radix: number): string;
    };

    // ============ 调试 ============

    debug<T>(data: T, options?: DebugOptions): void;
    debug<T>(label: string, data: T, options?: DebugOptions): void;
}
