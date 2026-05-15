# AI Contract Phase 4 Plan

## Purpose

Phase 4 is a contract-maintenance project.

The goal is not "better prompts".
The goal is:

- runtime truth -> contract truth -> AI context

with one durable source of truth and as little manual duplication as possible.

## Current decision summary

Phase 4 should be executed under these decisions:

- the AI contract snapshot and the local `maker.ts` lint allowlists must come from the same generated source
- the public type-and-shape skeleton should come from real emitted declarations, not from hand-written mirrored strings
- hand-maintained content is allowed only as a thin semantic patch layer
- semantic patches may clarify runtime truth, but must not invent new API surface or reintroduce prompt policy

## Current problems to solve

Today the remaining drift risk is no longer just the checked-in snapshot.

There are still multiple manual surfaces:

- the contract declaration text in [src/ai-contract.ts](src/ai-contract.ts)
- the method/signature dictionaries consumed by local AI-path lint
- the checked-in snapshot:
  - [examples/ai-genesis-contract.d.ts](examples/ai-genesis-contract.d.ts)

That creates three concrete risks:

- runtime API changes can drift away from the AI contract text
- local lint can drift away from both runtime truth and the checked-in snapshot
- tests can stay green while signatures or narrowed return shapes quietly become stale

## Phase 4 goal

Turn the AI contract system into:

1. generated public skeleton from real runtime declarations
2. small, explicit semantic patch registry
3. generated checked-in snapshot for inspection
4. generated metadata reused by local AI-path lint

## Non-goals

Phase 4 should not:

- redesign the user-facing AI workflow
- add new prompt policy
- reintroduce problem-specific contract shrinking
- add style rules back into the AI contract
- expand the AI contract into a tutorial
- keep a second hand-maintained signature table "just for lint"

## Truth sources

### Shape truth

Preferred source:

- a freshly emitted public declaration output from `src/index.ts`

Acceptable implementation:

- invoke a dedicated declaration emit inside the contract build step
- or read a freshly rebuilt [dist/index.d.ts](dist/index.d.ts)

Avoid:

- reading a stale checked-in `dist/index.d.ts` without rebuilding
- retyping public declarations into hand-built string blocks

### Type source files

These remain the code-level truth behind the declaration output:

- [src/dataset.ts](src/dataset.ts)
- [src/format.ts](src/format.ts)
- [src/generator/types.ts](src/generator/types.ts)
- [src/generator/factory.ts](src/generator/factory.ts)
- [src/types.ts](src/types.ts)
- [src/index.ts](src/index.ts)

### Semantic truth

Behavior-level truth comes from:

- generator implementations under `src/generator/`
- [src/dataset-runner.ts](src/dataset-runner.ts)
- semantic regression tests under `test/`

## Desired architecture

### Layer 1: generated public skeleton

Generate a skeleton that covers the AI-facing public surface:

- `defineDataset`
- dataset-related interfaces and types
- `fmt.*`
- `DatasetGenerator`
- `g.base.*`
- `g.CHARSET.*`

This layer should be mechanically derived from emitted runtime declarations.

### Layer 2: semantic patch registry

Keep one small hand-maintained patch registry for semantics the type system does not express well enough.

Allowed patch categories:

- runtime-true semantic notes
- AI-facing clarifications of overloaded or ambiguous behavior
- AI-friendly return narrowing when it is defensible from runtime behavior and pinned by tests
- canonical pattern comments

Forbidden patch categories:

- invented API members
- prompt policy
- style preferences that are not runtime truth
- problem-specific API filtering

Examples that belong in this layer:

- `fmt.lines` mixed atom / atom-array / nested-node semantics
- `fmt.grid` rows have no internal separator
- `fmt.raw` is emitted exactly as provided
- `DatasetValidationReturn` meaning of `void / true / false / string / { ok, reason }`
- `g.sample(population, k)` is without replacement
- `g.partition` and `g.sparse` do not promise returned order
- `g.intervals(..., sorted: false)` does not promise returned order
- `g.binaryTree().root` is the actual generated root label
- `g.date` currently supports `YYYY`, `MM`, `DD`
- `g.base.digits(length > 1)` does not start with `0`

### Layer 3: generated shared metadata

Generate metadata that can be reused by both rendering and lint:

- fmt method names
- generator method names
- `g.base` method names
- `g.CHARSET` property names
- normalized declaration/signature blocks for AI-facing exports

This removes the need for a separate hand-maintained allowlist path.

### Layer 4: generated checked-in snapshot

Generate:

- [examples/ai-genesis-contract.d.ts](examples/ai-genesis-contract.d.ts)

This remains the inspectable artifact for humans and tests, but it should be generated, not edited by hand.

## Recommended implementation path

### Step 0

Acknowledge the current test blocker before using it as a gate:

- [test/ai-maker.mock.test.ts](test/ai-maker.mock.test.ts) currently fails in the local Bun + `execa` path with `Attempted to assign to readonly property.`

Phase 4 should either:

- fix this test path first
- or explicitly treat it as an infrastructure blocker rather than a contract regression signal

### Step 1

Introduce a generator script, for example:

- `scripts/build-ai-contract.mjs`

Responsibilities:

- trigger or consume a fresh declaration emit for the public package surface
- extract the AI-relevant public declarations
- build normalized generated metadata
- merge semantic patch text
- write the final snapshot file

### Step 2

Refactor [src/ai-contract.ts](src/ai-contract.ts) into a small composition layer:

- keep statement-profile analysis there
- keep canonical pattern comments there if still useful
- remove large hand-built declaration blocks where practical
- consume generated metadata instead of maintaining a second mirrored signature table

### Step 3

Route local AI-path lint to the same generated metadata.

This matters for:

- supported `fmt.*`
- supported `g.*`
- supported `g.base.*`
- supported `g.CHARSET.*`

If the snapshot says one thing and lint says another, Phase 4 has failed.

### Step 4

Regenerate the checked-in snapshot and make generation reproducible.

The committed contract file should be an output artifact, not an editing target.

## Testing requirements for phase 4

### Structure alignment tests

Must ensure:

- contract `fmt` surface matches runtime `fmt`
- contract generator method surface matches runtime `DatasetGenerator`
- contract `base` surface matches runtime `g.base`
- contract `CHARSET` surface matches runtime `g.CHARSET`

### Signature alignment tests

Must ensure:

- generated declaration signatures are derived from the public declaration source, not manually retyped
- any AI-friendly narrowing is explicit and isolated in the semantic patch layer
- no hidden hand-maintained signature table exists outside the generator path

### Semantic patch tests

Must ensure the semantic notes and any approved AI-friendly narrowing still reflect runtime truth for:

- `fmt.lines`
- `fmt.grid`
- `fmt.raw`
- `DatasetValidationReturn`
- `g.sample`
- `g.partition`
- `g.sparse`
- `g.intervals`
- `g.binaryTree`
- `g.date`
- `g.base.digits`

### Lint source-of-truth tests

Must ensure:

- local `maker.ts` lint allowlists are derived from the same generated metadata as the snapshot
- unsupported API detection still works after the refactor

### Snapshot test

Must ensure:

- generated snapshot equals the current committed snapshot

### Pipeline regression tests

Must ensure:

- `test/ai.contract.test.ts` passes
- `test/v2.format.test.ts` passes
- `test/generator.test.ts` passes
- `test/ai-maker.mock.test.ts` is either fixed and green or clearly documented as an external blocker

## What to keep manual

Do not try to automate everything at once.

It is acceptable to keep manual:

- short semantic notes
- canonical pattern comments
- a very small amount of AI-focused wording

It is not acceptable to keep manual:

- duplicate signature tables for snapshot vs lint
- duplicate public declaration blocks copied from runtime types

## Completion criteria

Phase 4 is done when:

1. runtime API changes require touching one truth source, not multiple mirrored declaration blocks
2. [examples/ai-genesis-contract.d.ts](examples/ai-genesis-contract.d.ts) is generated reproducibly
3. local AI-path lint derives its allowlists from the same generated metadata as the snapshot
4. the AI contract contains runtime truth plus only a thin semantic patch layer
5. structure, signature, snapshot, and semantic tests all pass
6. the `ai-maker` mock regression path is either green again or explicitly tracked as a separate infrastructure blocker

## Suggested execution order

1. Decide and document the declaration source used by the generator
2. Triage the current `ai-maker.mock.test.ts` failure so it does not blur contract work
3. Build the contract generator script
4. Extract and isolate semantic patch data
5. Generate shared metadata for both snapshot and lint
6. Refactor `src/ai-contract.ts` into a thin composition layer
7. Regenerate [examples/ai-genesis-contract.d.ts](examples/ai-genesis-contract.d.ts)
8. Strengthen tests
9. Run:

```bash
bun test test/ai.contract.test.ts
bun test test/v2.format.test.ts
bun test test/generator.test.ts
bun test test/ai-maker.mock.test.ts
```

## Handoff note

Phase 4 should be treated as a contract-maintenance project, not a prompt project.

If a tradeoff appears between:

- making the contract prettier
- making the contract closer to runtime truth

choose runtime truth.

If a tradeoff appears between:

- keeping a small explicit semantic patch layer
- hiding AI-friendly deviations inside hand-written declarations

choose the explicit patch layer.
