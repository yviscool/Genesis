// src/generator/numbers.ts
// 数值生成模块

import type { GeneratorCore } from './core';

// 质数筛
function sievePrimes(max: number): number[] {
    if (max < 2) return [];
    const sieve = new Array(max + 1).fill(true);
    sieve[0] = sieve[1] = false;
    for (let i = 2; i * i <= max; i++) {
        if (sieve[i]) {
            for (let j = i * i; j <= max; j += i) {
                sieve[j] = false;
            }
        }
    }
    return sieve.map((isPrime, idx) => isPrime ? idx : -1).filter(x => x !== -1);
}

// GCD
function gcd(a: number, b: number): number {
    while (b !== 0) {
        [a, b] = [b, a % b];
    }
    return a;
}

export interface NumberGenerators {
    int(min: number, max: number): number;
    ints(count: number, min: number, max: number): number[];
    distinctInts(count: number, min: number, max: number): number[];
    float(min: number, max: number, precision?: number): number;
    even(min: number, max: number): number;
    odd(min: number, max: number): number;
    prime(min: number, max: number): number;
    coprime(min: number, max: number): [number, number];
    divisible(min: number, max: number, d: number): number;
}

export function createNumberGenerators(core: GeneratorCore): NumberGenerators {
    return {
        int: core.int.bind(core),

        ints(count: number, min: number, max: number): number[] {
            return Array.from({ length: count }, () => core.int(min, max));
        },

        distinctInts(count: number, min: number, max: number): number[] {
            const range = max - min + 1;
            if (count > range) {
                throw new Error(`Cannot generate ${count} distinct integers from a range of size ${range}.`);
            }
            const s = new Set<number>();
            while (s.size < count) s.add(core.int(min, max));
            return Array.from(s);
        },

        float(min: number, max: number, precision = 2): number {
            const value = Math.random() * (max - min) + min;
            return parseFloat(value.toFixed(precision));
        },

        even(min: number, max: number): number {
            const start = min % 2 === 0 ? min : min + 1;
            const end = max % 2 === 0 ? max : max - 1;
            if (start > end) throw new Error(`No even numbers exist in the range [${min}, ${max}].`);
            const numChoices = (end - start) / 2;
            return start + core.int(0, numChoices) * 2;
        },

        odd(min: number, max: number): number {
            const start = min % 2 !== 0 ? min : min + 1;
            const end = max % 2 !== 0 ? max : max - 1;
            if (start > end) throw new Error(`No odd numbers exist in the range [${min}, ${max}].`);
            const numChoices = (end - start) / 2;
            return start + core.int(0, numChoices) * 2;
        },

        prime(min: number, max: number): number {
            const primes = sievePrimes(max).filter(p => p >= min);
            if (primes.length === 0) {
                throw new Error(`No prime numbers exist in the range [${min}, ${max}].`);
            }
            return primes[core.int(0, primes.length - 1)];
        },

        coprime(min: number, max: number): [number, number] {
            for (let attempt = 0; attempt < 1000; attempt++) {
                const a = core.int(min, max);
                const b = core.int(min, max);
                if (a !== b && gcd(a, b) === 1) {
                    return [a, b];
                }
            }
            return [1, core.int(Math.max(2, min), max)];
        },

        divisible(min: number, max: number, d: number): number {
            if (d === 0) throw new Error('Divisor cannot be zero.');
            const start = Math.ceil(min / d) * d;
            const end = Math.floor(max / d) * d;
            if (start > end) {
                throw new Error(`No numbers divisible by ${d} exist in the range [${min}, ${max}].`);
            }
            const count = (end - start) / d;
            return start + core.int(0, count) * d;
        },
    };
}
