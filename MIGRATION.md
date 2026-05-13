# Migration To Genesis v2

Genesis v2 is intentionally not source-compatible with v1. The migration is a rewrite of dataset scripts into a default-exported object.

## Old Shape

```ts
Maker
  .configure({ outputDir: 'data' })
  .case('sample', () => [[1, 2]])
  .generate();
```

## New Shape

```ts
import { defineDataset, fmt } from 'genesis-kit';

export default defineDataset({
  solution: 'std.cpp',
  outputDir: 'data',
  seed: 20260505,
  format: ({ a, b }) => fmt.line(a, b),
  cases: [
    { name: 'sample', input: { a: 1, b: 2 } },
  ],
});
```

## Required Changes

- Replace `Maker` scripts with `export default defineDataset(...)`.
- Replace implicit array formatting with `fmt.line`, `fmt.lines`, `fmt.table`, `fmt.grid`, or `fmt.raw`.
- Move random generation into `generate({ g })`; do not use process-global randomness.
- Add a stable `seed`.
- Use `validate` for constraints that should fail before writing case artifacts.
- Run `genesis validate` before `genesis make`.
- Use `genesis replay --case <number>` or `--name <name> --repeat <index>` to reproduce a single case.

## Removed Surface

`Maker`, `Checker`, legacy formatter helpers, and the differ are not part of the v2 public API. Existing v1 scripts should stay pinned to a v1 release until migrated.
