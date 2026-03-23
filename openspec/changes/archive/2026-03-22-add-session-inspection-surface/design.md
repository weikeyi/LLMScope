## Context

LLMScope already captures proxy traffic into a `SessionStore` and exposes a lightweight observation HTTP API from the CLI process. The current product gap is not raw capture, but usable inspection: users need a consistent way to review session summaries and fetch full session detail after traffic has been recorded. The codebase already includes memory and sqlite-backed stores, summary derivation logic, shared session types, and observation API tests, so this change should build on those contracts rather than introduce a separate inspection stack.

## Goals / Non-Goals

**Goals:**

- Define a stable read-only inspection capability for captured sessions.
- Standardize the list and detail shapes needed to inspect sessions from a CLI-facing query workflow.
- Reuse the existing observation API and `SessionStore` abstractions so memory and sqlite storage behave the same way.
- Keep the first implementation focused on the highest-value fields called out in the roadmap: provider, model, path, status, duration, warnings, and errors.

**Non-Goals:**

- Adding persistence beyond the existing sqlite option.
- Introducing provider-aware normalization beyond what the current proxy engine already records.
- Building a full interactive web UI or real-time subscription workflow.
- Adding mutation-heavy management features other than existing delete and clear operations.

## Decisions

### Use the existing observation API as the canonical inspection backend

The CLI already hosts an observation server with health, list, and detail endpoints. This change formalizes that surface as the backend contract for session inspection instead of adding a parallel query mechanism.

Alternative considered: implement direct file or process-local CLI reads with no API surface. This was rejected because the project already has an HTTP observation layer, and keeping one canonical inspection backend reduces duplicated filtering, serialization, and testing logic.

### Treat `SessionSummary` as the primary list read model and `Session` as the detail read model

`SessionSummary` already captures the essential list fields, while `Session` contains the complete captured record. The inspection capability will explicitly rely on those shapes so stores and clients can share one contract.

Alternative considered: define entirely new inspection DTOs. This was rejected because the current types are already close to the needed read model, and introducing duplicate types would add mapping overhead without solving a clear requirement gap.

### Keep filtering server-side through `SessionStore.listSessions(query)`

The store contract already supports search, provider, model, status, and limit filters. The inspection capability should preserve this design so the same behavior works for in-memory and sqlite-backed storage.

Alternative considered: list everything and filter in the CLI client. This was rejected because it would create inconsistent behavior across clients and scale poorly once sqlite-backed history grows.

### Scope the first capability to read-only inspection

The roadmap frames Phase 1 as a queryable observation surface. This design keeps the capability centered on list and detail inspection, while leaving persistence, real-time UI, and richer diagnostics for later changes.

Alternative considered: bundle query, persistence, and provider normalization into one change. This was rejected because it would blur phase boundaries and make the first inspection capability harder to review and ship incrementally.

## Risks / Trade-offs

- [The current observation API is CLI-hosted and ephemeral in memory mode] -> Mitigation: define the capability in storage-agnostic terms so sqlite-backed history and future UI work can reuse the same contracts.
- [Returning full `Session` objects may expose large request or response payloads] -> Mitigation: keep list responses summary-only and reserve full payloads for explicit detail queries.
- [Existing shared types may not cover every future UI convenience field] -> Mitigation: build on the current types now, and extend them in later changes only when a concrete client need appears.
- [Search behavior is simple substring matching] -> Mitigation: document it as the initial behavior and treat richer filtering as a later enhancement rather than overdesigning this phase.
