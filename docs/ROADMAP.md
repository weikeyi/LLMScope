# LLMScope Roadmap

Last updated: 2026-04-12

This roadmap translates the product contract into mergeable milestone gates. Each milestone must end with updated docs and a green verification pass. MITM and CA management are intentionally last.

## Sequencing Rules

- Do not execute this as one long branch.
- Each milestone should finish as one mergeable unit with a green `pnpm test` and `pnpm typecheck`.
- Build product workflows before deep internal extraction.
- Do not start MITM or local CA work until Milestones 1-8 are complete and stable.

## Milestone Overview

| Milestone | Status | Outcome |
| --- | --- | --- |
| 1. Lock the product contract | Completed | Canonical docs, architecture, and milestone gates are aligned |
| 2. Complete the CLI product surface | Completed | CLI/operator workflows and observation API management endpoints are implemented |
| 3. Upgrade the Web UI into an interactive app | Completed | The observation UI supports filtering, selection, refresh, destructive actions, and export |
| 4. Add real-time product behavior | Completed | Live session and stream updates reconcile through the web observation surface |
| 5. Deliver export, diff, and replay workflows | Completed | Shared replay/export/diff primitives back both CLI and Web workflows |
| 6. Extract runtime concerns into dedicated packages | Completed | Runtime responsibilities are split into focused workspace packages |
| 7. Runtime hardening, error taxonomy, and daily-use persistence | Completed | Typed errors, runtime limits, SQLite operability inspection, and safer UI API behavior are in place |
| 8. Release engineering and public OSS baseline | Planned next | Make the repository shippable and maintainable in public |
| 9. Optional final milestone: MITM and local CA management | Deferred final optional | Add opt-in HTTPS interception without contaminating the base product |

## Milestone Gates

### 1. Lock the product contract

Acceptance gate:

- one canonical feature matrix exists
- every later milestone has a documented acceptance gate
- MITM/CA is explicitly marked as the final optional milestone only
- verification: `pnpm test` and `pnpm typecheck`

### 2. Complete the CLI product surface

Acceptance gate:

- `llmscope export --format json|ndjson|markdown --output <path>` works
- CLI commands share one resolved config path and one error model
- the CLI-hosted observation service exposes `/api/config`, `/api/sessions/export`, and replay-oriented detail payloads
- `doctor` verifies the default SQLite daily-use path
- verification: `pnpm --filter @llmscope/cli test`, `pnpm --filter @llmscope/cli typecheck`, and dist smoke runs for `start`, `doctor`, `list`, `show`, `clear`, `export`

### 3. Upgrade the Web UI into an interactive app

Acceptance gate:

- users can inspect, filter, refresh, delete, clear, and export without leaving the UI
- selected session state is URL-addressable and stable on refresh
- all destructive actions require explicit confirmation
- verification: `pnpm --filter @llmscope/web test` and `pnpm --filter @llmscope/web typecheck`

### 4. Add real-time product behavior

Acceptance gate:

- new sessions appear without page reload
- in-progress stream events append live
- completed and error states reconcile cleanly with the selected detail view
- verification: `pnpm test -- --runInBand` and a manual smoke run with a live proxied request

### 5. Deliver export, diff, and replay workflows

Acceptance gate:

- CLI and Web use the same shared export/replay core package
- diff supports previous-versus-selected and selected-versus-selected comparison modes
- replay output never includes secrets by default
- verification: `pnpm --filter @llmscope/replay test`, `pnpm test`, and snapshot coverage for Markdown export and generated replay code

### 6. Extract runtime concerns into dedicated packages

Acceptance gate:

- `packages/proxy-engine` orchestrates but no longer owns SSE parsing, redaction rules, or registry composition
- generic provider support covers common OpenAI-compatible relays with explicit confidence and warning behavior
- verification: targeted tests for `@llmscope/proxy-engine`, `@llmscope/provider-registry`, `@llmscope/parser-sse`, `@llmscope/redaction`, and `@llmscope/provider-generic`

### 7. Runtime hardening, error taxonomy, and daily-use persistence

Acceptance gate:

- timeout and overload scenarios surface typed errors
- SQLite path handling is practical for a normal local setup
- Web and CLI render the same user-facing error semantics
- verification: `pnpm test` plus fault-injection tests for timeout, malformed SSE, SQLite permission failure, and upstream `429` / `500`

### 8. Release engineering and public OSS baseline

Acceptance gate:

- a fresh clone can install, build, test, and run the quick start
- CI reproduces the local engineering contract
- public docs match actual product behavior
- verification: green CI, green Playwright happy-path run, and a documented fresh-clone smoke checklist

### 9. Optional final milestone: MITM and local CA management

Acceptance gate:

- MITM remains opt-in and localhost-scoped
- CA install and remove are reversible and documented
- privacy defaults remain conservative
- verification: dedicated integration tests and a manual opt-in smoke run on a disposable local environment
