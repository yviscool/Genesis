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

---

# Migrating A Manifest From v2 To v3

Manifest v3 changes the *document*, not the dataset API — `make.ts` files do not need edits.

## What changed

| | v2 | v3 |
|---|---|---|
| Paths | absolute, machine specific (often into a deleted temp dir) | relative to the manifest file, `pathBase: "manifest"` |
| Input fingerprints | none | `sources.maker` / `sources.solution` sha256 |
| `execution` | `runArgs`, `executablePath`, opaque `fingerprint` | adds `runtime`; paths are relative; fingerprint mixes in the solution hash |
| `replay` | always `null` in practice | selected case + relative output directory |

## Migrating

A v3 manifest can be derived from a v2 one without regenerating any data:

```js
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (manifest.version === 2) {
  // 1. Rehash every case file that is still on disk, and rewrite its path relative to the manifest.
  // 2. Hash make.ts and std.py into `sources`.
  // 3. Bump `version` to 3 and add `pathBase: "manifest"`.
  // 4. Drop the absolute `dataset.outputDir` / `dataset.manifestPath` in favour of relative ones.
}
```

Two things to watch for when rehashing:

- **A file that differs only by a trailing newline is not "modified".** Pipelines that
  post-processed the generated files (for example appending `\n`) will produce a hash mismatch
  against the v2 record. Compare `sha256(content)` *and* `sha256(content minus trailing \n)`
  before reporting drift.
- **A genuine mismatch means the file was edited after generation.** Record the bytes that are
  actually on disk, but list the problem: `genesis check` can only tell you what changed since
  the last generation, not whether the data was ever correct.

## After migrating

```bash
genesis check --file make.ts    # every case must report up-to-date
genesis make --resume           # refreshes `sources` if only the maker was reformatted
```

If `genesis check` reports `source-drift` right after a migration, the maker or solution has
changed since the data was generated — run `genesis make` (without `--resume`) for that dataset.
