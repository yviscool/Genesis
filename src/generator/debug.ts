// src/generator/debug.ts
// 调试工具模块

import pc from 'picocolors';
import type { DebugOptions } from '../types';

export type DebugFunction = {
    <T>(data: T, options?: DebugOptions): void;
    <T>(label: string, data: T, options?: DebugOptions): void;
};

export function createDebug(): DebugFunction {
    return function debug<T>(
        labelOrData: string | T,
        dataOrOptions?: T | DebugOptions,
        options?: DebugOptions
    ): void {
        let label: string | null = null;
        let data: T;
        let config: Required<Omit<DebugOptions, 'colors'>>;

        const defaults: Required<Omit<DebugOptions, 'colors'>> = {
            separator: ' ',
            printDims: false,
            printType: true,
            printStats: false,
            truncate: 50,
        };

        if (typeof labelOrData === 'string') {
            label = labelOrData;
            data = dataOrOptions as T;
            config = { ...defaults, ...options };
        } else {
            data = labelOrData as T;
            config = { ...defaults, ...(dataOrOptions as DebugOptions) };
        }

        console.log(pc.bold(pc.cyan(`---[ ${label || 'Genesis Debug'} ]`)) + pc.gray(' ---'));

        if (data === null || data === undefined) {
            console.log(pc.magenta(String(data)));
            console.log(pc.gray('------------------------------------'));
            return;
        }

        if (!Array.isArray(data)) {
            if (config.printType) {
                console.log(`${pc.yellow('Type:')} ${pc.green(typeof data)}`);
            }
            console.log(data);
            console.log(pc.gray('------------------------------------'));
            return;
        }

        if (data.length === 0) {
            console.log(pc.yellow('Type:') + pc.green(' Array (empty)'));
            console.log('[]');
            console.log(pc.gray('------------------------------------'));
            return;
        }

        const is2D = Array.isArray(data[0]);
        const isTruncated = data.length > config.truncate;
        const displayData = isTruncated ? data.slice(0, config.truncate) : data;

        if (config.printType) {
            const itemType = is2D ? typeof (data[0] as any[])?.[0] : typeof data[0];
            const typeStr = is2D ? `Matrix<${itemType}>` : `Array<${itemType}>`;
            const dimsStr = is2D
                ? `(${data.length}x${(data[0] as any[]).length})`
                : `(len=${data.length})`;
            console.log(`${pc.yellow('Type:')} ${pc.green(typeStr)}  ${pc.yellow('Dims:')} ${pc.green(dimsStr)}`);
        }

        if (config.printStats && typeof data[0] === 'number') {
            const flatNums = (is2D ? (data as number[][]).flat() : data as number[])
                .filter(n => typeof n === 'number');
            if (flatNums.length > 0) {
                const stats = {
                    min: Math.min(...flatNums),
                    max: Math.max(...flatNums),
                    sum: flatNums.reduce((a, b) => a + b, 0),
                };
                console.log(
                    `${pc.yellow('Stats:')} ${pc.gray('min=')}${stats.min} ` +
                    `${pc.gray('max=')}${stats.max} ${pc.gray('sum=')}${stats.sum}`
                );
            }
        }

        if (config.printDims) {
            const dims = is2D
                ? `${data.length}${config.separator}${(data[0] as any[]).length}`
                : `${data.length}`;
            console.log(pc.magenta(dims));
        }

        if (is2D) {
            const matrix = displayData as any[][];
            const colWidths = Array(matrix[0]?.length || 0).fill(0);

            for (const row of matrix) {
                for (let i = 0; i < row.length; i++) {
                    const cellStr = String(row[i] ?? '');
                    if (cellStr.length > colWidths[i]) {
                        colWidths[i] = cellStr.length;
                    }
                }
            }

            matrix.forEach(row => {
                const rowStr = row
                    .map((cell, i) => String(cell ?? '').padEnd(colWidths[i], ' '))
                    .join(config.separator);
                console.log(rowStr);
            });
        } else {
            console.log(displayData.join(config.separator));
        }

        if (isTruncated) {
            console.log(pc.gray(`... (truncated, ${data.length - config.truncate} more items)`));
        }

        console.log(pc.gray('------------------------------------'));
    };
}
