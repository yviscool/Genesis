// src/generator/numbers.ts
// 数值生成模块 — 静态导出

import * as core from './core';

// 增量质数缓存（按最大上界复用）
let primeCacheMax = 1;
const primeCache: number[] = [];

function isPrimeByCache(candidate: number): boolean {
    const limit = Math.floor(Math.sqrt(candidate));
    for (const p of primeCache) {
        if (p > limit) break;
        if (candidate % p === 0) return false;
    }
    return true;
}

function ensurePrimesUpTo(max: number): void {
    if (max <= primeCacheMax) return;
    const start = Math.max(2, primeCacheMax + 1);
    for (let n = start; n <= max; n++) {
        if (isPrimeByCache(n)) {
            primeCache.push(n);
        }
    }
    primeCacheMax = max;
}

function lowerBound(arr: number[], target: number): number {
    let l = 0;
    let r = arr.length;
    while (l < r) {
        const mid = (l + r) >> 1;
        if (arr[mid] < target) l = mid + 1;
        else r = mid;
    }
    return l;
}

// GCD
function gcd(a: number, b: number): number {
    while (b !== 0) {
        [a, b] = [b, a % b];
    }
    return a;
}

// 数列生成选项
export type SequenceOptions =
    | { type: 'arithmetic'; start: number; diff: number; count: number }
    | { type: 'geometric'; start: number; ratio: number; count: number }
    | { type: 'fibonacci'; count: number; first?: number; second?: number }
    | { type: 'custom'; init: number[]; fn: (prev: number[]) => number; count: number };

// ============ 静态导出函数 ============

export const int = core.int;

export function ints(count: number, min: number, max: number): number[] {
    return Array.from({ length: count }, () => core.int(min, max));
}

export function distinctInts(count: number, min: number, max: number): number[] {
    const range = max - min + 1;
    if (count > range) {
        throw new Error(`Cannot generate ${count} distinct integers from a range of size ${range}.`);
    }

    if (count <= 0) return [];

    // 高占比场景使用局部 Fisher-Yates，避免反复撞值
    const DENSE_RATIO = 0.6;
    const MAX_POOL_SIZE = 2_000_000;
    if (range <= MAX_POOL_SIZE && count / range >= DENSE_RATIO) {
        const pool = Array.from({ length: range }, (_, i) => min + i);
        for (let i = 0; i < count; i++) {
            const j = i + core.int(0, range - i - 1);
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count);
    }

    const values = new Set<number>();
    while (values.size < count) values.add(core.int(min, max));
    return Array.from(values);
}

export function float(min: number, max: number, precision = 2): number {
    const value = core.rand() * (max - min) + min;
    return parseFloat(value.toFixed(precision));
}

export function even(min: number, max: number): number {
    const start = min % 2 === 0 ? min : min + 1;
    const end = max % 2 === 0 ? max : max - 1;
    if (start > end) throw new Error(`No even numbers exist in the range [${min}, ${max}].`);
    const numChoices = (end - start) / 2;
    return start + core.int(0, numChoices) * 2;
}

export function odd(min: number, max: number): number {
    const start = min % 2 !== 0 ? min : min + 1;
    const end = max % 2 !== 0 ? max : max - 1;
    if (start > end) throw new Error(`No odd numbers exist in the range [${min}, ${max}].`);
    const numChoices = (end - start) / 2;
    return start + core.int(0, numChoices) * 2;
}

export function prime(min: number, max: number): number {
    ensurePrimesUpTo(max);
    const start = lowerBound(primeCache, min);
    if (start >= primeCache.length || primeCache[start] > max) {
        throw new Error(`No prime numbers exist in the range [${min}, ${max}].`);
    }

    let end = lowerBound(primeCache, max + 1) - 1;
    if (end < start) {
        throw new Error(`No prime numbers exist in the range [${min}, ${max}].`);
    }
    return primeCache[core.int(start, end)]!;
}

export function coprime(min: number, max: number): [number, number] {
    for (let attempt = 0; attempt < 1000; attempt++) {
        const a = core.int(min, max);
        const b = core.int(min, max);
        if (a !== b && gcd(a, b) === 1) {
            return [a, b];
        }
    }
    return [1, core.int(Math.max(2, min), max)];
}

export function divisible(min: number, max: number, d: number): number {
    if (d === 0) throw new Error('Divisor cannot be zero.');
    const start = Math.ceil(min / d) * d;
    const end = Math.floor(max / d) * d;
    if (start > end) {
        throw new Error(`No numbers divisible by ${d} exist in the range [${min}, ${max}].`);
    }
    const count = (end - start) / d;
    return start + core.int(0, count) * d;
}

export function sequence(options: SequenceOptions): number[] {
    switch (options.type) {
        case 'arithmetic': {
            const { start, diff, count } = options;
            return Array.from({ length: count }, (_, i) => start + i * diff);
        }
        case 'geometric': {
            const { start, ratio, count } = options;
            return Array.from({ length: count }, (_, i) => start * Math.pow(ratio, i));
        }
        case 'fibonacci': {
            const { count, first = 1, second = 1 } = options;
            if (count <= 0) return [];
            if (count === 1) return [first];
            const result = [first, second];
            for (let i = 2; i < count; i++) {
                result.push(result[i - 1] + result[i - 2]);
            }
            return result;
        }
        case 'custom': {
            const { init, fn, count } = options;
            if (count <= init.length) return init.slice(0, count);
            const result = [...init];
            for (let i = init.length; i < count; i++) {
                result.push(fn(result));
            }
            return result;
        }
    }
}
