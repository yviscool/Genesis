// src/generator/core.ts
// 核心基础函数 — 单例导出，其他模块直接 import

import { shuffle as esShuffle, sampleSize as esSampleSize, chunk as esChunk } from 'es-toolkit';

/**
 * 生成 [min, max] 范围内的随机整数
 */
export function int(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 随机打乱数组
 */
export function shuffle<T>(array: readonly T[]): T[] {
    return esShuffle(array);
}

/**
 * 随机采样
 */
export function sample<T>(population: readonly T[]): T;
export function sample<T>(population: readonly T[], k: number): T[];
export function sample<T>(population: readonly T[], k?: number): T | T[] {
    if (k === undefined) {
        if (population.length === 0) throw new Error('Cannot sample from an empty array.');
        return population[Math.floor(Math.random() * population.length)]!;
    }
    return esSampleSize(population, k);
}

/**
 * 数组分块
 */
export function chunk<T>(array: readonly T[], size: number): T[][] {
    return esChunk(array, size);
}

// 为了兼容旧代码，保留 core 对象形式
export const core = { int, shuffle, sample };
