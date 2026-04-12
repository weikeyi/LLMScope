# LLMScope Architecture

Last updated: 2026-04-12

This document freezes the intended architecture while the product surface is completed. It describes the boundaries that already exist, the boundaries that are planned, and the sequencing rules for getting there.

## Architecture Principles

- Preserve the current runnable path while improving the product.
- Do not keep extending the monolithic runtime entry files once the next feature would deepen coupling.
- Complete operator-facing workflows before extracting reusable internals.
- Prefer shared core implementations for export, diff, and replay so CLI and Web stay consistent.
- Treat MITM and CA management as a final optional capability, not a prerequisite for the local-first product.

## Current Runtime Topology

```text
AI Client / SDK / Relay User
            |
            v
     apps/cli runtime
            |
            +--> packages/config
            +--> packages/proxy-engine
            +--> packages/storage-memory | packages/storage-sqlite
            +--> observation API
                         |
                         v
                      apps/web
```

Today, `apps/cli` is the executable runtime host. It resolves config, starts the proxy, owns the observation API, and uses either memory or SQLite-backed session storage. `apps/web` is a separate server-rendered UI process that consumes the observation API.
It now also consumes live WebSocket fanout and server-rendered fragment refreshes for in-page reconciliation.

## Current Ownership Boundaries

### Apps

- `apps/cli/src/index.ts`
  - command parsing
  - runtime bootstrapping
  - top-level command dispatch
- `apps/cli/src/commands/*`
  - command execution and shared command-side config resolution
- `apps/cli/src/server/*`
  - observation HTTP server
  - WebSocket fanout
  - route handling
  - export serialization
- `apps/web/src/index.ts`
  - observation UI server
  - API reads
  - HTML rendering

### Packages

- `packages/config`
  - config file discovery
  - file, environment, and CLI override merging
  - runtime validation
- `packages/proxy-engine`
  - request forwarding
  - capture and normalization orchestration
  - session lifecycle handling
- `packages/storage-memory`
  - volatile session storage
- `packages/storage-sqlite`
  - persistent session storage
- `packages/shared-types`
  - canonical domain model
- `packages/core`
  - contracts and extension interfaces
- `packages/provider-registry`
  - provider registration and confidence-based match orchestration
- `packages/parser-sse`
  - reusable SSE framing and event parsing
- `packages/redaction`
  - privacy policy translation
  - transport-independent redaction for request, response, and stream payloads
- `packages/provider-generic`
  - generic OpenAI-compatible request, response, and stream normalization

## Data Flow

1. The CLI resolves runtime configuration from defaults, config files, environment variables, and command-line overrides.
2. The CLI starts the proxy engine with a route target and a session store.
3. The proxy engine captures requests, responses, and stream events, then normalizes them into shared session types.
4. The observation API reads and mutates stored sessions for CLI commands, the Web UI, and WebSocket subscribers.
5. The Web server fetches observation data, serves fragment refresh payloads, and renders the current UI surface.

## Extracted Shared Packages

The product surface work in Milestones 5 and 6 established stable enough boundaries to extract these shared packages:

| Package | Responsibility | Delivery milestone |
| --- | --- | --- |
| `packages/replay` | Shared export, diff, and replay artifact generation | 5 |
| `packages/provider-registry` | Provider registration and match orchestration | 6 |
| `packages/parser-sse` | Reusable SSE parsing and event framing | 6 |
| `packages/redaction` | Privacy and redaction rules independent of transport | 6 |
| `packages/provider-generic` | Generic OpenAI-compatible provider support | 6 |

## Planned App-Level Decomposition

### CLI

Milestone 2 split the CLI into:

- `apps/cli/src/commands/*`
- `apps/cli/src/server/http.ts`
- `apps/cli/src/server/routes.ts`
- `apps/cli/src/server/export.ts`

Milestone 4 adds:

- `apps/cli/src/server/ws.ts`
- live event fanout sourced from session lifecycle and stream-event writes

Milestone 5 adds:

- `apps/cli/src/server/replay.ts`
- shared export serialization and replay generation delegated to `packages/replay`

### Web

Milestone 3 split `apps/web/src/index.ts` into:

- `apps/web/src/server/*`
- `apps/web/src/ui/layout.ts`
- `apps/web/src/ui/session-list.ts`
- `apps/web/src/ui/session-detail.ts`
- `apps/web/src/ui/filters.ts`
- `apps/web/src/ui/actions.ts`

Milestone 4 adds:

- `apps/web/src/ui/live-store.ts`
- server-rendered fragment refreshes for list/detail reconciliation during live updates

Milestone 5 adds:

- `apps/web/src/ui/diff-view.ts`
- `apps/web/src/ui/replay-view.ts`
- URL-addressable session comparison and replay snippet rendering backed by `packages/replay`

## Transport Strategy

LLMScope is currently a local-first HTTP inspection tool. The intended transport progression is:

- now: explicit gateway and proxy-friendly local runtime
- later: live session fanout over WebSocket for the UI
- final optional milestone only: opt-in HTTPS MITM and local CA management

The architecture reserves `mitm` as a future transport mode, but product sequencing assumes the local gateway/proxy workflow is the primary deliverable.
