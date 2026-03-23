# CLI Management Commands and Observation API Write Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `llmscope-cli clear` plus observation API delete/clear endpoints so users can remove one session or wipe all sessions through stable CLI and HTTP flows.

**Architecture:** Keep the existing single-file CLI entrypoint for now, but carve out small helper functions inside `apps/cli/src/index.ts` for command parsing and observation API write handling. Reuse the existing `SessionStore` contract (`deleteSession` and `clearAll`) rather than inventing new abstractions, and expose the new write operations through both HTTP endpoints and a non-long-running CLI command that targets the local observation API.

**Tech Stack:** TypeScript, Node.js HTTP server, Fetch API, Vitest, existing `@llmscope/core` SessionStore contract, existing memory and SQLite store implementations.

---

## File Map

- Modify: `apps/cli/src/index.ts`
  - Add `clear` command parsing
  - Extend top-level help text so `clear` appears in `generalUsage`
  - Add reusable observation API client helpers for CLI management commands
  - Add `DELETE /api/sessions/:id` and `DELETE /api/sessions?confirm=true`
  - Keep current `start` and `doctor` behavior intact
- Modify: `apps/cli/tests/observation-api.test.ts`
  - Add command parsing tests for `clear`
  - Add observation API integration tests for deleting one session and clearing all sessions
  - Add CLI-side tests for `clear` request behavior and failure modes
- Modify: `docs/implementation-progress.md`
  - Mark `clear` and observation API write operations as completed once implementation is finished

No new packages are needed. No storage package changes are needed because both existing stores already implement `deleteSession()` and `clearAll()`.

---

### Task 1: Add `clear` Command Parsing

**Files:**

- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/observation-api.test.ts`

- [ ] **Step 1: Write the failing command parsing test**

Add a test in `apps/cli/tests/observation-api.test.ts` near the existing `parseCommand` tests:

```ts
it('parses the clear subcommand with optional target arguments', () => {
  expect(
    parseCommand([
      'clear',
      '--config',
      './llmscope.yaml',
      '--host',
      '127.0.0.1',
      '--ui-port',
      '9001',
      '--session-id',
      'session-123',
    ]),
  ).toEqual({
    kind: 'clear',
    configFilePath: './llmscope.yaml',
    target: {
      host: '127.0.0.1',
      port: 9001,
    },
    sessionId: 'session-123',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "parses the clear subcommand"
```

Expected: FAIL because `parseCommand()` does not return a `clear` command yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/cli/src/index.ts`:

- Add:

```ts
export interface ClearCommand {
  kind: 'clear';
  target: {
    host: string;
    port: number;
  };
  sessionId?: string;
}
```

- Extend `CliCommand`:

```ts
export type CliCommand = StartCommand | DoctorCommand | ClearCommand;
```

- Add parsing helper logic for:
  - `--config`
  - `--host`
  - `--ui-port`
  - `--session-id`
  - `--help`

- Add a clear usage string:

```ts
const clearUsage =
  'Usage: llmscope-cli clear [--host <host>] [--ui-port <port>] [--session-id <id>]';
```

- In `parseCommand()`, add:

```ts
if (command === 'clear') {
  return parseClearCommand(rest);
}
```

`clear` must follow the same config precedence model as the rest of the CLI: defaults < config file < env < CLI flags. For this slice, support `--config`, then let `--host` and `--ui-port` override the resolved observation target.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "parses the clear subcommand"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "feat: add clear command parsing"
```

---

### Task 2: Add Observation API Delete-One Endpoint

**Files:**

- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/observation-api.test.ts`

- [ ] **Step 1: Write the failing HTTP integration test**

Add a new test in `apps/cli/tests/observation-api.test.ts`:

```ts
it('deletes a single session through the observation api', async () => {
  // Start runtime with observationPort: 0
  // Send one proxied request to create a session
  // GET /api/sessions and capture the session id
  // DELETE /api/sessions/:id
  // GET /api/sessions again and assert empty
  // GET /api/sessions/:id and assert 404
});
```

Use the same upstream fixture style already used by the existing observation API tests. Keep the test narrow: create exactly one session, delete exactly one session, verify the result.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "deletes a single session through the observation api"
```

Expected: FAIL with `405 Method not allowed` because the observation API currently only allows `GET` and `OPTIONS`.

- [ ] **Step 3: Write minimal implementation**

In `apps/cli/src/index.ts` inside `createObservationServer()`:

- Update CORS methods to include `DELETE`

```ts
response.setHeader('access-control-allow-methods', 'GET, DELETE, OPTIONS');
```

- Update any existing test assertions that still expect `GET, OPTIONS` so the suite stays coherent after the route change.

- Replace the current hardcoded request-method gate with route-aware handling:
  - `GET /health`
  - `GET /api/sessions`
  - `GET /api/sessions/:id`
  - `DELETE /api/sessions/:id`

- Add a helper:

```ts
const sendNoContent = (response: ServerResponse): void => {
  response.statusCode = 204;
  response.end();
};
```

- For `DELETE /api/sessions/:id`:

```ts
await store.deleteSession(sessionId);
sendNoContent(response);
return;
```

Do not add special-case “not found” behavior for delete. Keep it idempotent and always return `204`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "deletes a single session through the observation api"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "feat: add observation api session delete"
```

---

### Task 3: Add Observation API Clear-All Endpoint

**Files:**

- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/observation-api.test.ts`

- [ ] **Step 1: Write the failing clear-all integration test**

Add a new test in `apps/cli/tests/observation-api.test.ts`:

```ts
it('clears all sessions through the observation api when confirm=true is provided', async () => {
  // Start runtime
  // Create two sessions
  // DELETE /api/sessions without confirm and expect 400
  // DELETE /api/sessions?confirm=true and expect 204
  // GET /api/sessions and expect []
});
```

The test must explicitly verify the guardrail behavior. This matters because accidental full deletion is destructive.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "clears all sessions through the observation api"
```

Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/cli/src/index.ts` inside `createObservationServer()`:

- Add route handling for `DELETE /api/sessions`
- Require `confirm=true` in the query string

Implementation shape:

```ts
if (requestUrl.pathname === '/api/sessions' && request.method === 'DELETE') {
  if (requestUrl.searchParams.get('confirm') !== 'true') {
    sendBadRequest(response, 'Missing confirm=true query parameter.');
    return;
  }

  await store.clearAll();
  sendNoContent(response);
  return;
}
```

Keep the message exact so tests stay deterministic.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "clears all sessions through the observation api"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "feat: add observation api clear all"
```

---

### Task 4: Implement `llmscope-cli clear` Against the Observation API

**Files:**

- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/observation-api.test.ts`

- [ ] **Step 1: Write the failing command execution tests**

Add two tests in `apps/cli/tests/observation-api.test.ts`:

```ts
it('clear command deletes a single session through the observation api', async () => {
  // start runtime
  // create one captured session
  // call runCli(['clear', '--host', observationHost, '--ui-port', String(observationPort), '--session-id', sessionId])
  // assert the session detail endpoint now returns 404
});

it('clear command clears all sessions when no session id is provided', async () => {
  // start runtime
  // create two sessions
  // call runCli(['clear', '--host', observationHost, '--ui-port', String(observationPort)])
  // assert GET /api/sessions returns []
});
```

If needed, extract a small test helper in the same test file to create sessions by issuing proxied requests.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "clear command"
```

Expected: FAIL because `runCli()` does not handle `clear` yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/cli/src/index.ts`:

- Add a small HTTP client helper:

```ts
const sendObservationDelete = async (
  target: { host: string; port: number },
  sessionId?: string,
): Promise<void> => {
  const path =
    sessionId === undefined
      ? '/api/sessions?confirm=true'
      : `/api/sessions/${encodeURIComponent(sessionId)}`;

  const response = await fetch(`http://${target.host}:${target.port}${path}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 204) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ??
        `Observation API request failed with status ${response.status}.`,
    );
  }
};
```

- In `runCli()` add the `clear` branch before `start` handling:

```ts
if (command.kind === 'clear') {
  await sendObservationDelete(command.target, command.sessionId);
  console.log(
    command.sessionId === undefined
      ? 'Cleared all sessions.'
      : `Cleared session ${command.sessionId}.`,
  );
  return;
}
```

Do not add confirmation prompts. This repository’s CLI guidance prefers direct execution; the API-level `confirm=true` already guards the destructive bulk path.

The `clear` command should resolve its target port from config when `--config` is provided:

```ts
const resolvedConfig = resolveConfig({
  filePath: command.configFilePath,
  overrides: {
    ui: {
      ...(command.target.portOverride !== undefined
        ? { port: command.target.portOverride }
        : {}),
    },
    proxy: {
      ...(command.target.hostOverride !== undefined
        ? { host: command.target.hostOverride }
        : {}),
    },
  },
});
```

Use the resolved host/port for the observation API request so non-default local setups work correctly.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "clear command"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "feat: add clear cli command"
```

---

### Task 5: Harden `clear` Error Handling and Help Output

**Files:**

- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/observation-api.test.ts`

- [ ] **Step 1: Write the failing tests for clear edge cases**

Add tests covering:

```ts
it('clear command shows help for --help', () => {
  expect(() => parseCommand(['clear', '--help'])).toThrow(
    'Usage: llmscope-cli clear [--host <host>] [--ui-port <port>] [--session-id <id>]',
  );
});

it('clear command fails when observation api is unreachable', async () => {
  await expect(
    runCli(['clear', '--host', '127.0.0.1', '--ui-port', '1']),
  ).rejects.toThrow();
});
```

Use port `1` or another obviously unavailable local port in the unreachable test to keep it deterministic.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "clear command"
```

Expected: At least one FAIL from missing clear help or missing clear-specific runtime behavior.

- [ ] **Step 3: Write minimal implementation**

In `apps/cli/src/index.ts`:

- Make sure `parseClearCommand()` handles `--help`
- Make sure network errors from `fetch()` bubble up with a clear message:

```ts
try {
  await sendObservationDelete(command.target, command.sessionId);
} catch (error) {
  throw new Error(
    error instanceof Error
      ? `Failed to clear sessions: ${error.message}`
      : 'Failed to clear sessions.',
  );
}
```

Keep the implementation minimal. Do not add retries, spinners, or interactive prompts.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @llmscope/cli test -- -t "clear command"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts
git commit -m "test: cover clear command edge cases"
```

---

### Task 6: Update Progress Documentation

**Files:**

- Modify: `docs/implementation-progress.md`

- [ ] **Step 1: Write the doc assertions as a checklist in the plan branch**

Update these sections in `docs/implementation-progress.md`:

- `apps/cli` row in “当前实现清单”
- Phase D “已完成 / 部分完成 / 未完成” checkboxes
- “建议的下一阶段开发顺序” if it still says `clear` is not implemented

Target content should reflect:

- `start` and `doctor` already exist
- `clear` now exists
- observation API now supports single delete and clear-all

- [ ] **Step 2: Run a focused readback check**

Run:

```bash
grep -n "clear\|DELETE /api/sessions\|apps/cli" docs/implementation-progress.md
```

Expected: Output shows updated CLI and API progress lines.

- [ ] **Step 3: Write minimal documentation update**

Keep the wording factual. Do not claim `export` is done.

- [ ] **Step 4: Verify docs and tests together**

Run:

```bash
pnpm --filter @llmscope/cli test && pnpm --filter @llmscope/cli typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/implementation-progress.md
git commit -m "docs: update cli management progress"
```

---

### Task 7: Final Validation

**Files:**

- Verify: `apps/cli/src/index.ts`
- Verify: `apps/cli/tests/observation-api.test.ts`
- Verify: `docs/implementation-progress.md`

- [ ] **Step 1: Run focused CLI tests**

Run:

```bash
pnpm --filter @llmscope/cli test
```

Expected: PASS with all CLI tests green.

- [ ] **Step 2: Run full repository tests**

Run:

```bash
pnpm test
```

Expected: PASS

- [ ] **Step 3: Run full repository typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 4: Manually sanity-check command examples**

Run:

```bash
pnpm --filter @llmscope/cli build && node apps/cli/dist/index.js doctor
```

Expected: Prints `[ok]` / `[fail]` lines and `Doctor overall status: ...`

Then verify help text:

```bash
node apps/cli/dist/index.js clear --help
```

Expected: exits non-zero and prints clear usage text.

- [ ] **Step 5: Commit final cleanups**

```bash
git add apps/cli/src/index.ts apps/cli/tests/observation-api.test.ts docs/implementation-progress.md
git commit -m "feat: add cli clear management flow"
```

---

## Notes for the Implementer

- Reuse the existing `SessionStore` methods; do not add a new service layer unless a test proves you need it.
- Keep HTTP delete endpoints idempotent.
- Use `observationPort: 0` in runtime integration tests unless a fixed port is explicitly required.
- Keep the implementation inside `apps/cli/src/index.ts` for this slice. If the file becomes too hard to follow during implementation, a small targeted extraction like `apps/cli/src/observation-client.ts` is acceptable, but do not do that preemptively.
- Do not implement `export` in this plan.
- Do not add Web UI delete/clear buttons in this plan.
