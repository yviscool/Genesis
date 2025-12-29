// src/generator/base.ts
// 进制转换模块 — 静态导出

import * as core from './core';
import { CHARSET, string } from './strings';

// ============ 静态导出函数 ============

export function convert(input: string | number | bigint, fromRadix: number, toRadix: number): string {
    if (fromRadix < 2 || fromRadix > 36 || toRadix < 2 || toRadix > 36) {
        throw new Error(`Radix must be an integer between 2 and 36. Received: from=${fromRadix}, to=${toRadix}`);
    }
    const inputStr = String(input);
    let val: bigint;
    try {
        if (fromRadix === 10) {
            val = BigInt(inputStr);
        } else {
            val = BigInt(0);
            for (const c of inputStr.toUpperCase()) {
                const d = CHARSET.BASE36.indexOf(c);
                if (d === -1 || d >= fromRadix) throw new Error();
                val = val * BigInt(fromRadix) + BigInt(d);
            }
        }
    } catch {
        throw new Error(`Input "${inputStr}" contains invalid characters for base ${fromRadix}.`);
    }
    if (val === BigInt(0)) return '0';
    let result = '';
    while (val > 0) {
        result = CHARSET.BASE36[Number(val % BigInt(toRadix))] + result;
        val = val / BigInt(toRadix);
    }
    return result;
}

export function binToHex(s: string): string {
    return convert(s, 2, 16);
}

export function hexToBin(s: string): string {
    return convert(s, 16, 2);
}

export function digits(len: number, radix: number): string {
    if (len <= 0) return '';
    if (radix < 2 || radix > 36) {
        throw new Error(`Radix must be an integer between 2 and 36. Received: ${radix}`);
    }
    const cs = CHARSET.BASE36.slice(0, radix);
    if (len === 1) return core.sample(cs.split(''));
    return core.sample(cs.replace('0', '').split('')) + string(len - 1, cs);
}

// 导出完整的 base 对象供 index.ts 使用
export const base = { convert, binToHex, hexToBin, digits };
