## Why

LLMScope already has the right product surfaces to inspect captured traffic, but the value of those surfaces depends on how consistently raw provider payloads are normalized into a stable canonical model. The current implementation proves the plugin architecture with a small set of provider paths, so the next step is to deepen coverage and tighten the normalized contract so inspection, filtering, and future comparison features can rely on it.

## What Changes

- Expand provider-aware normalization beyond the current minimal set of provider paths.
- Strengthen the normalized request, response, and stream-event contract so supported providers expose more consistent canonical fields.
- Improve provider plugin diagnostics and fallback behavior when a payload only partially matches a known provider shape.
- Define what normalized behavior is guaranteed for supported providers and how unsupported fields surface warnings instead of silently disappearing.
- Keep this change scoped to normalization and canonical modeling; it does not add new UI surfaces, export flows, or replay tooling.

## Capabilities

### New Capabilities

- `provider-normalization`: Canonical parsing requirements for supported providers across request, response, and stream event normalization.

### Modified Capabilities

- `session-inspection`: Extend inspection expectations so supported surfaces can rely on richer normalized provider data and surfaced normalization warnings.

## Impact

- Affected code will likely include `packages/proxy-engine`, `packages/shared-types`, provider plugin modules under `packages/proxy-engine/src/providers`, and tests that validate normalized exchanges.
- Clarifies the contract between raw provider traffic and the canonical session model consumed by CLI and web inspection surfaces.
- Creates the foundation for later search, diff, export, and diagnostics work to build on stable normalized data rather than provider-specific payload shapes.
