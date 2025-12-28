// src/generator/index.ts
// Genesis 数据生成器 — 模块组装入口
// 真正的模块化设计：从各独立模块导入并组装

import type { IGenerator } from './types';

// 导入核心和各功能模块
import { createCore } from './core';
import { createNumberGenerators } from './numbers';
import { createStringGenerators, CHARSET } from './strings';
import { createArrayGenerators } from './arrays';
import { createDateTimeGenerators } from './datetime';
import { createBaseGenerators } from './base';
import { createGeometryGenerators } from './geometry';
import { createGraphGenerators } from './graphs';
import { createDebug } from './debug';

/**
 * 组装 G 对象 — Genesis 数据生成器
 * 
 * 架构设计:
 * ┌─────────────────────────────────────────────────────────┐
 * │                       G (IGenerator)                     │
 * ├─────────────────────────────────────────────────────────┤
 * │  ┌───────┐  ┌─────────┐  ┌────────┐  ┌──────────┐       │
 * │  │numbers│  │ strings │  │ arrays │  │  graphs  │       │
 * │  └───┬───┘  └────┬────┘  └───┬────┘  └────┬─────┘       │
 * │      │           │           │            │              │
 * │  ┌───┴───────────┴───────────┴────────────┴───┐         │
 * │  │                   core                      │         │
 * │  │   (int, shuffle, sample - 最底层函数)       │         │
 * │  └────────────────────────────────────────────┘         │
 * └─────────────────────────────────────────────────────────┘
 */
function createGenerator(): IGenerator {
    // 1. 创建核心基础函数
    const core = createCore();

    // 2. 创建各功能模块 (按依赖顺序)
    const numbers = createNumberGenerators(core);
    const strings = createStringGenerators(core);
    const arrays = createArrayGenerators(core, numbers);
    const datetime = createDateTimeGenerators(core);
    const base = createBaseGenerators(core, strings);
    const geometry = createGeometryGenerators(core, numbers);
    const graphs = createGraphGenerators(core, arrays);
    const debug = createDebug();

    // 3. 组装成完整的 G 对象
    const G: IGenerator = {
        // 字符集常量
        CHARSET,

        // === 数值生成 (from numbers) ===
        int: numbers.int,
        ints: numbers.ints,
        distinctInts: numbers.distinctInts,
        float: numbers.float,
        even: numbers.even,
        odd: numbers.odd,
        prime: numbers.prime,
        coprime: numbers.coprime,
        divisible: numbers.divisible,

        // === 字符串生成 (from strings) ===
        string: strings.string,
        palindrome: strings.palindrome,
        word: strings.word,
        words: strings.words,
        brackets: strings.brackets,

        // === 数组/矩阵 (from arrays) ===
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

        // === 排列/采样 (from core) ===
        shuffle: core.shuffle,
        sample: core.sample,

        // === 图论 (from graphs) ===
        tree: graphs.tree,
        graph: graphs.graph,

        // === 几何 (from geometry) ===
        points: geometry.points,
        convexHull: geometry.convexHull,

        // === 日期 (from datetime) ===
        isLeap: datetime.isLeap,
        year: datetime.year,
        date: datetime.date,

        // === 进制 (from base) ===
        base,

        // === 调试 (from debug) ===
        debug,
    };

    return G;
}

// 创建并导出单例
export const G = createGenerator();

// 导出类型
export type { IGenerator } from './types';
