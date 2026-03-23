## MODIFIED Requirements

### Requirement: Users can list captured session summaries

The system SHALL provide a read-only session listing capability that returns captured sessions as summary records ordered from newest to oldest through the observation API and supported inspection surfaces.

#### Scenario: List recent captured sessions

- **WHEN** a user requests the session list without filters
- **THEN** the system returns session summaries sorted by descending `startedAt`

#### Scenario: Show key inspection fields in the summary

- **WHEN** a session summary is returned in the list
- **THEN** the summary includes the session identifier, status, started time, request method, request path, warning count, and any available provider, model, status code, duration, stream flag, end time, and error code

#### Scenario: Render summaries in supported inspection surfaces

- **WHEN** a supported inspection surface presents captured session summaries to the user
- **THEN** that surface renders the summary fields needed to scan provider, model, path, status, duration, warnings, and errors

### Requirement: Users can inspect session details

The system SHALL provide a read-only session detail capability that returns the full captured session record for a specific session identifier and supports detail inspection in the supported product surfaces.

#### Scenario: Retrieve a captured session by id

- **WHEN** a user requests a known session identifier
- **THEN** the system returns the corresponding full session record including transport, routing, request, response, normalized data, warnings, error information, and any captured stream events

#### Scenario: Reject unknown session ids

- **WHEN** a user requests a session identifier that does not exist
- **THEN** the system reports that the session was not found

#### Scenario: Display detail in a supported inspection surface

- **WHEN** a supported inspection surface loads a known session identifier for detail inspection
- **THEN** the surface can render the full captured session record returned by the system
