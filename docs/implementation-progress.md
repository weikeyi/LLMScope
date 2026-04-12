# LLMScope Implementation Progress

Last updated: 2026-04-12

This document is the repository truth source for current implementation status. Product intent lives in [`docs/plan.md`](./plan.md); milestone sequencing lives in [`docs/ROADMAP.md`](./ROADMAP.md).

## Verification Snapshot

Verified locally on 2026-04-12:

- `pnpm --filter @llmscope/cli test`: passing
- `pnpm --filter @llmscope/cli typecheck`: passing
- built CLI smoke coverage for `start`, `doctor`, `list`, `show`, `clear`, and `export`: passing
- `pnpm --filter @llmscope/web test`: passing
- `pnpm --filter @llmscope/web typecheck`: passing
- `pnpm test`: passing
- `pnpm typecheck`: passing

These commands are the current engineering baseline for milestone work.

## Current Summary

- LLMScope already has a runnable local inspector core: config loading, proxying, capture, normalization, privacy modes, and SQLite persistence are implemented.
- The CLI now acts as the main operator surface for `start`, `doctor`, `list`, `show`, `clear`, and `export`.
- The Web layer now covers the core operator workflow surface for inspect, filter, refresh, delete, clear, export, and live reconciliation.
- The largest remaining gaps are diff/replay product workflows, internal package extraction, runtime hardening, and release engineering.

## Milestone Status

| Milestone | Status | Current reality |
| --- | --- | --- |
| 1. Lock the product contract | Completed | Canonical contract, roadmap, and architecture docs are aligned |
| 2. Complete the CLI product surface | Completed in current branch | `export` is implemented, `/api/config` and `/api/sessions/export` exist, doctor checks the daily-use SQLite path, and CLI/server ownership is split into dedicated modules |
| 3. Upgrade the Web UI into an interactive app | Completed in current branch | The UI supports URL-backed filters and selection, refresh, delete, clear, export, and stronger empty/error/loading states, with server and UI code split into dedicated modules |
| 4. Add real-time product behavior | Completed in current branch | The observation API now exposes `/ws`, stream and session lifecycle events are fanned out live, and the Web UI reconciles list/detail state through fragment refreshes without page reload |
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
- `apps/cli/src/server/*`: observation HTTP server, WebSocket fanout, routes, and export serialization
- Current API surface: health, config, session list, session detail, session export, single-session delete, clear-all, and `/ws` live events

### Web observation surface

- `apps/web`: server-rendered observation UI with modular server and UI ownership
- `apps/web/src/server/*`: request parsing, API calls, and server startup
- `apps/web/src/ui/*`: layout, filters, action controls, live-store wiring, session list, and detail rendering
- Current UI surface: session list, provider/model/status/search filters, URL-backed selection, refresh, single-session delete, clear-all, export, live session updates, raw request/response display, normalized exchange display, stream event timeline, empty state, and error state

## Highest-Priority Gaps

1. Diff and replay remain product-level gaps even though export is now present in both CLI and Web surfaces.
2. Runtime concerns are still concentrated in large core packages. Extraction should happen only after the next operator workflows are stable.
3. Release engineering is still absent, which blocks the project from being comfortably consumable as a public OSS tool.
4. The roadmap's historical `pnpm test -- --runInBand` note is no longer a valid root command with the current Turbo/Vitest scripts; the verified repo-level commands are `pnpm test` and `pnpm typecheck`.

## Next Execution Target

After Milestone 4 exits green, the next delivery target is Milestone 5:

- extract shared export, diff, and replay artifact generation into `packages/replay`
- add first-class diff and replay views on top of the captured-session surface
- keep CLI and Web export behavior aligned on the same artifact rules
- keep `pnpm test` and `pnpm typecheck` green throughout
