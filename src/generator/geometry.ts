// src/generator/geometry.ts
// 几何生成模块

import type { GeneratorCore } from './core';
import type { NumberGenerators } from './numbers';

export interface GeometryGenerators {
    points(n: number, minVal: number, maxVal: number, options?: { type?: 'random' | 'collinear' }): number[][];
    convexHull(n: number, minVal: number, maxVal: number): number[][];
}

export function createGeometryGenerators(core: GeneratorCore, numbers: NumberGenerators): GeometryGenerators {
    const generators: GeometryGenerators = {
        points(n: number, minVal: number, maxVal: number, options: { type?: 'random' | 'collinear' } = {}): number[][] {
            const { type = 'random' } = options;

            if (type === 'random') {
                const pointSet = new Set<string>();
                const maxPossible = (maxVal - minVal + 1) ** 2;
                const target = Math.min(n, maxPossible);
                while (pointSet.size < target) {
                    pointSet.add(`${core.int(minVal, maxVal)},${core.int(minVal, maxVal)}`);
                }
                return Array.from(pointSet).map(p => p.split(',').map(Number));
            }

            if (type === 'collinear') {
                if (n <= 1) return generators.points(n, minVal, maxVal);
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
                return generators.points(n, minVal, maxVal);
            }
            return [];
        },

        convexHull(n: number, minVal: number, maxVal: number): number[][] {
            if (n < 3) return generators.points(n, minVal, maxVal);

            const angles: number[] = [];
            for (let i = 0; i < n; i++) {
                angles.push(numbers.float(0, 2 * Math.PI, 6));
            }
            angles.sort((a, b) => a - b);

            const cx = (minVal + maxVal) / 2;
            const cy = (minVal + maxVal) / 2;
            const maxR = (maxVal - minVal) / 2 * 0.9;
            const minR = maxR * 0.3;

            const points: number[][] = [];
            for (const angle of angles) {
                const r = numbers.float(minR, maxR, 2);
                const x = Math.max(minVal, Math.min(maxVal, Math.round(cx + r * Math.cos(angle))));
                const y = Math.max(minVal, Math.min(maxVal, Math.round(cy + r * Math.sin(angle))));
                points.push([x, y]);
            }

            const unique = Array.from(
                new Set(points.map(p => `${p[0]},${p[1]}`))
            ).map(s => s.split(',').map(Number));

            while (unique.length < n) {
                const angle = numbers.float(0, 2 * Math.PI, 6);
                const r = numbers.float(minR, maxR, 2);
                const x = Math.max(minVal, Math.min(maxVal, Math.round(cx + r * Math.cos(angle))));
                const y = Math.max(minVal, Math.min(maxVal, Math.round(cy + r * Math.sin(angle))));
                const key = `${x},${y}`;
                if (!unique.some(p => `${p[0]},${p[1]}` === key)) {
                    unique.push([x, y]);
                }
            }
            return unique.slice(0, n);
        },
    };

    return generators;
}
