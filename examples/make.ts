import { defineDataset, fmt } from 'genesis-kit';

type Input = {
  n: number;
  k: number;
  a: number[];
};

const MAX_A = 1_000_000_000;

export default defineDataset<Input>({
  solution: 'std.cpp',
  outputDir: 'data',
  seed: 'genesis-v2-example-threshold-doubling',
  runTimeoutMs: 5000,

  format: ({ n, k, a }) => fmt.lines(
    [n, k],
    a,
  ),

  validate: ({ n, k, a }) => {
    if (!Number.isInteger(n) || n < 1 || n > 1000) return 'n must be in [1, 1000]';
    if (!Number.isInteger(k) || k < 1 || k > MAX_A) return 'k must be in [1, 1e9]';
    if (a.length !== n) return 'a.length must equal n';
    return a.every(value => Number.isInteger(value) && value >= 1 && value <= MAX_A)
      || 'each a[i] must be in [1, 1e9]';
  },

  cases: [
    {
      name: 'min-boundary',
      input: { n: 1, k: 1, a: [1] },
    },
    {
      name: 'sample-style',
      input: { n: 4, k: 20, a: [3, 5, 20, 21] },
    },
    {
      name: 'all-greater-than-k',
      input: {
        n: 8,
        k: 100,
        a: [101, 150, 200, 999, 1000, 123456, 999999999, MAX_A],
      },
    },
    {
      name: 'mixed-near-threshold',
      input: {
        n: 12,
        k: 1000,
        a: [1, 2, 3, 7, 8, 15, 16, 31, 32, 500, 999, 1000],
      },
    },
    {
      name: 'random-small',
      repeat: 8,
      generate: ({ g }) => {
        const n = g.int(1, 30);
        const k = g.int(1, 10_000);
        return {
          n,
          k,
          a: g.array(n, () => g.int(1, 10_000)),
        };
      },
    },
    {
      name: 'max-random',
      repeat: 4,
      generate: ({ g }) => {
        const n = 1000;
        return {
          n,
          k: MAX_A,
          a: g.array(n, () => g.int(1, MAX_A)),
        };
      },
    },
  ],
});
