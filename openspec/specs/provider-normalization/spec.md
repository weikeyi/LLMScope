## ADDED Requirements

### Requirement: Provider plugins produce canonical exchanges with stable fields

Each supported provider plugin SHALL produce a `CanonicalExchange` with the following fields populated when the corresponding data is present in the request or response payload: provider, apiStyle, model, stream, temperature, topP, maxTokens, inputMessages, tools, toolChoice, responseFormat, output, usage, latency, and warnings.

#### Scenario: OpenAI Chat Completions request normalization

- **WHEN** a proxy session captures a POST to an OpenAI Chat Completions endpoint
- **THEN** the canonical exchange includes the provider, apiStyle, model, stream flag, temperature, topP, maxTokens, and canonical input messages derived from the request body

#### Scenario: OpenAI Responses request normalization

- **WHEN** a proxy session captures a POST to an OpenAI Responses endpoint
- **THEN** the canonical exchange includes the provider, apiStyle, model, stream flag, temperature, topP, maxTokens, instructions, input messages, tools, and toolChoice when present in the request body

#### Scenario: Anthropic Messages request normalization

- **WHEN** a proxy session captures a POST to an Anthropic Messages endpoint
- **THEN** the canonical exchange includes the provider, apiStyle, model, stream flag, temperature, topP, maxTokens, system instructions, input messages, tools, and toolChoice when present in the request body

### Requirement: Provider plugins produce canonical response output

Each supported provider plugin SHALL extract the meaningful response content from the upstream response and populate the canonical exchange output field, including text output, assistant messages, tool calls, and finish reason when available.

#### Scenario: OpenAI Chat Completions response normalization

- **WHEN** a proxy session captures a response from an OpenAI Chat Completions endpoint
- **THEN** the canonical exchange output includes the assistant text content, any tool call parts, and the finish reason extracted from the response body

#### Scenario: OpenAI Responses response normalization

- **WHEN** a proxy session captures a response from an OpenAI Responses endpoint
- **THEN** the canonical exchange output includes the output message text, any tool results, and the finish reason extracted from the response body

#### Scenario: Anthropic Messages response normalization

- **WHEN** a proxy session captures a response from an Anthropic Messages endpoint
- **THEN** the canonical exchange output includes the assistant text content, any tool use blocks, and the stop reason extracted from the response body

### Requirement: Provider plugins normalize stream events into a canonical shape

Each supported provider plugin SHALL normalize stream events from the upstream into a canonical stream event structure with a consistent eventType, extracted delta or block data, and a reference to the session and sequence.

#### Scenario: OpenAI Chat Completions stream event normalization

- **WHEN** a proxy session captures a streaming response from an OpenAI Chat Completions endpoint
- **THEN** stream events are normalized with the canonical eventType, delta text or tool call parts, usage when present, and message_stop when the stream completes

#### Scenario: OpenAI Responses stream event normalization

- **WHEN** a proxy session captures a streaming response from an OpenAI Responses endpoint
- **THEN** stream events are normalized with the canonical eventType, delta text or structured output, usage when present, and completion markers

#### Scenario: Anthropic Messages stream event normalization

- **WHEN** a proxy session captures a streaming response from an Anthropic Messages endpoint
- **THEN** stream events are normalized with the canonical eventType, delta text or tool call blocks, usage when present, and message_stop events

### Requirement: Provider plugins surface normalization warnings

When a plugin encounters a known provider payload but cannot extract a specific canonical field, it SHALL emit a normalization warning on the session describing which field was not available and why.

#### Scenario: Request body missing the model field

- **WHEN** a plugin matches a known provider endpoint but the request body does not contain a recognized model field
- **THEN** the canonical exchange is still produced with provider and apiStyle populated, and a warning is added indicating that the model field could not be extracted

#### Scenario: Response body missing the finish reason

- **WHEN** a plugin successfully matches a known provider but the response body does not contain a recognizable finish reason
- **THEN** the canonical exchange output is still produced and a warning is added indicating that the finish reason was not available

### Requirement: Provider match results include diagnostic confidence

Each provider plugin match result SHALL include a confidence score and a list of diagnostic reasons so sessions with shallow normalization can be identified and understood.

#### Scenario: High-confidence provider match

- **WHEN** a plugin matches a request with a complete provider-specific payload shape
- **THEN** the match result includes a confidence score above 0.8 and reasons listing the matched fields

#### Scenario: Low-confidence provider match

- **WHEN** a plugin matches a request with only partial provider-specific characteristics
- **THEN** the match result includes a confidence score below 0.8 and reasons listing which characteristics were matched, allowing downstream surfaces to identify sessions with shallow normalization

### Requirement: Unsupported providers record transport metadata and emit a diagnostic warning

When no plugin matches a request with sufficient confidence, the system SHALL still record the transport metadata and emit a diagnostic warning so users understand why normalization was not possible.

#### Scenario: No matching provider plugin

- **WHEN** no plugin produces a match with confidence above the minimum threshold for a request
- **THEN** the session is still captured with transport metadata, routing match information, and a warning indicating that no known provider was detected

#### Scenario: OpenAI-compatible provider detected generically

- **WHEN** a request matches an OpenAI-compatible endpoint pattern but not a specific provider plugin
- **THEN** the routing record includes a generic OpenAI-compatible provider indicator and a warning that provider-specific normalization was not applied
