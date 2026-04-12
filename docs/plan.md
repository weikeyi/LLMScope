# LLMScope Product Contract

Last updated: 2026-04-12

This document defines what "complete relative to current docs" means for LLMScope. It is the canonical product contract and the single feature matrix for the repository.

## Product Definition

LLMScope is a local-first LLM traffic inspector for AI clients, SDKs, relays, and OpenAI-compatible APIs. The core product is not a hosted observability platform and not a general-purpose browser packet sniffer. It is a local operator tool that:

- captures and forwards LLM traffic through a config-driven local runtime
- normalizes provider-specific request, response, and stream data into one inspection model
- exposes CLI and Web workflows for inspection, cleanup, export, diff, and replay-oriented analysis
- applies privacy controls and durable local persistence suitable for daily use

## Product Boundaries

Included in the product contract:

- config-driven local runtime with safe defaults
- CLI operator surface for startup, health, inspection, cleanup, and export
- observation API for UI and automation workflows
- interactive Web observation app
- real-time session updates while the proxy is running
- export, diff, and replay artifacts
- provider-aware normalization, including generic OpenAI-compatible coverage
- privacy/redaction hardening, typed error semantics, and SQLite daily-use support
- release engineering and OSS repo baseline

Not part of the near-term completion path:

- default-on HTTPS interception
- local certificate authority installation flows
- third-party provider plugin authoring surface
- cloud SaaS or multi-user collaboration features

MITM interception and local CA management remain an opt-in final milestone only.

## Canonical Feature Matrix

| Surface | Complete-product contract | Status on 2026-04-12 | Acceptance gate |
| --- | --- | --- | --- |
| Local runtime | Config-driven startup, safe defaults, one resolved runtime path, observation service, durable local storage option | Partial: config discovery and startup exist; daily-use operability still needs hardening | Milestones 2 and 7 |
| CLI operator surface | `start`, `doctor`, `list`, `show`, `clear`, `export` with one config/error model | Partial: `export` is missing and command modules are still monolithic | Milestone 2 |
| Observation API | Health, session list/detail, delete/clear, config payloads, export payloads, replay-ready detail | Partial: health/list/detail/delete/clear exist; config/export/replay endpoints are missing | Milestones 2 and 5 |
| Web operator app | Filter, refresh, inspect, delete, clear, export, URL-stable detail selection, explicit confirmations | Partial: read-only browsing works; operator actions are missing | Milestone 3 |
| Real-time updates | Live create/update/stream/completed/error events to the UI | Planned | Milestone 4 |
| Artifact workflows | JSON, NDJSON, Markdown export plus diff and replay code generation | Planned | Milestone 5 |
| Provider normalization | OpenAI, Anthropic, and generic OpenAI-compatible coverage with explicit confidence/warning behavior | Partial: OpenAI and Anthropic are implemented; generic coverage is missing | Milestone 6 |
| Privacy and error semantics | Redaction-aware detail/export/replay plus a shared `InspectorError` taxonomy | Partial: privacy modes exist; shared error taxonomy is missing | Milestone 7 |
| Persistence and operability | SQLite daily-use path, writable-directory handling, stronger doctor checks, safe CORS defaults | Partial | Milestone 7 |
| Release and OSS baseline | Playwright, CI, Changesets, licensing, contribution and security docs, quick-start validation | Planned | Milestone 8 |
| MITM and CA management | Opt-in localhost-scoped HTTPS interception and reversible CA flows | Deferred final optional milestone | Milestone 9 |

## Delivery Rules

- Preserve the existing runnable path while filling product gaps.
- Do not deepen the monolithic `apps/cli/src/index.ts` or `apps/web/src/index.ts` when adding the next feature. Split ownership first.
- Prefer one reusable core implementation for export, diff, and replay instead of duplicating logic between CLI and Web.
- Finish operator-facing workflows before extracting new internal packages.
- Do not begin MITM or local CA work until Milestones 1-8 are complete and stable.

## Definition of Complete

LLMScope can be considered complete relative to the current docs only when all of the following are true:

- config-driven local startup works with safe defaults and a documented SQLite daily-use path
- CLI covers start, health, inspection, cleanup, and export operations
- Web UI supports live observation and operator workflows, not only read-only browsing
- export, diff, and replay artifacts are usable from shared core logic
- provider-aware normalization covers first-party and common OpenAI-compatible paths
- privacy controls, timeout behavior, concurrency behavior, error semantics, and persistence behavior are documented and tested
- CI, release docs, and OSS repo baseline are in place
- MITM/CA is either implemented as the final opt-in milestone or explicitly removed from the contract

## Document Roles

- [`README.md`](../README.md) is the quick-start entrypoint and high-level status snapshot.
- [`ROADMAP.md`](./ROADMAP.md) defines milestone order and acceptance gates.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) freezes current boundaries and planned extractions.
- [`implementation-progress.md`](./implementation-progress.md) records what is actually implemented and verified today.
