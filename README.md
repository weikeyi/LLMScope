# LLMScope

Local-first LLM traffic inspector built as a pnpm + Turborepo monorepo.

## Current status

The repository started as a scaffold, but the core runtime and observation stack are now in place:

- `apps/cli`: runnable CLI proxy entrypoint
- `apps/web`: runnable read-only observation UI
- `packages/shared-types`: canonical domain types
- `packages/core`: core contracts and plugin interfaces
- `packages/config`: validated config loading and resolution
- `packages/proxy-engine`: Node-based proxy engine with request/response capture and SSE handling
- `packages/storage-memory`: in-memory session store
- `packages/storage-sqlite`: persistent SQLite session store

Today, the main usable path is a config-driven local proxy with observation API, CLI inspection/export commands, and a runnable read-only web UI.

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

Delivered scope:

- CLI query commands for session list and detail inspection
- a runnable read-only web observation UI
- key fields first: provider, model, path, status, duration, warnings, errors

### Phase 2 — Provider-aware normalization

Goal: transform raw captured traffic into provider-aware LLM session records.

Delivered scope:

- OpenAI Chat Completions normalization
- OpenAI Responses normalization
- Anthropic Messages normalization
- normalized provider/model/api style fields
- normalized request/response/stream event parsing
- normalization warnings for low-confidence matches and no-match scenarios

Normalization warnings: When the proxy matches a request to a known provider plugin with less than full confidence, it records a warning indicating the matched plugin and reasons. When no known provider plugin matches a request, it records a warning that raw traffic is being captured without provider-specific normalization. These warnings appear in the session's `warnings` field and are visible in the observation UI.

### Phase 3 — Product hardening

Goal: move from local demo to more complete product behavior.

Delivered so far:

- config file loading plus env and CLI overrides
- SQLite persistence
- privacy/redaction modes
- doctor checks and CLI management commands, including export

Still planned:

- real-time UI updates
- better filtering/search
- replay/diff workflows
- packaging, CI, and release hardening

## CLI usage

The CLI starts a local proxy, serves the observation API, and provides non-long-running inspection and export commands.

### Start the CLI

```bash
pnpm --filter @llmscope/cli build
node apps/cli/dist/index.js start --upstream https://example.com
```

Recommended config-driven path:

```bash
cp examples/llmscope.yaml ./llmscope.yaml
node apps/cli/dist/index.js start
```

When `--config` is omitted, LLMScope looks for one of these files in the current working directory, in order:

1. `llmscope.yaml`
2. `llmscope.yml`
3. `llmscope.json`

Optional flags:

- `--config <path>`: load `.json`, `.yaml`, or `.yml` config
- `--host <host>`: override the listening host, defaults to `127.0.0.1`
- `--port <port>`: override the listening port, defaults to `8787`
- `--ui-port <port>`: override the observation API port, defaults to `8788`

Example:

```bash
node apps/cli/dist/index.js start --upstream https://api.openai.com --port 9000
```

Use CLI flags when you want a one-off override on top of the resolved config, for example:

```bash
node apps/cli/dist/index.js start --config ./llmscope.yaml --ui-port 9001
```

On startup, the CLI prints:

- the local proxy listening address
- the configured upstream target

As requests pass through the proxy, the CLI prints compact session summaries such as:

```text
[session <id>] POST /v1/chat/completions status=completed code=200 duration=125ms
```

Stop the proxy with `Ctrl+C`.

### Check runtime readiness

Use `doctor` to validate ports, storage, and resolved runtime config:

```bash
node apps/cli/dist/index.js doctor --config ./llmscope.yaml
```

### Inspect captured sessions

While the proxy is running, the observation API also supports CLI inspection commands.

Recommended read-only inspection surface:

```bash
pnpm --filter @llmscope/web build
node apps/web/dist/index.js --api-base-url http://127.0.0.1:8788 --port 3000
```

Then open `http://127.0.0.1:3000` in your browser. The web UI supports:

- session list browsing
- provider/model/status/search/limit filters
- URL-backed selected session detail
- empty and error states when observation data is unavailable

The web UI package also exposes a runnable binary:

```bash
pnpm --filter @llmscope/web build
pnpm exec llmscope-web --api-base-url http://127.0.0.1:8788 --port 3000
```

List captured sessions:

```bash
node apps/cli/dist/index.js list --host 127.0.0.1 --ui-port 8788 --status completed --search /v1/chat --limit 10
```

This prints summary rows with the key inspection fields, including provider, model, path, status, duration, warnings, and errors.

Show full session detail:

```bash
node apps/cli/dist/index.js show --host 127.0.0.1 --ui-port 8788 --session-id <session-id>
```

This prints the full captured `Session` JSON, including request, response, normalized fields, warnings, and stream events when present.

Export one session as JSON to stdout:

```bash
node apps/cli/dist/index.js export --host 127.0.0.1 --ui-port 8788 --session-id <session-id>
```

Export filtered sessions to a file:

```bash
node apps/cli/dist/index.js export --host 127.0.0.1 --ui-port 8788 --status completed --format ndjson --output ./exports/sessions.ndjson
```

`export` writes full `Session` records, not summary rows. Supported formats are `json` and `ndjson`; `json` is the default. When `--output` is omitted, the payload is written to stdout.

You can still clear captured sessions through the observation API helper command:

```bash
node apps/cli/dist/index.js clear --host 127.0.0.1 --ui-port 8788 --session-id <session-id>
```

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
