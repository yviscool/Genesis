# Genesis

Genesis is an AI-first deterministic dataset generator for algorithm competitions. v2 is intentionally breaking: the public workflow is a default-exported `defineDataset()` object, explicit `fmt.*` formatting, per-case deterministic randomness, dry validation, replay, and a portable manifest.

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

Cleans and recreates `outputDir`, runs the standard solution, writes numbered `.in/.out` files, and emits a manifest.

```bash
genesis make --only 3 --prune          # regenerate case 3 only, drop retired numbered files
genesis make --only 2,5-7,sample       # numbers, ranges and case names
genesis make --from 10 --to 20 --jobs 4
genesis make --resume                  # skip cases whose artifacts still match the manifest
```

Partial runs never wipe `outputDir` and still emit a complete manifest: cases this run did not
touch are carried over from the previous manifest.

| Option | Effect |
|---|---|
| `--only <spec>` | Case numbers, ranges (`3-5`) and case names, comma separated |
| `--from` / `--to` | Inclusive case-number bounds |
| `--resume` | Skip cases whose artifacts match the manifest; invalidated automatically when the maker or the solution changed |
| `--prune` | Delete numbered `.in` / `.out` files that no declared case owns |
| `--jobs <n>` | Override `caseConcurrency` |

```bash
genesis check
```

Read-only. Compares the recorded `maker` / `std` fingerprints, every case file's sha256, the case
count and orphaned numbered files, then prints a structured drift report. A non-zero exit means
the data is stale — **changing one line of `make.ts` no longer requires regenerating everything**.

```bash
genesis lint
genesis lint --all testdata
```

AST-level contract check built on `oxc-parser`. `g` is only the injected generator inside a
`generate` callback, so `format: ({ n, m, g }) => g.join(' ')` is not mistaken for a contract
violation. Issues carry `file:line:column`.

```bash
genesis replay --file make.ts --case 7
genesis replay --file make.ts --name random-small --repeat 2 --output-dir replay
```

Replays exactly one expanded case. Case numbers use the dataset's `startFrom`; repeat indexes are zero-based.

## Manifest V3

The schema is published as `genesis-kit/manifest.schema.json`.

```jsonc
{
  "version": 3,
  "pathBase": "manifest",          // every path below is relative to the manifest itself
  "dataset": { "modulePath": "make.ts", "solution": "std.py", "outputDir": ".", "manifestPath": "genesis-manifest.json" },
  "sources": {
    "maker":    { "path": "make.ts", "sha256": "…", "bytes": 3854 },
    "solution": { "path": "std.py",  "sha256": "…", "bytes": 1204 }
  },
  "execution": { "runtime": "python3", "runArgs": ["python3", "std.py"], "executablePath": "std.py", "fingerprint": "…" },
  "replay": null,
  "summary": { "totalCases": 12, "succeeded": 12, "failed": 0, "durationMs": 1951 },
  "cases": [ /* number, name, seed, timings, validation status, file sha256, structured error */ ]
}
```

Three changes from v2, each fixing a real failure:

- **Portable paths.** v2 stored absolute paths — and, in the common "generate into a temp dir,
  copy back" flow, paths into a directory that had already been deleted.
- **`sources` fingerprints.** v2 had only an opaque `execution.fingerprint` that described the temp
  directory, so a change to `make.ts` could not be detected without regenerating everything.
- **`replay` is populated** with the selected case and a relative output directory.

See `MIGRATION.md` for the v2 → v3 manifest migration.

## API Rules

- Export `export default defineDataset(...)`.
- Set a stable `seed`; do not use time-based seeds.
- Use `fmt.*`; v2 rejects legacy bare nested arrays as `format()` output.
- Use `input` for static cases and `generate` for generated cases.
- Use `repeat` only on generated cases.
- Prefer declarative `constraints` for per-field bounds; keep `validate` for cross-field semantics.
- Use `generate({ g })`; the per-case generator is isolated and replayable. `g` is only the
  generator inside that callback — a `g` destructured by `format` / `validate` is your own data.

## Release Check

```bash
bun run release:check
```

This runs tests, builds CJS/ESM/CLI artifacts, exercises the built Node CLI through `init`, `validate`, `make`, and `replay`, verifies CJS/ESM imports, and runs `npm pack --dry-run`.
