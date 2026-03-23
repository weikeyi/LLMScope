# Config And Runtime Hardening Design

## Goal

Tighten the path from configuration input to runtime behavior so LLMScope is easier to start, inspect, and operate without relying on implicit defaults or manual flag juggling.

## Current baseline

- `@llmscope/config` now loads JSON and YAML files, validates shape with `zod`, merges environment variables, and applies CLI overrides.
- `apps/cli` resolves config for `start`, `doctor`, `list`, `show`, and `clear`, but command handling still duplicates some config-resolution logic.
- The README and progress docs were behind the code and are being aligned in this same pass.

## Proposed scope

Focus the next implementation slice on runtime reliability rather than new product surface area:

1. Centralize CLI config resolution and target selection.
2. Add stronger config-driven tests for non-long-running commands.
3. Improve config discovery and documentation so the common path is "use a config file, then override only what matters."
4. Keep current product boundaries intact: no Web UI redesign, no provider package split, no export/replay work in this slice.

## Recommended approach

Use the existing `ResolvedConfig` as the single source of truth and move remaining command-specific branching behind small helpers in `apps/cli/src/index.ts`. That keeps behavior coherent without forcing a premature package split.

For configuration ergonomics, prefer predictable conventions over more flags:

- support well-defined default config filenames in the current working directory
- keep precedence explicit: defaults < config file < environment < CLI overrides
- make tests prove the same precedence model for `start`, `doctor`, `list`, `show`, and `clear`

## Out of scope

- turning `apps/web` into a client-rendered app
- adding new provider plugins
- extracting `provider-registry`, `parser-sse`, or `redaction` into separate packages
- adding export, replay, diff, or release automation

## Validation target

This slice is complete when config-driven workflows are consistent across commands, the behavior is documented with an example config path, and the repository still passes `pnpm test` and `pnpm typecheck`.
