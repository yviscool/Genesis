// src/generator/datetime.ts
// 日期时间生成模块 — 静态导出

import * as core from './core';

// ============ 静态导出函数 ============

export function isLeap(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function year(minYear = 1970, maxYear = new Date().getFullYear()): number {
    return core.int(minYear, maxYear);
}

export function date(options: { minYear?: number; maxYear?: number; format?: string } = {}): string {
    const { minYear = 1970, maxYear = new Date().getFullYear(), format = 'YYYY-MM-DD' } = options;
    const y = year(minYear, maxYear);
    const month = core.int(1, 12);
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (isLeap(y)) days[1] = 29;
    const day = core.int(1, days[month - 1]!);
    return format
        .replace('YYYY', String(y))
        .replace('MM', String(month).padStart(2, '0'))
        .replace('DD', String(day).padStart(2, '0'));
}
