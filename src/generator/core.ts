// src/generator/core.ts
// 核心基础函数 — 单例导出，其他模块直接 import

import { chunk as esChunk } from 'es-toolkit';

export type RandomSource = () => number;

const MAX_RANDOM = 1 - Number.EPSILON;
let randomSource: RandomSource = Math.random;

function normalizedRandom(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value <= 0) return 0;
    if (value >= 1) return MAX_RANDOM;
    return value;
}

/**
 * 注入随机源（返回值应位于 [0, 1)）。
 */
export function withRng(rng: RandomSource): void {
    if (typeof rng !== 'function') {
        throw new Error('Random source must be a function.');
    }
    randomSource = rng;
}

/**
 * 重置为默认随机源 Math.random。
 */
export function resetRng(): void {
    randomSource = Math.random;
}

/**
 * 获取 [0, 1) 随机小数。
 */
export function rand(): number {
    return normalizedRandom(randomSource());
}

/**
 * 生成 [min, max] 范围内的随机整数
 */
export function int(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(rand() * (max - min + 1)) + min;
}

/**
 * 随机打乱数组
 */
export function shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    return shuffleInPlace(result);
}

/**
 * In-place Fisher-Yates shuffle for mutable arrays.
 */
export function shuffleInPlace<T>(array: T[]): T[] {
    const result = array;
    for (let i = result.length - 1; i > 0; i--) {
        const j = int(0, i);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * 随机采样
 */
export function sample<T>(population: readonly T[]): T;
export function sample<T>(population: readonly T[], k: number): T[];
export function sample<T>(population: readonly T[], k?: number): T | T[] {
    if (k === undefined) {
        if (population.length === 0) throw new Error('Cannot sample from an empty array.');
        return population[int(0, population.length - 1)]!;
    }
    if (k < 0) {
        throw new Error('Sample size cannot be negative.');
    }
    if (k > population.length) {
        throw new Error(`Sample size ${k} exceeds population size ${population.length}.`);
    }
    if (k === 0) return [];
    if (k === population.length) return shuffle(population);

    const indices = Array.from({ length: population.length }, (_, i) => i);
    for (let i = 0; i < k; i++) {
        const j = i + int(0, population.length - i - 1);
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, k).map(i => population[i]!);
}

/**
 * 数组分块
 */
export function chunk<T>(array: readonly T[], size: number): T[][] {
    return esChunk(array, size);
}

// 为了兼容旧代码，保留 core 对象形式
export const core = { int, shuffle, shuffleInPlace, sample, rand, withRng, resetRng };
