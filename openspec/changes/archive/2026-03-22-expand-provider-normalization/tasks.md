## 1. Canonical Exchange Completeness

- [x] 1.1 Audit existing provider plugins to identify which canonical exchange fields are consistently populated vs missing or ignored
- [x] 1.2 Extend OpenAI Chat Completions plugin to populate temperature, topP, maxTokens, toolChoice, and responseFormat fields when present in the request
- [x] 1.3 Extend OpenAI Responses plugin to populate responseFormat and confirm all input/output fields are consistently extracted
- [x] 1.4 Extend Anthropic Messages plugin to confirm all fields match the canonical exchange contract and add any missing fields

## 2. Stream Event Normalization

- [x] 2.1 Audit existing stream event normalization across all three provider plugins to confirm canonical eventType consistency
- [x] 2.2 Ensure OpenAI Chat Completions stream events extract delta text, tool call deltas, usage, and message_stop with consistent canonical shapes
- [x] 2.3 Ensure OpenAI Responses stream events extract structured output deltas, usage, and completion markers with consistent canonical shapes
- [x] 2.4 Ensure Anthropic Messages stream events extract text deltas, content blocks, usage, and message_stop with consistent canonical shapes

## 3. Normalization Diagnostics and Warnings

- [x] 3.1 Introduce structured normalization warning logic in all three provider plugins for missing or unparseable fields
- [x] 3.2 Ensure low-confidence match results include diagnostic reasons so inspection surfaces can surface the limitation to users
- [x] 3.3 Confirm that sessions with no matching provider still record transport metadata and emit a diagnostic warning

## 4. Test Coverage

- [x] 4.1 Update existing provider plugin tests to assert the expanded canonical exchange surface including warnings and confidence scores
- [x] 4.2 Add or extend tests for stream event normalization to cover delta extraction, tool call blocks, usage events, and completion markers
- [x] 4.3 Add tests for low-confidence and no-match scenarios to verify diagnostic warnings are surfaced correctly

## 5. Documentation

- [x] 5.1 Document the stable canonical field contract for each supported provider so inspection surface consumers know which fields are reliable
- [x] 5.2 Update README or relevant docs to clarify what normalization warnings mean and how they appear in inspection surfaces
