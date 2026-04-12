# LLMScope

Local-first LLM traffic inspector for config-driven gateway and proxy workflows.

## Product Snapshot

As of 2026-04-12, LLMScope is a runnable local inspector with a stable core runtime:

- config-driven CLI startup with config file discovery
- CLI operator commands: `start`, `doctor`, `list`, `show`, `clear`, `export`
- observation API for health, config, summaries, detail, export, replay, delete, clear, and live WebSocket events
- server-rendered interactive observation UI with list, filters, refresh, delete, clear, export, diff, replay, live updates, empty, and error states
- provider-aware normalization for OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages
- generic OpenAI-compatible provider coverage for common relay path shapes
- shared export, diff, and replay artifact generation in `packages/replay`
- extracted runtime packages for provider registry, SSE parsing, and redaction
- privacy modes and SQLite-backed persistence

The complete product contract is broader than the current implementation. Still planned:

- runtime hardening, release engineering, and OSS packaging

MITM interception and local CA management are explicitly deferred to the final optional milestone. They are not part of the near-term product completion path.

## Canonical Docs

- [`docs/plan.md`](./docs/plan.md): canonical product contract and feature matrix
- [`docs/ROADMAP.md`](./docs/ROADMAP.md): milestone order and acceptance gates
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md): current module boundaries and planned extractions
- [`docs/implementation-progress.md`](./docs/implementation-progress.md): current implementation and verification status

## Current Architecture

The repository is a pnpm workspace monorepo with these active ownership points:

- `apps/cli`: runtime entrypoint, command surface, observation API host
- `apps/cli/src/commands/*`: command execution modules
- `apps/cli/src/server/*`: observation HTTP routes, export loading, and replay helpers
- `apps/web`: observation UI server, API client modules, and HTML rendering
- `packages/replay`: shared export serialization, session diffing, and replay snippet generation
- `packages/config`: config loading, override merging, runtime validation
- `packages/proxy-engine`: proxying, capture, normalization orchestration, and session lifecycle handling
- `packages/provider-registry`: confidence-based provider match orchestration
- `packages/parser-sse`: reusable SSE event framing
- `packages/redaction`: transport-independent privacy shaping
- `packages/provider-generic`: generic OpenAI-compatible normalization
- `packages/storage-memory` and `packages/storage-sqlite`: session persistence
- `packages/shared-types` and `packages/core`: shared domain types and contracts

The current product strategy is:

1. complete the operator-facing product surface first
2. harden runtime behavior second
3. extract reusable packages after real workflow boundaries are proven
4. leave MITM/CA to the final optional milestone

## Quick Start

Build workspace artifacts before running `dist/` commands:

```bash
pnpm exec turbo run build --force
```

Quick smoke check for the built CLI:

```bash
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js doctor --config ./examples/llmscope.yaml
```

Recommended config-driven path:

```bash
cp examples/llmscope.yaml ./llmscope.yaml
node apps/cli/dist/index.js start
```

One-off upstream example:

```bash
node apps/cli/dist/index.js start --upstream https://api.openai.com --port 9000
```

When `--config` is omitted, LLMScope looks for these files in the current working directory:

1. `llmscope.yaml`
2. `llmscope.yml`
3. `llmscope.json`

Useful overrides:

- `--config <path>`: load `.json`, `.yaml`, or `.yml`
- `--host <host>`: override proxy host, default `127.0.0.1`
- `--port <port>`: override proxy port, default `8787`
- `--ui-port <port>`: override observation API port, default `8788`

Check runtime readiness:

```bash
node apps/cli/dist/index.js doctor --config ./llmscope.yaml
```

Inspect captured sessions:

```bash
node apps/cli/dist/index.js list --host 127.0.0.1 --ui-port 8788 --status completed --search /v1/chat --limit 10
node apps/cli/dist/index.js show --host 127.0.0.1 --ui-port 8788 --session-id <session-id>
node apps/cli/dist/index.js clear --host 127.0.0.1 --ui-port 8788 --session-id <session-id>
```

Export captured sessions:

```bash
node apps/cli/dist/index.js export --host 127.0.0.1 --ui-port 8788 --session-id <session-id> --format json --output ./exports/session.json
node apps/cli/dist/index.js export --config ./llmscope.yaml --status completed --format ndjson --output ./exports/sessions.ndjson
node apps/cli/dist/index.js export --config ./llmscope.yaml --status completed --format markdown --output ./exports/sessions.md
```

Supported export formats:

- `json`: one full session object or a JSON array of sessions, with captured secrets redacted by default
- `ndjson`: one full session per line, with the same default redaction policy
- `markdown`: operator-friendly Markdown export for inspection and sharing

Run the observation UI:

```bash
pnpm exec llmscope-web --api-base-url http://127.0.0.1:8788 --port 3000
```

Then open `http://127.0.0.1:3000`.

## Development
## Development

From the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Target a single package:

```bash
pnpm --filter @llmscope/cli typecheck
pnpm --filter @llmscope/proxy-engine test
pnpm --filter @llmscope/storage-sqlite test
```
