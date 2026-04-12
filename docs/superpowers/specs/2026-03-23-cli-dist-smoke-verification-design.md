# CLI Dist Smoke Verification Design

## Goal

Add a release-oriented smoke verification path that proves LLMScope's built CLI artifacts can be executed from `dist/` with the same command surface documented in `README.md`.

## Current baseline

- Source-level CLI tests already cover `doctor`, `list`, `show`, `clear`, and `export`.
- Workspace builds succeed when `pnpm exec turbo run build --force` is run from the repository root.
- The README still presents `node apps/cli/dist/index.js ...` workflows as if a single-package build were sufficient, but built artifacts depend on sibling workspace packages also being built.
- The repository does not yet have a dedicated smoke test that executes the built `apps/cli/dist/index.js` binary against a live observation API.

## Candidate approaches

### Approach 1: Add a dedicated Vitest smoke file that builds the workspace and shells out to `node apps/cli/dist/index.js`

Use a new CLI smoke test file to run a workspace build once, then execute the built CLI binary with `child_process` against live runtime fixtures.

Pros:

- exercises the real dist entrypoint
- keeps smoke verification close to existing CLI tests
- avoids adding a second test runner or release-only harness

Cons:

- slower than pure source-level tests because it builds first

### Approach 2: Add a separate shell script outside Vitest

Create a `scripts/` smoke script that runs build and then several CLI commands.

Pros:

- easy to run locally
- simple implementation

Cons:

- weaker assertions than test code
- duplicates fixture setup logic that already exists in Vitest
- easier for script drift to go unnoticed

### Approach 3: Skip executable smoke tests and only fix the README

Update docs to require a workspace build before any dist command.

Pros:

- smallest possible change

Cons:

- does not prove the documented commands actually work
- leaves the main release gap open

## Recommendation

Choose Approach 1.

It gives the project a real executable smoke layer with minimal surface area expansion, and it directly closes the current gap called out in `docs/implementation-progress.md`.

## Proposed scope

- add one new smoke test file under `apps/cli/tests/`
- run `pnpm exec turbo run build --force` once in the smoke suite before executing dist commands
- smoke-check built `apps/cli/dist/index.js` for:
  - general help output
  - `doctor --config`
  - one live observation workflow covering `list`, `show`, `export`, and `clear`
- update README examples to require a workspace build before any dist command
- update implementation-progress notes to record that dist smoke verification exists

## Explicit non-goals

- no new CLI commands
- no web smoke coverage in this slice
- no packaging or installer work
- no attempt to make `pnpm --filter @llmscope/cli build` alone produce a standalone runnable CLI artifact

## Data flow

1. Build workspace artifacts from the repository root
2. Start live fixture servers with existing test helpers
3. Execute `node apps/cli/dist/index.js ...` commands
4. Assert on stdout, file output, and observation-side behavior
5. Keep README aligned with the proven command sequence

## Validation target

This slice is complete when:

- the repository has a passing automated smoke test for the built CLI dist entrypoint
- the smoke test proves at least one end-to-end observation workflow via dist
- README build and runtime instructions match the proven smoke path
