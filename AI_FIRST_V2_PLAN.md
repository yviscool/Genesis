# Genesis v2 AI-First Implementation Record

Date: 2026-05-05
Repository: `genesis-kit`
Status: Implemented as a breaking v2 direction.

## Final Direction

Genesis v2 is no longer a chain-style `Maker` / `Checker` tool. The canonical contract is:

```ts
export default defineDataset<Input>({
  solution: 'std.cpp',
  outputDir: 'data',
  seed: 20260505,
  format: input => fmt.lines(...),
  validate: input => true,
  cases: [
    { name: 'sample', input: ... },
    { name: 'random', repeat: 10, generate: ({ g }) => ... },
  ],
});
```

The public API is object-first, explicit, deterministic, and inspectable by both humans and AI agents.

## Implemented Foundations

- Added `defineDataset()` and v2 dataset types.
- Added explicit `fmt.line`, `fmt.lines`, `fmt.table`, `fmt.grid`, and `fmt.raw`.
- Added deterministic `createGenerator(seed)` and per-case `generate({ g })`.
- Added a v2 dataset runner with separate `validate`, `make`, and `replay` flows.
- Added default-export dataset loading for `.ts`, `.tsx`, `.mts`, `.cts`, and JS modules.
- Added module-relative resolution for dataset `solution`, `outputDir`, and `manifestPath` when loaded from a file.
- Added manifest v2 with tool version, dataset metadata, execution fingerprint, replay metadata, case seeds, phase timings, validation status, file hashes, and structured error phase.
- Removed the v1 public exports and deleted v1 Maker/Checker/formatter/differ modules and tests.
- Rewrote CLI templates and examples to teach only v2.
- Rewrote README and README.en around the v2 contract.
- Added `manifest.schema.json` as the machine-readable manifest contract.
- Added migration and changelog documents for the breaking v2 release.
- Added CI and `bun run release:check` to verify tests, build output, Node CLI behavior, CJS/ESM imports, and npm package contents.

## Review Ruling

The original API direction was accepted, but the implementation was intentionally not layered over v1 internals. The core risks were addressed directly:

- No global RNG mutation for v2 cases.
- Dry validation does not delete directories, compile solutions, run solutions, or write artifacts.
- Formatting is a real v2 document model, not a cosmetic wrapper over legacy nested arrays.
- CLI loading is based on a default-exported dataset object.
- Manifest v2 is explicit and versioned.

## Operating Rules For Future Work

- Do not reintroduce chain-style public APIs.
- Do not reintroduce implicit nested-array formatting as a `format()` return value.
- Keep `validate` side-effect free.
- Keep case generation deterministic and replayable.
- Keep paths loaded from dataset modules relative to the dataset module directory.
- Treat manifest v2 as the durable machine-readable contract.
- Gate releases on `bun run release:check`.
