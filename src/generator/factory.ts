import crypto from 'node:crypto';
import { G } from './index';
import { runWithRng, type RandomSource } from './core';
import type { IGenerator } from './types';

export type SeedInput = string | number | bigint;
export type DatasetGenerator = Omit<IGenerator, 'withRng' | 'resetRng'>;

export function createGenerator(seedOrRng: SeedInput | RandomSource): DatasetGenerator {
  const rng = typeof seedOrRng === 'function' ? seedOrRng : createSeededRng(seedOrRng);
  const scoped = <T>(callback: () => T): T => runWithRng(rng, callback);

  return {
    CHARSET: G.CHARSET,

    int: (min, max) => scoped(() => G.int(min, max)),
    ints: (count, min, max) => scoped(() => G.ints(count, min, max)),
    distinctInts: (count, min, max) => scoped(() => G.distinctInts(count, min, max)),
    float: (min, max, precision) => scoped(() => G.float(min, max, precision)),
    even: (min, max) => scoped(() => G.even(min, max)),
    odd: (min, max) => scoped(() => G.odd(min, max)),
    prime: (min, max) => scoped(() => G.prime(min, max)),
    coprime: (min, max) => scoped(() => G.coprime(min, max)),
    divisible: (min, max, d) => scoped(() => G.divisible(min, max, d)),
    sequence: options => scoped(() => G.sequence(options)),

    string: (len, charset) => scoped(() => G.string(len, charset)),
    palindrome: (len, charset) => scoped(() => G.palindrome(len, charset)),
    word: (minLen, maxLen) => scoped(() => G.word(minLen, maxLen)),
    words: (count, minLen, maxLen) => scoped(() => G.words(count, minLen, maxLen)),
    brackets: (n, options) => scoped(() => G.brackets(n, options)),

    array: (count, itemGenerator) => scoped(() => G.array(count, itemGenerator)),
    sorted: (count, min, max, options) => scoped(() => G.sorted(count, min, max, options)),
    sparse: (count, min, max, gap) => scoped(() => G.sparse(count, min, max, gap)),
    partition: (count, sum, options) => scoped(() => G.partition(count, sum, options)),
    matrix: (rows, cols, cellGenerator) => scoped(() => G.matrix(rows, cols, cellGenerator)),
    grid01: (rows, cols, density) => scoped(() => G.grid01(rows, cols, density)),
    maze: (rows, cols, options) => scoped(() => G.maze(rows, cols, options)),
    intervals: (n, min, max, options) => scoped(() => G.intervals(n, min, max, options)),

    permutation: (n, oneBased) => scoped(() => G.permutation(n, oneBased)),
    shuffle: array => scoped(() => G.shuffle(array)),
    sample: ((population: readonly unknown[], k?: number) =>
      scoped(() => k === undefined ? G.sample(population) : G.sample(population, k))) as DatasetGenerator['sample'],
    chunk: (array, size) => G.chunk(array, size),

    tree: (n, options) => scoped(() => G.tree(n, options)),
    graph: (n, m, options) => scoped(() => G.graph(n, m, options)),

    points: (n, minVal, maxVal, options) => scoped(() => G.points(n, minVal, maxVal, options)),
    convexHull: (n, minVal, maxVal) => scoped(() => G.convexHull(n, minVal, maxVal)),
    polygon: (n, minVal, maxVal) => scoped(() => G.polygon(n, minVal, maxVal)),
    binaryTree: (n, options) => scoped(() => G.binaryTree(n, options)),

    isLeap: year => G.isLeap(year),
    year: (minYear, maxYear) => scoped(() => G.year(minYear, maxYear)),
    date: options => scoped(() => G.date(options)),

    base: {
      convert: (input, fromRadix, toRadix) => G.base.convert(input, fromRadix, toRadix),
      binToHex: s => G.base.binToHex(s),
      hexToBin: s => G.base.hexToBin(s),
      digits: (length, radix) => scoped(() => G.base.digits(length, radix)),
    },

    debug: ((...args: [unknown, unknown?, unknown?]) => {
      const [labelOrData, dataOrOptions, options] = args;
      if (typeof labelOrData === 'string' && args.length >= 2) {
        return G.debug(labelOrData, dataOrOptions, options as never);
      }
      return G.debug(labelOrData, dataOrOptions as never);
    }) as DatasetGenerator['debug'],
  };
}

export function createSeededRng(seed: SeedInput): RandomSource {
  const hash = crypto.createHash('sha256').update(String(seed)).digest();
  let a = hash.readUInt32LE(0);
  let b = hash.readUInt32LE(4);
  let c = hash.readUInt32LE(8);
  let d = hash.readUInt32LE(12);

  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const result = (t + d) | 0;
    c = (c + result) | 0;
    return (result >>> 0) / 4294967296;
  };
}
