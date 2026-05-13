# AI Maker Handoff

## Branch

- Active branch: `v2`

## Goal

Provide one user-facing flow:

- input: problem statement text
- optional input: user reference solution
- output: generated reference solution when needed, generated `maker.ts`, and generated dataset files

The user should not need to care about internal planning, repair loops, or prompt structure.

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

## Files added for AI context

- [src/ai-contract.ts](src/ai-contract.ts)
  - source of truth for the AI-safe contract used at runtime
  - selects a small problem-specific API subset from the statement's input structure
  - shared by the prompt builder, lint rules, and tests
- [examples/ai-genesis-contract.d.ts](examples/ai-genesis-contract.d.ts)
  - checked-in declaration snapshot of the default minimal contract
  - useful for inspection and review, but runtime prompt text comes from code and is usually problem-specific
- [examples/problem.sample.md](examples/problem.sample.md)
  - tiny sample statement used for local verification
- [examples/problem.sample.std.js](examples/problem.sample.std.js)
  - tiny sample reference solution used for local verification

## Output behavior

Each run writes to:

- `examples/.ai-jobs/<name>/`

That directory contains:

- `problem.md`
- `genesis-contract.d.ts`
- `contract-selection.json`
- `maker.ts`
- provided or AI-generated reference solution
- raw model responses per attempt
- generated `data/`
- generated `data.manifest.json`

Generated job directories are intentionally ignored in git.

## Internal behavior

`examples/ai-maker.ts` does the following internally:

1. reads the full problem statement
2. selects a problem-specific AI contract from `src/ai-contract.ts`, biased toward input structure rather than output story
3. renders that selected Genesis contract
4. if the user provided a solution, includes that exact source in the model context
5. asks the model for only:
   - `<<<SOLUTION_CODE>>>` when needed
   - `<<<MAKER_TS>>>`
6. runs local lint checks on `maker.ts` against the selected contract only
7. preserves the user-facing `maker.ts`, but generates a runtime-only local variant for execution inside the repo
8. runs `genesis validate` logic first for a dry semantic check
9. runs Genesis generation locally only after validation passes
10. if local validation or generation fails, feeds structured issue records back to the model and retries

This repair loop is internal only. The user still sees a single simple flow.

## Hard constraints currently enforced

- `maker.ts` must import only `defineDataset` and `fmt` from `genesis-kit`
- `maker.ts` must use `defineDataset(...)`
- it must define `solution`, `seed`, `format`, `validate`, `cases`
- `seed` must be a descriptive lowercase kebab-case string, not a generic value like `fixed-seed`
- `case.output` is forbidden
- legacy ``fmt`...` `` syntax is forbidden
- unsupported `fmt.*`, `g.*`, `g.base.*`, and `g.CHARSET.*` usages are rejected locally against the selected per-problem contract
- dead-code style filler such as identical-branch ternaries is rejected locally
- `g.pick(...)` is rewritten/forbidden; use `g.sample(...)`
- the declared `solution` path must exactly match the chosen reference solution filename
- if the selected contract does not expose a helper, the model is expected to write plain TypeScript instead of inventing an API call

## Stability notes

- Best path: user provides a reference solution with `--solution`
- AI-generated solution path also exists, but is naturally less stable than using a user-provided solution
- The key reliability lever is contract selection quality, not prompt length
- If Genesis dataset API changes in `src/dataset.ts`, `src/format.ts`, or generator methods, update `src/ai-contract.ts` first
- `examples/ai-genesis-contract.d.ts` is expected to stay in sync with `src/ai-contract.ts`

## Verified run

Verified locally with:

```bash
bun run examples/ai-maker.ts --statement examples/problem.sample.md --solution examples/problem.sample.std.js --name final-a-plus-b
```

Observed result:

- manifest: `examples/.ai-jobs/final-a-plus-b/data.manifest.json`
- summary: `9 total / 9 succeeded / 0 failed`

Offline mock regression runs are also supported through `--mock-response-file`, which is useful when no API key is available.

## Follow-up suggestions

- Keep pushing ambiguity out of the prompt and into `src/ai-contract.ts`
- Prefer smaller, clearer selected contracts over full-API dumps
- Improve statement analysis using input-format signals before adding more methods
- If needed later, move `examples/ai-maker.ts` into a dedicated CLI command, but keep the same user mental model
