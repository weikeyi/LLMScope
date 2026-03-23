## Why

The project already captures LLM proxy sessions in memory, but the only way to inspect them today is through live terminal output while requests are flowing. Adding a queryable inspection surface makes the existing capture pipeline meaningfully usable for debugging, validation, and day-to-day local development.

## What Changes

- Add a read-only session inspection workflow on top of the existing in-memory session store.
- Introduce a session list view that shows the most important captured fields first, including provider, model, path, status, duration, warnings, and errors.
- Introduce a session detail view that exposes fuller request and response metadata for a selected session.
- Add CLI-facing query commands as the first inspection surface so users can inspect previously captured sessions without relying on live log output.
- Keep this change scoped to observation and inspection only; it does not add persistence, provider normalization, or mutation workflows.

## Capabilities

### New Capabilities

- `session-inspection`: Read-only listing and detailed inspection of captured proxy sessions through a queryable interface.

### Modified Capabilities

- None.

## Impact

- Affected code will likely include `apps/cli`, `packages/storage-memory`, `packages/core`, and `packages/shared-types`.
- Introduces a stable read model for session summaries and session detail retrieval.
- Expands the CLI from a pure long-running proxy entrypoint into a tool that can also query captured observations.
- Establishes the product-facing contract that later web and persistence work can build on.
