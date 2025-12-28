// src/generator/core.ts
// 核心基础函数 — 其他所有模块依赖的最底层实现

import { shuffle as esShuffle, sampleSize as esSampleSize, chunk as esChunk } from 'es-toolkit';

/**
 * 核心基础接口 — 所有模块都依赖的最小函数集
 */
export interface GeneratorCore {
    int(min: number, max: number): number;
    shuffle<T>(array: readonly T[]): T[];
    sample<T>(population: readonly T[]): T;
    sample<T>(population: readonly T[], k: number): T[];
}

/**
 * 创建核心基础函数
 */
export function createCore(): GeneratorCore {
    const core: GeneratorCore = {
        int(min: number, max: number): number {
            min = Math.ceil(min);
            max = Math.floor(max);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },

        shuffle: esShuffle,

        sample(population: readonly any[], k?: number): any {
            if (k === undefined) {
                if (population.length === 0) throw new Error('Cannot sample from an empty array.');
                return population[Math.floor(Math.random() * population.length)]!;
            }
            return esSampleSize(population, k);
        },
    };

    return core;
}

// 导出工具函数
export { esShuffle as shuffle, esSampleSize as sampleSize, esChunk as chunk };
