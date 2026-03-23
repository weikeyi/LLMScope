# CLI Export Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a usable `llmscope-cli export` command that can write captured sessions to JSON or NDJSON using the existing observation API.

**Architecture:** Keep the next slice local to `apps/cli` by reusing the existing config-resolution and observation-target helpers. Export should compose existing `/api/sessions` and `/api/sessions/:id` endpoints instead of adding a new observation API route or reading storage directly.

**Tech Stack:** TypeScript, Node.js `fs`, Fetch API, existing `apps/cli` command parser and observation API, Vitest.

---

## File Map

- Modify: `apps/cli/src/index.ts`
  - add `export` usage text, command parsing, serialization helpers, and execution path
- Modify: `apps/cli/tests/observation-api.test.ts`
  - add parser coverage and export integration tests against the existing observation API runtime
- Modify: `README.md`
  - document export usage and example workflows
- Modify: `docs/implementation-progress.md`
  - mark export as the next completed product-usability step once implementation lands

Do not add a new observation API endpoint in this slice. Do not add direct SQLite/offline export in this slice.

---

### Task 1: Parse The `export` Command Contract

**Files:**

- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/observation-api.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Add parser coverage for:

- `export --session-id session-123`
- `export --format ndjson --output ./tmp/sessions.ndjson --status completed --limit 5`
- invalid `--format csv`
- rejecting `--session-id` mixed with collection filters such as `--status`

Example assertion shape:

```ts
expect(
  parseCommand([
    'export',
    '--format',
    'ndjson',
    '--output',
    './tmp/sessions.ndjson',
    '--status',
    'completed',
    '--limit',
    '5',
  ]),
).toEqual({
  kind: 'export',
  target: {},
  format: 'ndjson',
  outputPath: './tmp/sessions.ndjson',
  query: {
    status: 'completed',
    limit: 5,
  },
});
```

- [ ] **Step 2: Run the CLI test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/observation-api.test.ts
```

Expected: FAIL because `export` is not yet part of the command parser.

- [ ] **Step 3: Write minimal parser implementation**

In `apps/cli/src/index.ts`:

- add `ExportCommand` to the CLI command union
- extend usage text with `llmscope-cli export`
- parse shared observation target options: `--config`, `--host`, `--ui-port`
- parse export-specific options:
  - `--session-id <id>`
  - `--format json|ndjson`
  - `--output <path>`
  - `--status`, `--provider`, `--model`, `--search`, `--limit`
- reject invalid format values and ambiguous argument combinations

- [ ] **Step 4: Run the CLI test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/observation-api.test.ts
```

Expected: PASS for the new parser assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "feat: add cli export command parsing"
```

---

### Task 2: Implement Export Serialization And Writing

**Files:**

- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/observation-api.test.ts`

- [ ] **Step 1: Write the failing export behavior tests**

Add integration coverage that starts the existing CLI runtime against a fake upstream, captures one or more sessions, then verifies:

- `export --session-id <id>` writes one JSON object
- `export --status completed --format json` writes a JSON array of full sessions
- `export --status completed --format ndjson` writes one full session per line
- `export --output <path>` creates the file and parent directory
- config-driven host and port resolution also works for `export`

Prefer a temp directory and file reads over mocking filesystem writes.

- [ ] **Step 2: Run the CLI test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/observation-api.test.ts
```

Expected: FAIL because the runtime has no `export` execution path yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/cli/src/index.ts`:

- add a helper that fetches session summaries from `/api/sessions`
- add a helper that fetches one full session from `/api/sessions/:id`
- add serializers:
  - one full session as pretty JSON
  - many sessions as pretty JSON array
  - many sessions as NDJSON lines
- add a writer that:
  - writes to stdout when `outputPath` is absent
  - otherwise creates `dirname(outputPath)` and writes the payload to disk
- route `command.kind === 'export'` through existing resolved-config helpers

Keep the export source as the observation API. Do not read `SessionStore` directly.

- [ ] **Step 4: Run the CLI test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/observation-api.test.ts
```

Expected: PASS, including file output and config-driven target coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "feat: implement cli export flows"
```

---

### Task 3: Document Export As The Next Product Usability Step

**Files:**

- Modify: `README.md`
- Modify: `docs/implementation-progress.md`

- [ ] **Step 1: Write the documentation updates**

Update `README.md` to show:

- one single-session export example
- one filtered collection export example
- supported formats (`json`, `ndjson`)
- writing to stdout vs `--output <path>`

Update `docs/implementation-progress.md` to:

- move `export` from "missing command surface" toward completed scope
- refresh the "next stage" wording after export lands

- [ ] **Step 2: Verify docs against the built CLI**

Run:

```bash
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js export --help
```

Expected: usage text includes the new command and options without stale wording.

- [ ] **Step 3: Finalize documentation wording**

Use the observed CLI help text to keep README examples exact. Do not leave speculative options in docs.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/implementation-progress.md
git commit -m "docs: add cli export guidance"
```

---

### Task 4: Smoke Verify The Built Export Flow

**Files:**

- Verify: repository-wide behavior

- [ ] **Step 1: Build the workspace**

Run:

```bash
pnpm exec turbo run build --force
```

Expected: PASS

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/observation-api.test.ts
```

Expected: PASS

- [ ] **Step 3: Run workspace verification**

Run:

```bash
pnpm exec turbo run test --force
pnpm exec turbo run typecheck --force
```

Expected: PASS

- [ ] **Step 4: Run a dist smoke export**

Start the built CLI against a local fake upstream, capture at least one session, then verify:

```bash
node apps/cli/dist/index.js export --config ./examples/llmscope.yaml --format json --output ./tmp/export.json
```

Expected: export file is created and contains full `Session` JSON.

- [ ] **Step 5: Review scope before handoff**

Run:

```bash
git diff -- README.md docs/implementation-progress.md docs/superpowers/specs/2026-03-23-cli-export-command-design.md docs/superpowers/plans/2026-03-23-cli-export-command.md apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
```

Confirm the diff stays within CLI export scope and does not drift into replay, Web UI, or storage refactors.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/implementation-progress.md docs/superpowers/specs/2026-03-23-cli-export-command-design.md docs/superpowers/plans/2026-03-23-cli-export-command.md apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "feat: add cli export command"
```
