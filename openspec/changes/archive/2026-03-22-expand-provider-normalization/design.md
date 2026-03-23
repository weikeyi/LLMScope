## Context

LLMScope already has a solid observation backend and two supported inspection surfaces. The current `ProviderPlugin` interface and its three initial implementations (OpenAI Chat Completions, OpenAI Responses, Anthropic Messages) demonstrate that the plugin architecture works, but the normalized output is currently incomplete in coverage, depth, and diagnostic expressiveness. This design addresses how to expand the normalization layer without disrupting the existing inspection contracts.

The existing plugin interface already has the right shape: `match`, `parseRequest`, `parseResponse`, and `parseStreamEvent`. The `CanonicalExchange` type in `packages/shared-types` already captures provider, model, stream, messages, tools, output, and usage fields. The gap is that not all of those fields are populated consistently, some interesting provider-specific fields are dropped, and partial matches produce no diagnostic signal for users.

## Goals / Non-Goals

**Goals:**

- Expand and deepen the canonical model produced by supported provider plugins so it captures more of the meaningful LLM interaction surface.
- Improve stream event normalization so delta, tool call, usage, and completion events are consistently captured across providers.
- Introduce structured normalization warnings so inspection surfaces can communicate to users when certain fields could not be reliably extracted.
- Define a stable normalization contract for each supported provider so consumers (CLI, web UI, future diff/export) can rely on a consistent shape.
- Improve fallback behavior so unknown or partially-matched providers at least record transport metadata and surface the limitation.

**Non-Goals:**

- Building new UI surfaces or changing how inspection surfaces present data.
- Adding export, replay, or diff workflows.
- Introducing provider-specific configuration or runtime routing changes.
- Rewriting the existing plugin interface or migration path for already-captured sessions.

## Decisions

### Extend the canonical exchange model in place rather than creating provider-specific sub-types

The `CanonicalExchange` interface already covers the key fields needed for LLM interaction inspection. Rather than branching into `OpenAiExchange` or `AnthropicExchange` types, this change extends the existing canonical shape so all providers converge on the same read model.

Alternative considered: introduce provider-specific normalized exchange sub-types. This was rejected because it would create type divergence that inspection surfaces and future comparison tools would have to handle, undermining the value of a canonical model.

### Surface normalization warnings at the session level rather than silently dropping unrecognized fields

When a plugin cannot extract a canonical field from a known provider payload, it currently returns an exchange with missing fields. This change introduces explicit normalization warnings on the session so inspection surfaces can show users that a particular field was not available, rather than presenting a partial record without explanation.

Alternative considered: silently omit unsupported fields. This was rejected because it makes it hard for users to know when they are looking at incomplete data, which undermines the trust in the inspection surface.

### Treat provider match confidence as a first-class diagnostic signal

The `match` method already returns a confidence value and reasons. This change makes the confidence score a required part of the match result and ensures that sessions with low-confidence matches record the diagnostic reasons so users understand why normalization may be shallow.

Alternative considered: use only boolean match/no-match. This was rejected because the confidence-plus-reasons shape already exists and adding a third state (match with low confidence) costs nothing while making diagnostics significantly more useful.

### Normalize stream events into a consistent canonical shape rather than preserving raw provider event shapes

Stream events from OpenAI and Anthropic use different raw field names and event type strings. Rather than storing the raw provider event as-is, this change normalizes the event type, extracts the most useful fields, and preserves the raw original as an optional field for debugging.

Alternative considered: preserve raw stream events verbatim. This was rejected because inspection surfaces and future analysis tools would have to understand both provider event schemas, defeating the purpose of a canonical model.

## Risks / Trade-offs

- [Adding more normalization logic may increase proxy latency for high-throughput scenarios] -> Mitigation: keep parsing logic path-specific and lazy, only touching fields that are actually present in the request/response.
- [Normalization coverage can never be complete for every provider variant] -> Mitigation: define the guaranteed stable subset explicitly in the spec and treat additional fields as best-effort with documented fallbacks.
- [More plugin implementations increase test surface area] -> Mitigation: reuse the existing provider plugin test patterns and add a shared fixture for canonical field assertions.
- [Canonical schema evolution may break consumers that rely on specific field shapes] -> Mitigation: treat new canonical fields as additive; existing fields that are already populated must remain stable.

## Migration Plan

1. Extend existing provider plugins to emit richer canonical exchanges and normalization warnings before adding new providers.
2. Update the shared canonical field fixture and plugin test harness to assert the expanded normalization surface.
3. Run the full test suite against all three existing plugins to verify no regressions before shipping.
4. Document the canonical field stability guarantees so downstream consumers know which fields are reliable.

## Open Questions

- Should the canonical model distinguish between "field not present in the source" vs "field present but not parseable"? This affects how warnings are phrased and whether users can distinguish incomplete from truly absent data.
- How many additional provider paths should be covered in this change vs deferred to a follow-up? Current evidence suggests focusing on depth over breadth for the first expansion.
- Should normalization warnings be a separate top-level field on `Session` or attached to `CanonicalExchange`? The current codebase attaches them to `Session.warnings`, which is shared with other runtime warnings; this may need clarification.
