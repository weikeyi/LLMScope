# LLMScope

Local-first LLM traffic inspector built as a pnpm + Turborepo monorepo.

## Current status

The repository started as a Phase A scaffold, but the core backend foundation is already in place:

- `apps/cli`: runnable CLI proxy entrypoint
- `apps/web`: future web app scaffold
- `packages/shared-types`: canonical domain types
- `packages/core`: core contracts and plugin interfaces
- `packages/config`: configuration contracts and defaults
- `packages/proxy-engine`: Node-based proxy engine with request/response capture and SSE handling
- `packages/storage-memory`: in-memory session store

Today, the main usable path is the CLI-driven local proxy.

## Phased implementation plan

### Phase 0 — Runnable local inspector

Goal: make LLMScope actually usable locally by wiring the existing backend packages into a working CLI entrypoint.

Delivered in this phase:
- CLI boots the proxy engine
- requests are forwarded to one upstream base URL
- sessions are captured in memory
- terminal prints concise session summaries
- graceful shutdown is handled

### Phase 1 — Queryable observation surface

Goal: add a way to inspect captured sessions beyond live terminal logs.

Planned scope:
- session list and detail views
- either CLI query commands or a minimal read-only web surface
- key fields first: provider, model, path, status, duration, warnings, errors

### Phase 2 — Provider-aware normalization

Goal: transform raw captured traffic into provider-aware LLM session records.

Planned scope:
- first `ProviderPlugin` implementation
- normalized provider/model/api style fields
- normalized request/response/stream event parsing for one provider path

### Phase 3 — Product hardening

Goal: move from local demo to more complete product behavior.

Planned scope:
- fuller config loading
- persistent storage
- real-time UI updates
- better filtering/search
- privacy/redaction features
- stronger diagnostics

## CLI usage

The CLI now starts a local proxy that forwards traffic to a single upstream target.

### Start the CLI

```bash
pnpm --filter @llmscope/cli build
node apps/cli/dist/index.js --upstream https://example.com
```

Optional flags:

- `--host <host>`: override the listening host, defaults to `127.0.0.1`
- `--port <port>`: override the listening port, defaults to `8787`

Example:

```bash
node apps/cli/dist/index.js --upstream https://api.openai.com --port 9000
```

On startup, the CLI prints:
- the local proxy listening address
- the configured upstream target

As requests pass through the proxy, the CLI prints compact session summaries such as:

```text
[session <id>] POST /v1/chat/completions status=completed code=200 duration=125ms
```

Stop the proxy with `Ctrl+C`.

## Development commands

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
pnpm --filter @llmscope/storage-memory test
```
