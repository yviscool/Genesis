// src/generator/strings.ts
// 字符串生成模块 — 静态导出

import * as core from './core';

export const CHARSET = {
    LOWERCASE: 'abcdefghijklmnopqrstuvwxyz',
    UPPERCASE: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    DIGITS: '0123456789',
    get ALPHANUMERIC() { return this.LOWERCASE + this.UPPERCASE + this.DIGITS; },
    get ALPHA() { return this.LOWERCASE + this.UPPERCASE; },
    get BASE36() { return this.DIGITS + this.UPPERCASE; },
} as const;

// ============ 静态导出函数 ============

export function string(len: number, charset = CHARSET.ALPHANUMERIC): string {
    let result = '';
    for (let i = 0; i < len; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
}

export function palindrome(len: number, charset = CHARSET.LOWERCASE): string {
    if (len <= 0) return '';
    const halfLen = Math.floor(len / 2);
    const left = string(halfLen, charset);
    const right = left.split('').reverse().join('');
    if (len % 2 === 1) {
        const mid = core.sample(charset.split(''));
        return left + mid + right;
    }
    return left + right;
}

export function word(minLen: number, maxLen: number): string {
    return string(core.int(minLen, maxLen), CHARSET.LOWERCASE);
}

export function words(count: number, minLen: number, maxLen: number): string[] {
    return Array.from({ length: count }, () => word(minLen, maxLen));
}

export function brackets(n: number, options: { types?: string } = {}): string {
    const { types = '()' } = options;
    const pairs: [string, string][] = [];
    if (types.includes('()')) pairs.push(['(', ')']);
    if (types.includes('[]')) pairs.push(['[', ']']);
    if (types.includes('{}')) pairs.push(['{', '}']);
    if (pairs.length === 0) pairs.push(['(', ')']);

    const result: string[] = [];
    const stack: [string, string][] = [];

    for (let i = 0; i < n; i++) {
        const pair = pairs[core.int(0, pairs.length - 1)];
        result.push(pair[0]);
        stack.push(pair);
    }

    while (stack.length > 0) {
        const idx = core.int(0, stack.length - 1);
        const pair = stack.splice(idx, 1)[0];
        result.push(pair[1]);
    }

    return result.join('');
}
