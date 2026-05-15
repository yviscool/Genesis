# Genesis

Genesis is an AI-first deterministic dataset generator for algorithm competitions. v2 is intentionally breaking: the public workflow is a default-exported `defineDataset()` object, explicit `fmt.*` formatting, per-case deterministic randomness, dry validation, replay, and manifest v2.

## Install

```bash
npm install -D genesis-kit
```

## Quick Start

```bash
genesis init --lang cpp
genesis validate
genesis make
genesis replay --case 2
```

`genesis validate` never deletes `outputDir`, compiles the solution, runs the solution, or writes artifacts. `genesis make` writes `.in`, `.out`, and a manifest. `genesis replay` regenerates one selected case into `outputDir/replay` by default.

## make.ts

```ts
import { defineDataset, fmt } from 'genesis-kit';

type Input = {
  n: number;
  a: number[];
};

export default defineDataset<Input>({
  solution: 'std.cpp',
  outputDir: 'data',
  seed: 20260505,

  format: ({ n, a }) => fmt.lines(
    fmt.line(n),
    fmt.line(...a),
  ),

  validate: ({ n, a }) =>
    a.length === n || 'a.length must equal n',

  cases: [
    { name: 'sample', input: { n: 3, a: [1, 2, 3] } },
    {
      name: 'random-small',
      repeat: 5,
      generate: ({ g }) => {
        const n = g.int(1, 20);
        return { n, a: g.array(n, () => g.int(1, 1000)) };
      },
    },
  ],
});
```

## CLI

```bash
genesis validate --file make.ts
```

Loads the module default export, expands every case, materializes generated input, renders `fmt.*`, and runs `validate`.

```bash
genesis make --file make.ts
```

Cleans and recreates `outputDir`, runs the standard solution, writes numbered `.in/.out` files, and emits manifest v2.

```bash
genesis replay --file make.ts --case 7
genesis replay --file make.ts --name random-small --repeat 2 --output-dir replay
```

Replays exactly one expanded case. Case numbers use the dataset's `startFrom`; repeat indexes are zero-based.

## Manifest V2

The schema is published as `genesis-kit/manifest.schema.json`.

The manifest records:

- `tool`: package name and version.
- `dataset`: dataset module path, solution, output directory, root seed, compiler settings, manifest path.
- `execution`: run command, executable path, and execution fingerprint.
- `replay`: selected case information when replaying.
- `summary`: total, succeeded, failed, and duration.
- `cases`: case number, name, repeat index, tags, derived seed, phase timings, validation status, input/output hashes, and structured error phase.

## API Rules

- Export `export default defineDataset(...)`.
- Set a stable `seed`; do not use time-based seeds.
- Use `fmt.*`; v2 rejects legacy bare nested arrays as `format()` output.
- Use `input` for static cases and `generate` for generated cases.
- Use `repeat` only on generated cases.
- Validate constraints in `validate` before generation writes artifacts.
- Use `generate({ g })`; the per-case generator is isolated and replayable.

## Release Check

```bash
bun run release:check
```

This runs tests, builds CJS/ESM/CLI artifacts, exercises the built Node CLI through `init`, `validate`, `make`, and `replay`, verifies CJS/ESM imports, and runs `npm pack --dry-run`.
