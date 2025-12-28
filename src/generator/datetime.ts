// src/generator/datetime.ts
// 日期时间生成模块

import type { GeneratorCore } from './core';

export interface DateTimeGenerators {
    isLeap(year: number): boolean;
    year(minYear?: number, maxYear?: number): number;
    date(options?: { minYear?: number; maxYear?: number; format?: string }): string;
}

export function createDateTimeGenerators(core: GeneratorCore): DateTimeGenerators {
    const generators: DateTimeGenerators = {
        isLeap(year: number): boolean {
            return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        },

        year(minYear = 1970, maxYear = new Date().getFullYear()): number {
            return core.int(minYear, maxYear);
        },

        date(options: { minYear?: number; maxYear?: number; format?: string } = {}): string {
            const { minYear = 1970, maxYear = new Date().getFullYear(), format = 'YYYY-MM-DD' } = options;
            const year = generators.year(minYear, maxYear);
            const month = core.int(1, 12);
            const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            if (generators.isLeap(year)) days[1] = 29;
            const day = core.int(1, days[month - 1]!);
            return format
                .replace('YYYY', String(year))
                .replace('MM', String(month).padStart(2, '0'))
                .replace('DD', String(day).padStart(2, '0'));
        },
    };

    return generators;
}
