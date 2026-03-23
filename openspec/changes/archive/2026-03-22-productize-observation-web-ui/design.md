## Context

LLMScope now has a solid observation backend: session capture, normalized session detail, queryable observation API endpoints, CLI query commands, and a main `session-inspection` spec. In parallel, `apps/web` already contains read-only rendering and data-loading logic for a session list/detail UI, but it is still positioned like an internal module rather than a clear product entrypoint. This change is about closing that gap by defining how the web UI is reached, how it interacts with the observation API, and what UX behaviors are considered part of the supported product surface.

## Goals / Non-Goals

**Goals:**

- Make the existing web observation UI a runnable, supported read-only inspection surface.
- Define the minimum UX contract for session list, filtering, detail loading, empty states, and error handling.
- Reuse the existing observation API and `SessionSummary`/`Session` contracts rather than introducing a separate backend.
- Preserve the CLI query workflow while making the web UI the primary human-facing inspection path.

**Non-Goals:**

- Adding mutation workflows such as delete or clear actions from the web UI.
- Adding real-time streaming updates, websockets, or subscriptions in this change.
- Replacing the observation API or changing the existing session store contracts.
- Designing a finalized visual brand system; this change focuses on making the UI product-usable first.

## Decisions

### Use the existing observation API as the only web data source

The web UI will load session summaries and session details from the observation API that already powers the CLI query commands.

Alternative considered: introduce a separate app-specific backend or direct in-process store access. This was rejected because it would duplicate query behavior and create another inspection contract to maintain.

### Keep the web UI read-only and query-driven

The first productized web surface will support list, filter, select, and inspect workflows only. It will not include destructive controls or editing actions.

Alternative considered: bundle management actions such as clear/delete into the web launch. This was rejected because the current roadmap priority is observation usability, not session management UX.

### Treat routeable session selection as a core UX behavior

The selected session should be reachable and reloadable through URL-level state so users can share or refresh a specific inspection context without losing selection.

Alternative considered: keep selection as in-memory UI state only. This was rejected because it weakens the web UI as a real inspection surface and makes detail-oriented workflows fragile.

### Build on the current server-rendered HTML module shape

`apps/web` already has rendering and loading primitives that can produce a useful read-only page without committing to a heavy frontend architecture change. This change should lean into that existing shape first, then leave room for later client-side enhancements.

Alternative considered: rewrite the web app around a new SPA framework before launch. This was rejected because the current code already proves the required UI structure, and a framework rewrite would delay productization without being necessary for the immediate goal.

## Risks / Trade-offs

- [The web UI may feel static without real-time updates] -> Mitigation: define a strong read-only workflow now and leave live refresh for a later change.
- [Observation API availability becomes a visible product dependency] -> Mitigation: require clear empty/error/loading states and document how the web surface connects to the local runtime.
- [The current UI module may not map cleanly to a final app shell] -> Mitigation: keep the implementation layered around existing rendering and data-loading functions so future restructuring is still possible.
- [Filter options derived from the current list can under-represent unseen values] -> Mitigation: document this as acceptable for the first version and revisit richer filter sources in a follow-up change.

## Migration Plan

1. Add a runnable web entrypoint around the existing observation page module.
2. Connect local runtime or documentation so users can reach the web surface alongside the observation API.
3. Validate list, detail, filter, and error flows against the current API contract.
4. Update docs to present the web UI as the recommended inspection path.

## Open Questions

- Should the web surface be hosted by the CLI runtime directly or run as a separate local app during the first rollout?
- Should the initial experience auto-refresh on an interval, or stay strictly manual until real-time support exists?
- How much client-side interaction should be added now versus preserving a mostly server-rendered first release?
