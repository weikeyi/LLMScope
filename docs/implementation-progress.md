# LLMScope Implementation Progress

Last updated: 2026-04-12

This document is the repository truth source for current implementation status. Product intent lives in [`docs/plan.md`](./plan.md); milestone sequencing lives in [`docs/ROADMAP.md`](./ROADMAP.md).

## Verification Snapshot

Verified locally on 2026-04-12 in the Milestone 1 worktree:

- `pnpm test`: passing
- `pnpm typecheck`: passing

These commands are the current engineering baseline for milestone work.

## Current Summary

- LLMScope already has a runnable local inspector core: config loading, proxying, capture, normalization, privacy modes, and SQLite persistence are implemented.
- The CLI already acts as the main control surface for `start`, `doctor`, `list`, `show`, and `clear`.
- The Web layer is usable for read-only observation, but it is not yet a full operator workflow surface.
- The largest remaining gaps are export/diff/replay workflows, real-time UI behavior, internal package extraction, runtime hardening, and release engineering.

## Milestone Status

| Milestone | Status | Current reality |
| --- | --- | --- |
| 1. Lock the product contract | In progress | Canonical contract, roadmap, and architecture docs are being aligned in this milestone |
| 2. Complete the CLI product surface | Partial foundation delivered | `start`, `doctor`, `list`, `show`, `clear`, and the current observation API exist; `export`, `/api/config`, `/api/sessions/export`, and CLI/server modularization are still missing |
| 3. Upgrade the Web UI into an interactive app | Partial foundation delivered | List, filters, detail view, empty state, and error state exist; refresh/delete/clear/export actions are still missing |
| 4. Add real-time product behavior | Not started | No live push transport or in-progress UI reconciliation yet |
| 5. Deliver export, diff, and replay workflows | Not started | No shared replay/export package or diff UI yet |
| 6. Extract runtime concerns into dedicated packages | Not started | SSE parsing, redaction, and provider registry still live inside current packages |
| 7. Runtime hardening, error taxonomy, and daily-use persistence | Partial foundation delivered | Config resolution, SQLite storage, privacy modes, and doctor checks exist; shared error taxonomy, timeout/backpressure controls, and stronger operability checks are still missing |
| 8. Release engineering and public OSS baseline | Not started | No Playwright, CI workflow, Changesets, or OSS policy docs yet |
| 9. Optional MITM and local CA management | Deferred | Not started by design |

## Implemented Surface Today

### Runtime and storage

- `packages/config`: config file discovery, JSON/YAML loading, environment overrides, CLI overrides, runtime validation, and `ResolvedConfig`
- `packages/storage-memory`: in-memory session storage, filtering, delete, clear, and LRU behavior
- `packages/storage-sqlite`: SQLite-backed session persistence with list/detail/delete/clear operations
- `packages/proxy-engine`: Node HTTP proxying, request/response capture, SSE passthrough, provider matching, normalization, and privacy-aware session detail shaping

### Contracts and domain model

- `packages/shared-types`: canonical session, stream event, warning, and error-related domain types
- `packages/core`: provider, routing, storage, and proxy engine contracts

### CLI and observation API

- `apps/cli`: runtime startup and shutdown, observation API host, `doctor`, `list`, `show`, and `clear`
- Current API surface: health, session list, session detail, single-session delete, and clear-all

### Web observation surface

- `apps/web`: server-rendered observation UI
- Current UI surface: session list, provider/model/status/search filters, URL-backed selection, raw request/response display, normalized exchange display, stream event timeline, empty state, and error state

## Highest-Priority Gaps

1. The operator surface is still incomplete: `export` is missing from the CLI, and the Web UI still cannot perform core actions.
2. The product contract was previously spread across three different doc styles. Milestone 1 resolves that by making one canonical contract and one roadmap.
3. Runtime concerns are still concentrated in large modules. Extraction should happen only after the operator workflows are finished and stable.
4. Release engineering is still absent, which blocks the project from being comfortably consumable as a public OSS tool.

## Next Execution Target

After Milestone 1 exits green, the next delivery target is Milestone 2:

- split CLI command and server ownership out of `apps/cli/src/index.ts`
- add `llmscope export`
- expose `/api/config` and `/api/sessions/export`
- keep `pnpm --filter @llmscope/cli test` and `pnpm --filter @llmscope/cli typecheck` green throughout
