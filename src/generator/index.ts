// src/generator/index.ts
// Genesis 数据生成器 — 简洁的模块组装入口
// 静态导出设计：直接从各模块导入，无需工厂函数

import type { IGenerator } from './types';

// 直接导入各模块的静态导出
import * as core from './core';
import * as numbers from './numbers';
import * as strings from './strings';
import * as arrays from './arrays';
import * as datetime from './datetime';
import * as geometry from './geometry';
import * as graphs from './graphs';
import { base } from './base';
import { debug } from './debug';
import { CHARSET } from './strings';

/**
 * G 对象 — Genesis 数据生成器单例
 * 
 * 静态导出架构：
 * - 所有模块直接导出函数
 * - 模块间通过 import * as xxx 相互引用
 * - 无工厂函数，无闭包，代码简洁
 */
export const G: IGenerator = {
    // 字符集常量
    CHARSET,

    // === 数值生成 ===
    int: numbers.int,
    ints: numbers.ints,
    distinctInts: numbers.distinctInts,
    float: numbers.float,
    even: numbers.even,
    odd: numbers.odd,
    prime: numbers.prime,
    coprime: numbers.coprime,
    divisible: numbers.divisible,
    sequence: numbers.sequence,

    // === 字符串生成 ===
    string: strings.string,
    palindrome: strings.palindrome,
    word: strings.word,
    words: strings.words,
    brackets: strings.brackets,

    // === 数组/矩阵 ===
    array: arrays.array,
    sorted: arrays.sorted,
    sparse: arrays.sparse,
    partition: arrays.partition,
    matrix: arrays.matrix,
    grid01: arrays.grid01,
    maze: arrays.maze,
    intervals: arrays.intervals,
    permutation: arrays.permutation,
    chunk: arrays.chunk,

    // === 排列/采样 ===
    shuffle: core.shuffle,
    sample: core.sample,

    // === 图论 ===
    tree: graphs.tree,
    graph: graphs.graph,
    binaryTree: graphs.binaryTree,

    // === 几何 ===
    points: geometry.points,
    convexHull: geometry.convexHull,
    polygon: geometry.polygon,

    // === 日期 ===
    isLeap: datetime.isLeap,
    year: datetime.year,
    date: datetime.date,

    // === 进制 ===
    base,

    // === 调试 ===
    debug,
};

// 导出类型
export type { IGenerator } from './types';
