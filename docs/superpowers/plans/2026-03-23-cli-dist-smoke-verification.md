# CLI Dist Smoke Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the built LLMScope CLI artifacts can run from `dist/` for the documented management workflows.

**Architecture:** Add one dedicated smoke suite that shells out to `node apps/cli/dist/index.js` after a workspace build, while reusing the existing runtime fixtures from CLI tests. Keep the implementation local to tests and docs; do not expand the product surface.

**Tech Stack:** TypeScript, Vitest, Node.js `child_process`, existing CLI runtime helpers, Turborepo build output.

---

## File Map

- Add: `apps/cli/tests/dist-smoke.test.ts`
  - build workspace once and exercise the built CLI dist entrypoint
- Modify: `README.md`
  - require workspace build before dist commands and add a smoke-check section
- Modify: `docs/implementation-progress.md`
  - record the new smoke verification layer and refresh the testing snapshot

Do not add a second test runner in this slice. Do not change CLI behavior unless the smoke suite reveals a real executable bug.

---

### Task 1: Add Dist Help And Doctor Smoke Coverage

**Files:**

- Add: `apps/cli/tests/dist-smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

Add a new Vitest file that:

- runs `pnpm exec turbo run build --force` once before tests
- executes `node apps/cli/dist/index.js --help`
- executes `node apps/cli/dist/index.js doctor --config <temp-config>`
- asserts the help text contains `export`
- asserts `doctor` output includes `Doctor overall status: ok`

- [ ] **Step 2: Run the smoke test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/dist-smoke.test.ts
```

Expected: FAIL because the smoke suite does not exist yet.

- [ ] **Step 3: Write minimal smoke implementation**

In `apps/cli/tests/dist-smoke.test.ts`:

- add a small helper for `execFile`
- add a `beforeAll` build step from the repo root
- create a temp config file for `doctor`
- assert on stdout rather than internal imports

- [ ] **Step 4: Run the smoke test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/dist-smoke.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/tests/dist-smoke.test.ts
git commit -m "test: add cli dist smoke coverage"
```

---

### Task 2: Smoke A Live Dist Observation Workflow

**Files:**

- Modify: `apps/cli/tests/dist-smoke.test.ts`

- [ ] **Step 1: Write the failing live smoke test**

Extend the smoke suite to:

- start a live upstream server and CLI runtime fixture
- capture one session through the proxy
- run built dist commands for `list`, `show`, `export`, and `clear`
- assert:
  - `list` prints the captured summary
  - `show` prints full JSON containing the session id
  - `export --output <path>` writes JSON or NDJSON
  - `clear --session-id` removes the captured session

- [ ] **Step 2: Run the smoke test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/dist-smoke.test.ts
```

Expected: FAIL until the live dist workflow and assertions are in place.

- [ ] **Step 3: Write minimal smoke implementation**

Reuse the existing test fixture pattern:

- local upstream server
- `createCliRuntime(...)`
- observation API for session id discovery when needed
- temp output files for export payload checks

- [ ] **Step 4: Run the smoke test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/dist-smoke.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/tests/dist-smoke.test.ts
git commit -m "test: smoke built cli observation commands"
```

---

### Task 3: Align README And Progress Docs With The Proven Dist Path

**Files:**

- Modify: `README.md`
- Modify: `docs/implementation-progress.md`

- [ ] **Step 1: Write the documentation updates**

Update `README.md` to:

- require `pnpm exec turbo run build --force` before any `dist/` CLI examples
- add a short "smoke check built CLI" section with `--help` and `doctor`

Update `docs/implementation-progress.md` to:

- record dist smoke verification in the current status/testing snapshot
- move the main release gap wording forward after this work lands

- [ ] **Step 2: Verify docs against built artifacts**

Run:

```bash
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js doctor --config ./examples/llmscope.yaml
```

Expected: output matches the documented command path.

- [ ] **Step 3: Finalize docs**

Keep wording exact to the observed command path. Do not document a single-package build path for `dist/` usage.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/implementation-progress.md
git commit -m "docs: add cli dist smoke guidance"
```

---

### Task 4: Final Verification

**Files:**

- Verify: repository-wide behavior

- [ ] **Step 1: Run workspace build**

Run:

```bash
pnpm exec turbo run build --force
```

Expected: PASS

- [ ] **Step 2: Run focused CLI verification**

Run:

```bash
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/observation-api.test.ts
pnpm --filter @llmscope/cli exec vitest run --config ../../vitest.config.ts apps/cli/tests/dist-smoke.test.ts
```

Expected: PASS

- [ ] **Step 3: Run workspace verification**

Run:

```bash
pnpm exec turbo run test --force
pnpm exec turbo run typecheck --force
pnpm lint
```

Expected: PASS

- [ ] **Step 4: Commit final follow-up if needed**

```bash
git status --short
```

Expected: clean working tree
