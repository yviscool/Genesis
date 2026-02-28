// src/generator/geometry.ts
// 几何生成模块 — 静态导出

import * as core from './core';
import { float } from './numbers';

// ============ 静态导出函数 ============

export function points(n: number, minVal: number, maxVal: number, options: { type?: 'random' | 'collinear' } = {}): number[][] {
    const { type = 'random' } = options;

    if (type === 'random') {
        const range = maxVal - minVal + 1;
        const maxPossible = range * range;
        const target = Math.min(n, maxPossible);
        const DENSE_RATIO = 0.65;
        const MAX_POOL_SIZE = 1_000_000;

        if (maxPossible <= MAX_POOL_SIZE && target / maxPossible >= DENSE_RATIO) {
            // 接近满网格时改用池采样，避免 set 去重退化
            const pool = Array.from({ length: maxPossible }, (_, i) => i);
            for (let i = 0; i < target; i++) {
                const j = i + core.int(0, maxPossible - i - 1);
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }

            return pool.slice(0, target).map(idx => {
                const x = minVal + Math.floor(idx / range);
                const y = minVal + (idx % range);
                return [x, y];
            });
        }

        const pointSet = new Set<string>();
        while (pointSet.size < target) {
            pointSet.add(`${core.int(minVal, maxVal)},${core.int(minVal, maxVal)}`);
        }
        return Array.from(pointSet).map(p => p.split(',').map(Number));
    }

    if (type === 'collinear') {
        if (n <= 1) return points(n, minVal, maxVal);
        for (let attempt = 0; attempt < 50; attempt++) {
            let dx: number, dy: number;
            do {
                dx = core.int(-10, 10);
                dy = core.int(-10, 10);
            } while (dx === 0 && dy === 0);

            const x0_min = dx >= 0 ? minVal : minVal - (n - 1) * dx;
            const x0_max = dx >= 0 ? maxVal - (n - 1) * dx : maxVal;
            const y0_min = dy >= 0 ? minVal : minVal - (n - 1) * dy;
            const y0_max = dy >= 0 ? maxVal - (n - 1) * dy : maxVal;

            if (x0_min <= x0_max && y0_min <= y0_max) {
                const x0 = core.int(x0_min, x0_max);
                const y0 = core.int(y0_min, y0_max);
                return core.shuffle(Array.from({ length: n }, (_, i) => [x0 + i * dx, y0 + i * dy]));
            }
        }
        return points(n, minVal, maxVal);
    }
    return [];
}

export function convexHull(n: number, minVal: number, maxVal: number): number[][] {
    if (n < 3) return points(n, minVal, maxVal);

    const angles: number[] = [];
    for (let i = 0; i < n; i++) {
        angles.push(float(0, 2 * Math.PI, 6));
    }
    angles.sort((a, b) => a - b);

    const cx = (minVal + maxVal) / 2;
    const cy = (minVal + maxVal) / 2;
    const maxR = (maxVal - minVal) / 2 * 0.9;
    const minR = maxR * 0.3;

    const result: number[][] = [];
    for (const angle of angles) {
        const r = float(minR, maxR, 2);
        const x = Math.max(minVal, Math.min(maxVal, Math.round(cx + r * Math.cos(angle))));
        const y = Math.max(minVal, Math.min(maxVal, Math.round(cy + r * Math.sin(angle))));
        result.push([x, y]);
    }

    const unique = Array.from(
        new Set(result.map(p => `${p[0]},${p[1]}`))
    ).map(s => s.split(',').map(Number));

    while (unique.length < n) {
        const angle = float(0, 2 * Math.PI, 6);
        const r = float(minR, maxR, 2);
        const x = Math.max(minVal, Math.min(maxVal, Math.round(cx + r * Math.cos(angle))));
        const y = Math.max(minVal, Math.min(maxVal, Math.round(cy + r * Math.sin(angle))));
        const key = `${x},${y}`;
        if (!unique.some(p => `${p[0]},${p[1]}` === key)) {
            unique.push([x, y]);
        }
    }
    return unique.slice(0, n);
}

export function polygon(n: number, minVal: number, maxVal: number): number[][] {
    if (n < 3) return points(n, minVal, maxVal);

    // 生成 n 个随机点
    const pts = points(n, minVal, maxVal);

    // 计算重心
    const cx = pts.reduce((sum, p) => sum + p[0], 0) / n;
    const cy = pts.reduce((sum, p) => sum + p[1], 0) / n;

    // 按极角排序形成简单多边形
    return pts.sort((a, b) => {
        const angleA = Math.atan2(a[1] - cy, a[0] - cx);
        const angleB = Math.atan2(b[1] - cy, b[0] - cx);
        return angleA - angleB;
    });
}
