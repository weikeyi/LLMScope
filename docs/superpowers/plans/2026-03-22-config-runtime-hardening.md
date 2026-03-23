# Config And Runtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LLMScope's config-driven startup and inspection workflows consistent, discoverable, and well-tested across `start`, `doctor`, `list`, `show`, and `clear`.

**Architecture:** Keep `@llmscope/config` as the single configuration authority and harden the CLI by routing every command through shared resolved-config helpers instead of repeating ad hoc logic. Add default config-file discovery, command-level precedence tests, and user-facing config documentation without expanding the product surface into export/replay or Web UI redesign.

**Tech Stack:** TypeScript, Node.js, Fetch API, `yaml`, `zod`, Vitest, existing `@llmscope/config`, existing CLI runtime in `apps/cli`.

---

## File Map

- Modify: `packages/config/src/index.ts`
  - Add default config-file discovery helpers
  - Keep precedence explicit and testable
- Modify: `packages/config/tests/resolve-config.test.ts`
  - Add discovery and precedence regression tests
- Modify: `apps/cli/src/index.ts`
  - Extract shared config-resolution helpers
  - Remove duplicated command-specific resolved-config wiring
  - Keep runtime behavior unchanged except for newly documented discovery support
- Modify: `apps/cli/tests/observation-api.test.ts`
  - Add config-driven tests for `doctor`, `list`, `show`, and `clear`
  - Add precedence coverage for config file vs CLI overrides
- Add: `examples/llmscope.yaml`
  - Provide a stable sample config for local use and docs
- Modify: `README.md`
  - Document the preferred config-driven startup path
- Modify: `docs/implementation-progress.md`
  - Update status after implementation lands

No package split is planned in this slice. No Web UI redesign is planned in this slice.

---

### Task 1: Add Default Config Discovery To `@llmscope/config`

**Files:**

- Modify: `packages/config/src/index.ts`
- Test: `packages/config/tests/resolve-config.test.ts`

- [ ] **Step 1: Write the failing discovery tests**

Add tests that prove `resolveConfig()` can discover a config file when `filePath` is omitted and the working directory contains one of:

```ts
llmscope.yaml
llmscope.yml
llmscope.json
```

Include one precedence test that confirms an explicit `filePath` still wins over discovery.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/config test -- --runInBand
```

Expected: FAIL because `resolveConfig()` only loads a file when `filePath` is passed explicitly.

- [ ] **Step 3: Write minimal implementation**

In `packages/config/src/index.ts`:

- add a helper that searches the current working directory in this order:
  1. `llmscope.yaml`
  2. `llmscope.yml`
  3. `llmscope.json`
- use the discovered path only when `options.filePath` is `undefined`
- keep precedence:
  defaults < discovered or explicit config file < env < CLI overrides

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/config test -- --runInBand
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/index.ts packages/config/tests/resolve-config.test.ts
git commit -m "feat: add default config discovery"
```

---

### Task 2: Centralize CLI Config Resolution And Target Selection

**Files:**

- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/observation-api.test.ts`

- [ ] **Step 1: Write the failing CLI behavior tests**

Add tests that cover:

- `doctor --config <path>` using resolved config values
- `list` without `--host/--ui-port` targeting the resolved observation API host and port
- `clear` with explicit `--ui-port` overriding the config file value

Use temporary config files instead of inlined objects so the test verifies the full command path.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "resolved config"
```

Expected: FAIL because coverage for config-driven command resolution does not exist yet, and the first added assertion should expose at least one duplicated or implicit path.

- [ ] **Step 3: Write minimal implementation**

In `apps/cli/src/index.ts`:

- extract one helper that returns a resolved config for any command
- extract one helper that computes the observation target from resolved config plus CLI overrides
- route `doctor`, `list`, `show`, `clear`, and `start` through those helpers
- preserve existing user-visible output and error wording where possible

Do not split the file into multiple modules in this slice. Keep the refactor local and behavioral.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "resolved config"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "refactor: centralize cli config resolution"
```

---

### Task 3: Add End-To-End Precedence Regression Coverage

**Files:**

- Modify: `packages/config/tests/resolve-config.test.ts`
- Modify: `apps/cli/tests/observation-api.test.ts`

- [ ] **Step 1: Write the failing precedence tests**

Add regression coverage for:

- config file sets observation port
- env overrides the file
- CLI `--ui-port` overrides both
- config file sets SQLite mode and file path
- CLI runtime still starts and observation commands still work against the resolved config

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/config test
pnpm --filter @llmscope/cli test
```

Expected: FAIL because the new assertions will describe precedence scenarios not yet locked into regression tests.

- [ ] **Step 3: Write minimal implementation**

Adjust config and CLI helpers only as needed to make the precedence model explicit and deterministic. Avoid adding new flags or alternate precedence rules.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/config test
pnpm --filter @llmscope/cli test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/config/tests/resolve-config.test.ts apps/cli/tests/observation-api.test.ts apps/cli/src/index.ts packages/config/src/index.ts
git commit -m "test: lock config precedence across commands"
```

---

### Task 4: Add Sample Config And Runtime Documentation

**Files:**

- Add: `examples/llmscope.yaml`
- Modify: `README.md`
- Modify: `docs/implementation-progress.md`

- [ ] **Step 1: Write the documentation first**

Create `examples/llmscope.yaml` with a realistic local setup:

```yaml
proxy:
  host: 127.0.0.1
  port: 8787
ui:
  enabled: true
  port: 8788
storage:
  mode: sqlite
  sqlite:
    filePath: ./data/llmscope.db
privacy:
  mode: balanced
routes:
  - id: default
    targetBaseUrl: https://api.openai.com
    rewriteHost: true
```

Update `README.md` to show:

- config-file startup
- default discovery behavior
- when to use CLI overrides

- [ ] **Step 2: Verify docs against implementation**

Run:

```bash
node apps/cli/dist/index.js doctor --config ./examples/llmscope.yaml
```

Expected: the command either succeeds against a built CLI artifact or clearly reveals that a rebuild is required before release docs are updated. If build output is missing, run the build in the next step before finalizing docs.

- [ ] **Step 3: Build artifacts if needed and finalize docs**

Run:

```bash
pnpm --filter @llmscope/cli build
node apps/cli/dist/index.js doctor --config ./examples/llmscope.yaml
```

Use the observed behavior to finalize README wording. Do not leave speculative docs behind.

- [ ] **Step 4: Commit**

```bash
git add examples/llmscope.yaml README.md docs/implementation-progress.md
git commit -m "docs: add config-driven runtime guidance"
```

---

### Task 5: Full Verification

**Files:**

- Verify: repository-wide behavior

- [ ] **Step 1: Run focused package tests**

Run:

```bash
pnpm --filter @llmscope/config test
pnpm --filter @llmscope/cli test
```

Expected: PASS

- [ ] **Step 2: Run workspace verification**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: PASS

- [ ] **Step 3: Review docs and example paths**

Run:

```bash
git diff -- README.md docs/implementation-progress.md docs/superpowers/plans/2026-03-22-config-runtime-hardening.md examples/llmscope.yaml packages/config/src/index.ts apps/cli/src/index.ts
```

Confirm the diff matches the planned scope and does not contain unrelated refactors.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/implementation-progress.md docs/superpowers/plans/2026-03-22-config-runtime-hardening.md examples/llmscope.yaml packages/config/src/index.ts packages/config/tests/resolve-config.test.ts apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "feat: harden config-driven runtime workflows"
```
