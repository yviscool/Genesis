# Genesis AI Contract

This file is the authoritative API contract for AI-generated `maker.ts`.

## Required shape

`maker.ts` must:

- import from `genesis-kit`
- `export default defineDataset<Input>({...})`
- define `solution`
- define `seed`
- define `format`
- define `cases`
- usually define `validate`

## Allowed dataset fields

```ts
defineDataset<Input>({
  solution: 'std.cpp',
  outputDir?: 'data',
  seed: 'fixed-seed',
  startFrom?: 1,
  runTimeoutMs?: 5000,
  caseConcurrency?: number,
  compiler?: string,
  compilerFlags?: string[],
  ojProfile?: 'auto' | 'linux' | 'windows' | 'none',
  stackSizeBytes?: number,
  manifestPath?: 'data.manifest.json' | false,
  format: (input) => fmt.line(...) | fmt.lines(...) | fmt.table(...) | fmt.grid(...) | fmt.raw(...),
  validate?: (input, context) => true | false | string | { ok: boolean, reason?: string },
  cases: [
    { name: 'sample', input: { ... } },
    { name: 'random', repeat?: 1, generate: ({ g, caseIndex, caseNumber, caseName, repeatIndex, seed }) => ({ ... }) },
  ],
});
```

## Case rules

- Static case: `{ name, input }`
- Generated case: `{ name, generate, repeat? }`
- `repeat` is allowed only on generated cases
- Do not use `output` in cases

## Format API

Allowed:

- `fmt.line(...items)`
- `fmt.lines(...rows)`
- `fmt.table(rows)`
- `fmt.grid(rows)`
- `fmt.raw(text)`

Notes:

- `format()` must return a Genesis v2 format object created with `fmt.*`
- Do not use legacy tagged-template syntax like `fmt\`...\``

## Generator API

Available `g` methods include:

- `g.int(min, max)`
- `g.ints(count, min, max)`
- `g.distinctInts(count, min, max)`
- `g.float(min, max, precision)`
- `g.even(min, max)`
- `g.odd(min, max)`
- `g.prime(min, max)`
- `g.coprime(min, max)`
- `g.divisible(min, max, d)`
- `g.sequence(options)`
- `g.string(len, charset)`
- `g.word(minLen, maxLen)`
- `g.words(count, minLen, maxLen)`
- `g.array(count, fn)`
- `g.sorted(count, min, max, options)`
- `g.sparse(count, min, max, gap)`
- `g.partition(count, sum, options)`
- `g.matrix(rows, cols, fn)`
- `g.grid01(rows, cols, density)`
- `g.maze(rows, cols, options)`
- `g.intervals(n, min, max, options)`
- `g.permutation(n, oneBased?)`
- `g.shuffle(array)`
- `g.sample(array, k?)`
- `g.chunk(array, size)`
- `g.tree(n, options)`
- `g.graph(n, m, options)`
- `g.points(n, minVal, maxVal, options)`
- `g.convexHull(n, minVal, maxVal)`
- `g.polygon(n, minVal, maxVal)`
- `g.binaryTree(n, options)`
- `g.year(minYear, maxYear)`
- `g.date(options)`

Not available:

- `g.pick(...)`

Use only methods listed above or standard TypeScript/JavaScript.

## Validation

Use `validate()` for problem constraints:

- range checks
- length checks
- uniqueness checks
- structural legality checks

## Output policy

- The generator writes `.in` and `.out` by running the reference solution
- `maker.ts` must describe inputs only
- Never hardcode output files or per-case output text in `maker.ts`

## Good minimal example

```ts
import { defineDataset, fmt } from 'genesis-kit';

type Input = {
  n: number;
  a: number[];
};

export default defineDataset<Input>({
  solution: 'std.cpp',
  outputDir: 'data',
  manifestPath: 'data.manifest.json',
  seed: 'fixed-seed',
  format: ({ n, a }) => fmt.lines(
    [n],
    a,
  ),
  validate: ({ n, a }) =>
    a.length === n || 'a.length must equal n',
  cases: [
    { name: 'sample', input: { n: 3, a: [1, 2, 3] } },
    {
      name: 'random-small',
      repeat: 2,
      generate: ({ g }) => {
        const n = g.int(1, 10);
        return { n, a: g.array(n, () => g.int(1, 100)) };
      },
    },
  ],
});
```
