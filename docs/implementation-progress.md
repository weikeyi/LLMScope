# LLMScope Implementation Progress

Last updated: 2026-04-12

This document is the repository truth source for current implementation status. Product intent lives in [`docs/plan.md`](./plan.md); milestone sequencing lives in [`docs/ROADMAP.md`](./ROADMAP.md).

## Verification Snapshot

Verified locally on 2026-04-12 in the Milestone 2 worktree:

- `pnpm --filter @llmscope/cli test`: passing
- `pnpm --filter @llmscope/cli typecheck`: passing
- built CLI smoke coverage for `start`, `doctor`, `list`, `show`, `clear`, and `export`: passing

These commands are the current engineering baseline for milestone work.

## Current Summary

- LLMScope already has a runnable local inspector core: config loading, proxying, capture, normalization, privacy modes, and SQLite persistence are implemented.
- The CLI now acts as the main operator surface for `start`, `doctor`, `list`, `show`, `clear`, and `export`.
- The Web layer is usable for read-only observation, but it is not yet a full operator workflow surface.
- The largest remaining gaps are interactive Web workflows, real-time UI behavior, diff/replay product workflows, internal package extraction, runtime hardening, and release engineering.

## Milestone Status

| Milestone | Status | Current reality |
| --- | --- | --- |
| 1. Lock the product contract | Completed | Canonical contract, roadmap, and architecture docs are aligned |
| 2. Complete the CLI product surface | Completed in current branch | `export` is implemented, `/api/config` and `/api/sessions/export` exist, doctor checks the daily-use SQLite path, and CLI/server ownership is split into dedicated modules |
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

- `apps/cli`: runtime startup and shutdown, `start`, `doctor`, `list`, `show`, `clear`, and `export`
- `apps/cli/src/commands/*`: command execution split by operator workflow
- `apps/cli/src/server/*`: observation HTTP server, routes, and export serialization
- Current API surface: health, config, session list, session detail, session export, single-session delete, and clear-all

### Web observation surface

- `apps/web`: server-rendered observation UI
- Current UI surface: session list, provider/model/status/search filters, URL-backed selection, raw request/response display, normalized exchange display, stream event timeline, empty state, and error state

## Highest-Priority Gaps

1. The Web UI still cannot perform the core operator actions that the CLI now covers.
2. Diff and replay remain product-level gaps even though export is now present.
3. Runtime concerns are still concentrated in large core packages. Extraction should happen only after the next operator workflows are stable.
4. Release engineering is still absent, which blocks the project from being comfortably consumable as a public OSS tool.

## Next Execution Target

After Milestone 2 exits green, the next delivery target is Milestone 3:

- split the Web surface out of `apps/web/src/index.ts`
- add refresh, delete, clear, and export actions to the UI
- make selected-session state stable through the URL
- keep `pnpm --filter @llmscope/web test` and `pnpm --filter @llmscope/web typecheck` green throughout
