// src/generator/arrays.ts
// 数组/矩阵生成模块 — 静态导出

import * as core from './core';
import * as numbers from './numbers';

// ============ 静态导出函数 ============

export function array<T>(count: number, itemGenerator: (index: number) => T): T[] {
    return Array.from({ length: count }, (_, i) => itemGenerator(i));
}

export function sorted(count: number, min: number, max: number, options: { order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc' } = {}): number[] {
    const { order = 'asc' } = options;
    if (order === 'strictlyAsc' || order === 'strictlyDesc') {
        const nums = numbers.distinctInts(count, min, max);
        return nums.sort((a, b) => order === 'strictlyAsc' ? a - b : b - a);
    }
    const nums = numbers.ints(count, min, max);
    return nums.sort((a, b) => order === 'asc' ? a - b : b - a);
}

export function sparse(count: number, min: number, max: number, gap: number): number[] {
    if ((count - 1) * gap > max - min) {
        throw new Error(`Cannot generate ${count} sparse numbers with gap ${gap} in range [${min}, ${max}]. Range is too small.`);
    }
    const baseValues = sorted(count, 0, max - min - (count - 1) * gap);
    const sparseValues = baseValues.map((val, i) => min + val + i * gap);
    return core.shuffle(sparseValues);
}

export function partition(count: number, sum: number, options: { minVal?: number } = {}): number[] {
    const { minVal = 1 } = options;
    if (count * minVal > sum) {
        throw new Error(`Cannot partition sum ${sum} into ${count} parts with minVal ${minVal}. Required sum is at least ${count * minVal}.`);
    }
    const adjustedSum = sum - count * minVal;
    const cuts = sorted(count - 1, 0, adjustedSum);
    const points = [0, ...cuts, adjustedSum];
    const parts: number[] = [];
    for (let i = 0; i < count; i++) {
        parts.push(points[i + 1] - points[i] + minVal);
    }
    return core.shuffle(parts);
}

export function matrix<T>(rows: number, cols: number, cellGenerator: (r: number, c: number) => T): T[][] {
    return Array.from({ length: rows }, (_, i) =>
        Array.from({ length: cols }, (__, j) => cellGenerator(i, j))
    );
}

export function grid01(rows: number, cols: number, density = 0.5): number[][] {
    return matrix(rows, cols, () => Math.random() < density ? 1 : 0);
}

export function maze(rows: number, cols: number, options: { wall?: string; road?: string } = {}): string[][] {
    const { wall = '#', road = '.' } = options;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(wall));
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const stack: [number, number][] = [];

    const startR = 1, startC = 1;
    if (startR >= rows || startC >= cols) return grid;

    grid[startR][startC] = road;
    visited[startR][startC] = true;
    stack.push([startR, startC]);

    while (stack.length > 0) {
        const [r, c] = stack.pop()!;
        const dirs = core.shuffle([[-2, 0], [2, 0], [0, -2], [0, 2]]);

        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && !visited[nr][nc]) {
                grid[r + dr / 2][c + dc / 2] = road;
                grid[nr][nc] = road;
                visited[nr][nc] = true;
                stack.push([r, c]);
                stack.push([nr, nc]);
                break;
            }
        }
    }
    return grid;
}

export function intervals(n: number, min: number, max: number, options: { overlapping?: boolean; sorted?: boolean; minLen?: number; maxLen?: number } = {}): number[][] {
    const { overlapping = true, sorted: shouldSort = false, minLen = 1, maxLen = max - min } = options;
    const result: number[][] = [];

    if (overlapping) {
        for (let i = 0; i < n; i++) {
            const len = core.int(minLen, Math.min(maxLen, max - min));
            const l = core.int(min, max - len);
            result.push([l, l + len]);
        }
    } else {
        const totalMinSpace = n * minLen;
        if (totalMinSpace > max - min + 1) {
            throw new Error(`Cannot generate ${n} non-overlapping intervals in range [${min}, ${max}].`);
        }
        const gaps = max - min + 1 - totalMinSpace;
        const extraLens = partition(n, gaps, { minVal: 0 });
        let current = min;
        for (let i = 0; i < n; i++) {
            const len = minLen + extraLens[i];
            result.push([current, current + len - 1]);
            current += len;
        }
        return shouldSort ? result : core.shuffle(result);
    }

    return shouldSort ? result.sort((a, b) => a[0] - b[0]) : result;
}

export function permutation(n: number, oneBased = true): number[] {
    const arr = Array.from({ length: n }, (_, i) => (oneBased ? i + 1 : i));
    return core.shuffle(arr);
}

export { chunk } from './core';
