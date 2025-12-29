// src/generator/debug.ts
// 调试工具模块 — 静态导出

import pc from 'picocolors';
import type { DebugOptions } from '../types';

// debug 函数直接导出
export function debug<T>(data: T, options?: DebugOptions): void;
export function debug<T>(label: string, data: T, options?: DebugOptions): void;
export function debug<T>(
    labelOrData: string | T,
    dataOrOptions?: T | DebugOptions,
    options?: DebugOptions
): void {
    let label: string | null = null;
    let data: T;
    let config: Required<Omit<DebugOptions, 'colors'>> & { colors: boolean };

    const defaults = {
        separator: ' ',
        printDims: false,
        printType: true,
        printStats: false,
        truncate: 50,
        colors: true,
    };

    if (typeof labelOrData === 'string') {
        label = labelOrData;
        data = dataOrOptions as T;
        config = { ...defaults, ...options };
    } else {
        data = labelOrData as T;
        config = { ...defaults, ...(dataOrOptions as DebugOptions) };
    }

    // 条件颜色函数：当 colors=false 时返回原字符串
    const c = config.colors
        ? { bold: pc.bold, cyan: pc.cyan, gray: pc.gray, magenta: pc.magenta, yellow: pc.yellow, green: pc.green }
        : { bold: (s: string) => s, cyan: (s: string) => s, gray: (s: string) => s, magenta: (s: string) => s, yellow: (s: string) => s, green: (s: string) => s };

    console.log(c.bold(c.cyan(`---[ ${label || 'Genesis Debug'} ]`)) + c.gray(' ---'));

    if (data === null || data === undefined) {
        console.log(c.magenta(String(data)));
        console.log(c.gray('------------------------------------'));
        return;
    }

    if (!Array.isArray(data)) {
        if (config.printType) {
            console.log(`${c.yellow('Type:')} ${c.green(typeof data)}`);
        }
        console.log(data);
        console.log(c.gray('------------------------------------'));
        return;
    }

    if (data.length === 0) {
        console.log(c.yellow('Type:') + c.green(' Array (empty)'));
        console.log('[]');
        console.log(c.gray('------------------------------------'));
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
        console.log(`${c.yellow('Type:')} ${c.green(typeStr)}  ${c.yellow('Dims:')} ${c.green(dimsStr)}`);
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
                `${c.yellow('Stats:')} ${c.gray('min=')}${stats.min} ` +
                `${c.gray('max=')}${stats.max} ${c.gray('sum=')}${stats.sum}`
            );
        }
    }

    if (config.printDims) {
        const dims = is2D
            ? `${data.length}${config.separator}${(data[0] as any[]).length}`
            : `${data.length}`;
        console.log(c.magenta(dims));
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
        console.log(c.gray(`... (truncated, ${data.length - config.truncate} more items)`));
    }

    console.log(c.gray('------------------------------------'));
}
