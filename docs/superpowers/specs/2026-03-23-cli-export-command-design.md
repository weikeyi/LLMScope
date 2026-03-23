# CLI Export Command Design

## Goal

Add a first-class `export` command to LLMScope so captured sessions can be moved out of the running observation surface and reused for debugging, sharing, and offline analysis.

## Current baseline

- `apps/cli` already provides `start`, `doctor`, `list`, `show`, and `clear`.
- Non-long-running CLI commands already resolve config and talk to the observation API over HTTP instead of reading storage directly.
- `SessionStore` already supports list and detail reads, and the observation API already exposes `/api/sessions` and `/api/sessions/:id`.
- The project still lacks a way to extract captured sessions into a durable artifact, which keeps it below the "minimal usable product" bar called out in `docs/implementation-progress.md`.

## Candidate approaches

### Approach 1: Add a CLI-only export command on top of existing observation API routes

Use the existing list endpoint to discover matching session ids, then fetch each full session through the existing detail endpoint and serialize the result as JSON or NDJSON.

Pros:

- smallest product slice with immediate user value
- no new observation API surface area
- keeps `apps/cli` command behavior aligned with existing `list` / `show` / `clear`
- works for both memory and SQLite modes as long as the observation API is running

Cons:

- collection export becomes an N+1 HTTP flow
- large exports are less efficient than a dedicated streaming endpoint

### Approach 2: Add a dedicated observation API export endpoint

Introduce a route such as `/api/export` that returns filtered session detail as one JSON or NDJSON response, then keep `apps/cli export` as a thin wrapper around that endpoint.

Pros:

- cleaner long-term export surface
- better performance for large exports
- reusable by future Web UI or automation

Cons:

- expands product surface before export semantics are proven
- adds new API contract, tests, and maintenance cost immediately

### Approach 3: Export directly from resolved storage without using the observation API

Have `apps/cli export` open the configured store directly and read sessions from memory or SQLite without requiring a running observation API.

Pros:

- could eventually support offline export from SQLite
- avoids HTTP round-trips

Cons:

- duplicates read-path logic that already exists in the observation API
- harder to make work consistently for memory mode
- mixes "management of a running instance" with "offline storage inspection" too early

## Recommendation

Choose Approach 1 for the next slice.

It is the fastest path to a real user outcome, it stays aligned with the current CLI architecture, and it avoids prematurely committing the project to a larger export API or offline storage contract. If export usage grows, the future dedicated endpoint can be introduced behind the same CLI contract without throwing away this slice.

## Proposed scope

Add a new `llmscope-cli export` command with these boundaries:

- supports `--config`, `--host`, and `--ui-port` the same way as existing observation commands
- supports collection filters matching `list`: `--status`, `--provider`, `--model`, `--search`, `--limit`
- supports `--session-id <id>` for single-session export
- supports `--format json|ndjson`, with `json` as the default
- supports `--output <path>`; if omitted, write the export payload to stdout
- exports full `Session` records, not summary rows

Collection export should preserve the order returned by `/api/sessions`. For `json`, the output is a JSON array of full sessions. For `ndjson`, each line is one serialized full session.

## Explicit non-goals

- no new Web UI export flow in this slice
- no replay, diff, zip, or bundle format
- no offline direct-from-SQLite export path
- no new observation API export endpoint
- no attempt to optimize very large exports beyond basic correctness

## Behavioral rules

To keep the first version predictable:

- `--session-id` and collection filters should be treated as mutually exclusive
- `--output` should create parent directories when needed
- write success messages only to stderr or omit them entirely when stdout is carrying exported data
- errors should remain user-readable and consistent with current CLI command behavior

## Data flow

1. Parse `export` arguments into one of two modes:
   - single-session export
   - filtered collection export
2. Resolve config and observation target using the same helper path as `list`, `show`, and `clear`
3. For single-session export:
   - fetch `/api/sessions/:id`
   - serialize one full session
4. For collection export:
   - fetch `/api/sessions` with filters
   - fetch each `/api/sessions/:id`
   - serialize the resulting sessions in the same order
5. Write to stdout or the requested output file

## Validation target

This slice is complete when:

- `apps/cli` exposes a working `export` command
- export behavior is covered for single-session and filtered collection flows
- config-driven observation target resolution still works for `export`
- dist smoke verification proves the built CLI can export against a running local instance
