## 1. Inspection Contracts and Store Coverage

- [x] 1.1 Review and extend shared session summary and detail contracts so the required inspection fields are available consistently to CLI clients
- [x] 1.2 Add or update memory and sqlite store tests for newest-first ordering, filter behavior, limit handling, and session detail lookup

## 2. Observation API Behavior

- [x] 2.1 Ensure the observation API list endpoint returns `SessionSummary` records with the required filter and validation behavior
- [x] 2.2 Ensure the observation API detail endpoint returns full `Session` records and reports missing session ids correctly

## 3. CLI Inspection Workflow

- [x] 3.1 Add CLI query commands for listing captured sessions with filters and rendering the key summary fields
- [x] 3.2 Add a CLI query command for fetching and displaying full session detail by session id
- [x] 3.3 Add CLI integration tests that cover captured traffic, list queries, and detail queries through the inspection workflow

## 4. Documentation and Verification

- [x] 4.1 Update `README.md` with the new session inspection workflow and command usage examples
- [x] 4.2 Run the relevant CLI and storage package tests to verify the inspection surface works across supported stores
