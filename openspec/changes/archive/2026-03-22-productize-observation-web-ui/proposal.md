## Why

LLMScope already captures rich session data and now exposes it through the observation API and CLI inspection commands, but the primary user experience still depends on terminal workflows and raw JSON output. The web observation UI has enough foundation code to prove the concept, so now is the right time to turn it into the main read-only inspection surface that makes the product easier to demo, validate, and use day to day.

## What Changes

- Turn the existing `apps/web` observation rendering module into a real, runnable read-only UI entrypoint.
- Add a productized session list and detail experience backed by the existing observation API.
- Make filtering, empty states, error states, and selected-session navigation part of the supported web workflow.
- Define how the web UI is reached in local development and how it connects to the observation API.
- Keep the scope read-only: this change does not add mutation workflows, real-time subscriptions, or a new backend protocol.

## Capabilities

### New Capabilities

- `observation-web-ui`: A runnable web-based read-only interface for browsing captured sessions, filtering the session list, and inspecting session details.

### Modified Capabilities

- `session-inspection`: Extend the existing inspection capability so the supported product surface includes a first-class web UI workflow in addition to CLI querying.

## Impact

- Affected code will likely include `apps/web`, `apps/cli`, and shared session/query contracts consumed by the observation API.
- Clarifies the runtime relationship between the web UI and the observation API.
- Establishes the web UI as the primary human-facing inspection surface while preserving the existing CLI query path.
