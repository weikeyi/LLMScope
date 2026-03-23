## 1. Web Runtime Entry

- [x] 1.1 Define and implement a runnable `apps/web` entrypoint that serves the observation UI through a documented local workflow
- [x] 1.2 Wire the web runtime to the observation API base URL configuration used for local inspection

## 2. Productized Observation Experience

- [x] 2.1 Implement the supported session list workflow in the web UI, including newest-first summaries and the required key fields
- [x] 2.2 Implement filter application and URL-backed selected-session navigation for the web UI
- [x] 2.3 Implement empty, loading, and observation API error states for list and detail views

## 3. Session Detail Presentation

- [x] 3.1 Implement the supported read-only session detail view for transport, routing, request, response, normalized fields, warnings, and stream events
- [x] 3.2 Ensure selected session detail reloads correctly from the supported web state when the session exists and reports a clear message when it does not

## 4. Verification and Documentation

- [x] 4.1 Add or update `apps/web` tests to cover runtime entry, filter behavior, selected-session navigation, and failure states
- [x] 4.2 Update project documentation to present the web UI as the recommended read-only observation surface and explain how to launch it
