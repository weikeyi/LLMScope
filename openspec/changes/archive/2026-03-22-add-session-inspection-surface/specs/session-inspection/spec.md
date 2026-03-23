## ADDED Requirements

### Requirement: Users can list captured session summaries

The system SHALL provide a read-only session listing capability that returns captured sessions as summary records ordered from newest to oldest.

#### Scenario: List recent captured sessions

- **WHEN** a user requests the session list without filters
- **THEN** the system returns session summaries sorted by descending `startedAt`

#### Scenario: Show key inspection fields in the summary

- **WHEN** a session summary is returned in the list
- **THEN** the summary includes the session identifier, status, started time, request method, request path, warning count, and any available provider, model, status code, duration, stream flag, end time, and error code

### Requirement: Users can filter session summaries

The system SHALL allow the session listing capability to filter results by search text, provider, model, status, and result limit.

#### Scenario: Filter by status

- **WHEN** a user requests session summaries with a status filter
- **THEN** the system returns only sessions whose status exactly matches the requested status

#### Scenario: Filter by provider or model

- **WHEN** a user requests session summaries with provider or model filters
- **THEN** the system returns only sessions whose normalized provider and model match the requested values

#### Scenario: Filter by search text

- **WHEN** a user requests session summaries with a search string
- **THEN** the system matches the search string against available session identifiers and key transport or routing fields and returns only matching sessions

#### Scenario: Limit the number of returned summaries

- **WHEN** a user requests session summaries with a limit
- **THEN** the system returns no more than the requested number of summaries

### Requirement: Users can inspect session details

The system SHALL provide a read-only session detail capability that returns the full captured session record for a specific session identifier.

#### Scenario: Retrieve a captured session by id

- **WHEN** a user requests a known session identifier
- **THEN** the system returns the corresponding full session record including transport, routing, request, response, normalized data, warnings, error information, and any captured stream events

#### Scenario: Reject unknown session ids

- **WHEN** a user requests a session identifier that does not exist
- **THEN** the system reports that the session was not found

### Requirement: Inspection behavior is consistent across supported stores

The system SHALL expose the same session inspection behavior for every `SessionStore` implementation used by the CLI runtime.

#### Scenario: Memory-backed inspection

- **WHEN** the CLI runtime is configured with the in-memory store
- **THEN** session listing and detail retrieval behave according to the same inspection requirements

#### Scenario: Sqlite-backed inspection

- **WHEN** the CLI runtime is configured with the sqlite store
- **THEN** session listing and detail retrieval behave according to the same inspection requirements
