## ADDED Requirements

### Requirement: Users can open a runnable web observation interface

The system SHALL provide a runnable web interface for local session inspection that can be reached through a documented local entrypoint.

#### Scenario: Open the observation UI

- **WHEN** a user starts the supported local runtime and navigates to the documented web entrypoint
- **THEN** the system renders the observation web interface without requiring direct API calls from the user

### Requirement: Users can browse session summaries in the web UI

The system SHALL render captured session summaries in a read-only list view backed by the observation API.

#### Scenario: Render the session list

- **WHEN** session summaries are available from the observation API
- **THEN** the web UI displays the summaries in newest-first order with key fields including path, provider, model, status, duration, and warning or error indicators

#### Scenario: Render an empty state

- **WHEN** no captured sessions are available
- **THEN** the web UI displays a clear empty state explaining that no sessions have been captured yet

### Requirement: Users can filter sessions from the web UI

The system SHALL allow users to apply supported session filters from the web interface and reflect those filters in the resulting session list.

#### Scenario: Apply session filters

- **WHEN** a user sets status, provider, model, search, or limit filters in the web UI
- **THEN** the web UI requests and renders session summaries using those filters

### Requirement: Users can inspect session details from the web UI

The system SHALL allow users to select a session from the list and inspect the full captured session detail in the same web workflow.

#### Scenario: Open a selected session

- **WHEN** a user selects a session from the list
- **THEN** the web UI renders the corresponding session detail including transport, routing, request, response, normalized fields, warnings, and captured stream events when present

#### Scenario: Preserve selected-session navigation state

- **WHEN** a user reloads or revisits the UI with a selected session identifier in the supported web state
- **THEN** the web UI restores the selected session detail view for that identifier when the session exists

### Requirement: Users can understand web UI loading failures

The system SHALL surface actionable feedback when session list or detail data cannot be loaded from the observation API.

#### Scenario: Observation API unavailable

- **WHEN** the web UI cannot reach the observation API
- **THEN** the UI displays a clear error state describing that inspection data could not be loaded
