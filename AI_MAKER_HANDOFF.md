# AI Maker Handoff

## Branch

- Active branch: `refactor/v2`

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
```

Environment:

- `OPENAI_API_KEY` or `ASXS_API_KEY`
- optional `OPENAI_BASE_URL`
- optional `OPENAI_MODEL`

## Files added for AI context

- [examples/ai-genesis-contract.md](examples/ai-genesis-contract.md)
  - this is the hard Genesis API contract for AI
  - AI is instructed to treat this as the only API truth
- [examples/problem.sample.md](examples/problem.sample.md)
  - tiny sample statement used for local verification
- [examples/problem.sample.std.js](examples/problem.sample.std.js)
  - tiny sample reference solution used for local verification

## Output behavior

Each run writes to:

- `examples/.ai-jobs/<name>/`

That directory contains:

- `problem.md`
- `genesis-contract.md`
- `maker.ts`
- provided or AI-generated reference solution
- raw model responses per attempt
- generated `data/`
- generated `data.manifest.json`

Generated job directories are intentionally ignored in git.

## Internal behavior

`examples/ai-maker.ts` does the following internally:

1. reads the full problem statement
2. loads the Genesis contract
3. if the user provided a solution, includes that exact source in the model context
4. asks the model for only:
   - `<<<SOLUTION_CODE>>>` when needed
   - `<<<MAKER_TS>>>`
5. runs local lint checks on `maker.ts`
6. runs Genesis generation locally
7. if local validation fails, feeds the concrete error back to the model and retries

This repair loop is internal only. The user still sees a single simple flow.

## Hard constraints currently enforced

- `maker.ts` must use `defineDataset(...)`
- it must define `solution`, `seed`, `format`, `cases`
- `case.output` is forbidden
- legacy ``fmt`...` `` syntax is forbidden
- `g.pick(...)` is rewritten/forbidden; use `g.sample(...)`
- the declared `solution` path must exactly match the chosen reference solution filename

## Stability notes

- Best path: user provides a reference solution with `--solution`
- AI-generated solution path also exists, but is naturally less stable than using a user-provided solution
- If Genesis dataset API changes in `src/dataset.ts`, `src/format.ts`, or generator methods, update [examples/ai-genesis-contract.md](examples/ai-genesis-contract.md) first

## Verified run

Verified locally with:

```bash
bun run examples/ai-maker.ts --statement examples/problem.sample.md --solution examples/problem.sample.std.js --name final-a-plus-b
```

Observed result:

- manifest: `examples/.ai-jobs/final-a-plus-b/data.manifest.json`
- summary: `9 total / 9 succeeded / 0 failed`

## Follow-up suggestions

- If future work wants higher reliability, keep tightening the contract file instead of feeding more README prose
- Prefer contract updates over prompt verbosity
- If needed later, move `examples/ai-maker.ts` into a dedicated CLI command, but keep the same user mental model
