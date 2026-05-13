# Changelog

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
