# Changelog

## 2.1.0 - 2026-11-18

Formatting and validation ergonomics, a portable manifest, drift detection, and a toolchain swap.

### Manifest v3

- **Every path is now relative to the manifest file** (`pathBase: "manifest"`). v2 stored
  absolute paths — and, in the common "generate into a temp dir, copy back" flow, paths into a
  directory that had already been deleted. A manifest is now readable on any machine.
- **`sources` records the sha256 of the maker module and the standard solution.** This is what
  makes `genesis check` possible: v2's `execution.fingerprint` described the temp directory, not
  the inputs, so a change to `make.ts` could not be detected without regenerating everything.
- `execution` gained `runtime` and now stores relative `runArgs` / `executablePath`.
- `replay` is populated with the selected case and a relative output directory.
- `execution.fingerprint` now mixes in the solution hash, so it changes when `std.py` changes.
- `manifest.schema.json` updated to v3.

### New: `genesis check`

- Read-only drift report: source fingerprints, per-case `.in` / `.out` sha256, case count, and
  orphaned numbered files. Exits non-zero when the data is stale.
- On a 327-problem corpus this answers "what went stale?" in 49s instead of regenerating 2.1 GiB.

### New: case selection, resume and prune

- `genesis make --only <spec>` — case numbers, ranges (`3-5`) and case names, comma separated.
- `genesis make --from <n> --to <n> --jobs <n>`.
- `genesis make --resume` — skips cases whose artifacts still match the manifest. Automatically
  invalidated when the maker module or the solution changed, so it can never bless stale data.
- `genesis make --prune` — deletes numbered `.in` / `.out` files that no declared case owns.
  Pruning is always evaluated against every declared case, never the selected subset.
- Partial runs no longer wipe `outputDir` and still emit a complete manifest: untouched cases are
  carried over from the previous manifest.
- `DatasetRunResult.executed` reports what this invocation actually did (`totalCases`,
  `succeeded`, `failed`, `skipped`) separately from `summary`, which describes the manifest.

### New: `genesis lint` (AST)

- Replaced the regex-based contract check with an `oxc-parser` walk that resolves what an
  identifier refers to. `g` is only the injected generator inside a `generate` callback, so
  `format: ({ n, m, g }) => g.join(' ')` is no longer reported as "g.join is not part of the
  contract" — that false positive had forced real makers to rename their field to `g: greed`.
- Computed member access (`g['pick']()`) is now caught; the regex could not see it.
- Issues carry `line` / `column`.
- `lintDatasetConfig` keeps the runtime object-shape checks (solution name, required keys,
  forbidden `output` in cases) next to the source lint.

### Formatting and validation

- Added `fmt.seq(nodes, sep)` and `fmt.block(...nodes)` so records can be separated by a blank line
  without dropping to `fmt.raw`. This was the most common reason makers hand-built strings.
- Added `fmt.rows(rows, { header })` for the "header line + matrix" shape, `fmt.flat(values)`,
  `fmt.join(sep, ...items)` and `fmt.tuple(...items)`.
- `FormatLine` and `FormatTable` now accept `sep` / `rowSep`, so `fmt.table(rows, { sep: '' })`
  renders grids without inner separators.
- Added `constraints` to `DatasetConfig`: declarative per-field checks (`int` `min` `max` `ref`
  `eq` `len` `minLen` `maxLen` `oneOf`) with wildcard paths like `edges[*][0]`. Evaluated before
  `validate`; violations report the resolved path and the bound.
- Added `ensureTrailingNewline` run option for judges that require a final newline; off by default.

### Toolchain

- `build:ai-contract` now parses the TypeScript source with `oxc-parser` instead of the
  `typescript` compiler API. `typescript` was never declared in package.json (it only resolved
  through tsdown's hoisting), so this also removes an undeclared dependency. The test suite drops
  from ~21s to ~7s because no TypeScript program is constructed.
- Replaced the `@typescript/native-preview` peer dependency with `tsrs` as a dev dependency and
  added `typecheck` / `typecheck:fast` scripts.
- Fixed two type errors surfaced by the new typecheck: `replayManifestPath` widened to
  `string | boolean`, and the `createReadStream` data callback typed `Buffer` only.
- `tsconfig.json` now declares `"types": ["bun", "node"]` explicitly.

## 2.0.0 - 2026-05-05

Genesis v2 is a breaking AI-first rewrite.

- Replaced the v1 chain API with the object-first `defineDataset()` contract.
- Added explicit `fmt.*` formatting nodes and rejected legacy implicit nested-array `format()` returns.
- Added deterministic per-case generator instances through `generate({ g })`.
- Added dry validation with `genesis validate`.
- Added single-case replay with `genesis replay`.
- Added manifest v2 and `manifest.schema.json`.
- Added Node/Bun-compatible default-export dataset loading.
- Removed v1 `Maker`, `Checker`, formatter, differ, and related tests from the public surface.
- Rebuilt templates, examples, and documentation around v2 only.
