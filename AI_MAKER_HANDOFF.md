# AI Maker Handoff

## Branch

- Active branch: `refactor/v2`

## Current Goal

Keep one simple user-facing flow:

- input: full problem statement text
- optional input: user reference solution
- output: generated reference solution when needed, generated `maker.ts`, and generated dataset files

The user should not care about internal planning, repair loops, prompt shaping, or contract maintenance.

## Current Direction

The AI path is now aligned to this principle:

- foundation: complete, stable Genesis contract
- context: full problem statement + optional reference solution + full contract
- policy: keep it out of the default AI context whenever possible

In practice this means:

- no problem-specific API subset selection in the runtime AI path
- no extracted statement highlights in the runtime AI path
- no style or strategy rules in the AI contract unless they are runtime truth
- only real API shape and minimal semantic notes stay in the contract

## User-facing entrypoint

- [examples/ai-maker.ts](examples/ai-maker.ts)

Supported usage:

```bash
bun run examples/ai-maker.ts --statement path/to/problem.md --name demo
bun run examples/ai-maker.ts --statement path/to/problem.md --solution path/to/std.cpp --name demo
type problem.md | bun run examples/ai-maker.ts --name demo
bun run examples/ai-maker.ts --statement path/to/problem.md --mock-response-file path/to/response.txt --name offline-demo
```

Environment:

- `OPENAI_API_KEY` or `ASXS_API_KEY`
- optional `OPENAI_BASE_URL`
- optional `OPENAI_MODEL`

## Files relevant to the AI path

- [examples/ai-maker.ts](examples/ai-maker.ts)
  - runtime AI workflow entrypoint
- [src/ai-contract.ts](src/ai-contract.ts)
  - current source of truth for the complete AI-facing Genesis contract
  - still includes problem-profile analysis helpers, but the runtime AI path now uses the full contract, not a per-problem subset
- [examples/ai-genesis-contract.d.ts](examples/ai-genesis-contract.d.ts)
  - checked-in snapshot of the current full AI contract
- [examples/problem.sample.md](examples/problem.sample.md)
  - tiny sample statement for local verification
- [examples/problem.sample.std.js](examples/problem.sample.std.js)
  - tiny sample reference solution for local verification

## Output behavior

Each run writes to:

- `examples/.ai-jobs/<name>/`

That directory contains:

- `problem.md`
- `genesis-contract.d.ts`
- `maker.ts`
- provided or AI-generated reference solution
- raw model responses per attempt
- generated `data/`
- generated `data.manifest.json`

Generated job directories are intentionally ignored in git.

## Internal behavior

`examples/ai-maker.ts` currently does this:

1. reads the full problem statement
2. renders the full Genesis AI contract from `src/ai-contract.ts`
3. if the user provided a solution, includes that exact source in the model context
4. asks the model for only:
   - `<<<SOLUTION_CODE>>>` when needed
   - `<<<MAKER_TS>>>`
5. runs local contract-level lint checks on `maker.ts`
6. preserves the user-facing `maker.ts`, but creates a runtime-only local variant for execution inside the repo
7. runs local Genesis validation first for a dry semantic check
8. runs local Genesis generation only after validation passes
9. if validation or generation fails, feeds structured issue records back to the model and retries

This repair loop is internal only. The user still sees one simple flow.

## Current hard constraints

These are the constraints that are intentionally still enforced because they reflect actual runtime truth or compatibility requirements:

- `maker.ts` must import only `defineDataset` and `fmt` from `genesis-kit`
- `maker.ts` must use `defineDataset(...)`
- it must define `solution`, `seed`, `format`, `cases`
- `case.output` is forbidden
- legacy ``fmt`...` `` syntax is forbidden
- `g.pick(...)` is forbidden; use `g.sample(...)`
- unsupported `fmt.*`, `g.*`, `g.base.*`, and `g.CHARSET.*` usages are rejected locally against the full contract
- the declared `solution` path must exactly match the chosen reference solution filename

These are no longer default hard constraints:

- problem-specific contract shrinking
- extracted input/output/limit highlights
- mandatory `validate`
- seed naming style
- stylistic dead-code lint such as identical-branch ternaries
- baked-in dataset strategy such as fixed case counts or "at most 2 extreme cases"
## fmt guidance status

Current judgment after direct model probing:

- `fmt.line`, `fmt.table`, `fmt.grid`, and `fmt.raw` are already understandable to the model
- the real ambiguity is `fmt.lines(...)`, because it accepts atoms, atom arrays, and nested format nodes
- therefore the repo now prefers one canonical explicit style in AI-facing examples:

```ts
fmt.lines(
  fmt.line(...),
  fmt.table(...),
  fmt.grid(...),
  fmt.raw(...),
)
```

Runtime behavior did not change. This is a contract/example presentation change only.

## Recent semantic fixes

Recent work in this branch aligned runtime and contract truth more closely:

- removed statement-highlight extraction from the runtime AI path
- switched the runtime AI path to the full contract instead of a selected subset
- clarified the AI contract semantics for:
  - `fmt.lines`
  - `fmt.grid`
  - `fmt.raw`
  - `DatasetValidationReturn`
  - `g.sequence`
  - `g.sample`
  - `g.chunk`
  - `g.sparse`
  - `g.partition`
  - `g.matrix`
  - `g.grid01`
  - `g.intervals`
  - `g.tree`
  - `g.graph`
  - `g.binaryTree`
  - `g.date`
  - `g.base.digits`
- fixed the runtime `g.binaryTree()` root semantics so `root` is now the actual root label of the generated tree

## Current verification status

Latest local verification in this workspace shows:

Passes:

```bash
bun test test/ai.contract.test.ts
bun test test/v2.format.test.ts
bun test test/generator.test.ts
```

Current blocker:

```bash
bun test test/ai-maker.mock.test.ts
```

That test is currently failing in the Bun + `execa` subprocess path with:

- `Attempted to assign to readonly property.`

Treat that as an infrastructure regression signal, not as proof that the AI contract semantics are wrong.

Notable coverage from the passing tests:

- AI contract surface is checked against runtime surface
- `fmt.lines` mixed-row semantics are locked down
- `g.sample`, `g.partition`, `g.intervals`, and `g.binaryTree` semantic tests are present

## Known design state

The current AI contract is still manually assembled in `src/ai-contract.ts`.

This is acceptable for now, but it is the next major maintenance risk:

- runtime API changes can drift away from the hand-built AI contract
- semantic notes can become stale
- maintaining both runtime types and AI contract text by hand does not scale
- local AI-path lint still depends on hand-maintained method/signature metadata, which is a second drift surface

There is also an important design boundary to preserve:

- some current AI-facing declarations are intentionally more explicit than raw runtime types
- that is acceptable only when the extra precision is runtime-true and pinned by tests
- Phase 4 should isolate those cases into an explicit semantic patch layer instead of leaving them mixed into large hand-written declaration blocks

## Next-round focus

Next round should implement phase 4:

- move from a hand-written AI contract toward a generated contract
- keep only a thin hand-maintained semantic patch layer
- make the checked-in snapshot and the local `maker.ts` lint allowlists come from the same generated metadata
- treat the contract generator as the maintenance center, not the prompt text
- either fix `test/ai-maker.mock.test.ts` or explicitly track it as a separate infrastructure blocker while phase 4 is in flight

See:

- [AI_CONTRACT_PHASE4_PLAN.md](AI_CONTRACT_PHASE4_PLAN.md)

## Historical note

- [AI_FIRST_V2_PLAN.md](AI_FIRST_V2_PLAN.md) is now a historical v2 implementation record, not the current AI-path source of truth.
