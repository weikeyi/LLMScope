import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import { SqliteSessionStore } from '../src/index.js';

const tempDirectories: string[] = [];

const createTempDbPath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'llmscope-storage-sqlite-'));
  tempDirectories.push(directory);
  return join(directory, 'sessions.db');
};

const createSession = (overrides: Partial<Session> = {}): Session => ({
  id: overrides.id ?? 'session-1',
  status: overrides.status ?? 'completed',
  startedAt: overrides.startedAt ?? '2025-01-01T00:00:00.000Z',
  transport: overrides.transport ?? {
    mode: 'proxy',
    protocol: 'http',
    method: 'POST',
    url: 'https://api.example.test/v1/chat/completions',
    host: 'api.example.test',
    path: '/v1/chat/completions',
    statusCode: 200,
    durationMs: 120,
  },
  routing: overrides.routing ?? {
    upstreamBaseUrl: 'https://api.example.test',
    routeId: 'default',
    matchedProvider: 'openai',
    matchedEndpoint: 'chat.completions',
    confidence: 0.98,
  },
  request: overrides.request ?? {
    headers: {
      'content-type': 'application/json',
    },
  },
  ...(overrides.endedAt !== undefined ? { endedAt: overrides.endedAt } : {}),
  ...(overrides.response !== undefined ? { response: overrides.response } : {}),
  ...(overrides.normalized !== undefined
    ? { normalized: overrides.normalized }
    : {
        normalized: {
          provider: 'openai',
          apiStyle: 'chat.completions',
          model: 'gpt-4.1-mini',
          stream: false,
        },
      }),
  ...(overrides.streamEvents !== undefined ? { streamEvents: overrides.streamEvents } : {}),
  ...(overrides.warnings !== undefined ? { warnings: overrides.warnings } : {}),
  ...(overrides.error !== undefined ? { error: overrides.error } : {}),
});

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('SqliteSessionStore', () => {
  it('persists sessions and loads them back by id', async () => {
    const store = new SqliteSessionStore({ filePath: createTempDbPath() });
    const session = createSession();

    try {
      await store.saveSession(session);
      await expect(store.getSession(session.id)).resolves.toEqual(session);
    } finally {
      store.close();
    }
  });

  it('appends stream events to an existing session', async () => {
    const store = new SqliteSessionStore({ filePath: createTempDbPath() });
    const session = createSession({ streamEvents: [] });

    try {
      await store.saveSession(session);
      await store.appendStreamEvent(session.id, {
        id: 'event-1',
        sessionId: session.id,
        ts: Date.parse('2025-01-01T00:00:01.000Z'),
        eventType: 'delta',
        rawJson: { delta: 'hi' },
      });

      await expect(store.getSession(session.id)).resolves.toMatchObject({
        streamEvents: [
          {
            id: 'event-1',
            eventType: 'delta',
          },
        ],
      });
    } finally {
      store.close();
    }
  });

  it('filters session summaries using the same query semantics as memory storage', async () => {
    const store = new SqliteSessionStore({ filePath: createTempDbPath() });

    try {
      await store.saveSession(
        createSession({
          id: 'session-1',
          startedAt: '2025-01-01T00:00:00.000Z',
          normalized: {
            provider: 'openai',
            apiStyle: 'chat.completions',
            model: 'gpt-4.1-mini',
            stream: false,
          },
        }),
      );
      await store.saveSession(
        createSession({
          id: 'session-2',
          status: 'error',
          startedAt: '2025-01-02T00:00:00.000Z',
          transport: {
            mode: 'proxy',
            protocol: 'http',
            method: 'POST',
            url: 'https://api.example.test/v1/messages',
            host: 'api.example.test',
            path: '/v1/messages',
            statusCode: 500,
            durationMs: 210,
          },
          routing: {
            upstreamBaseUrl: 'https://api.example.test',
            routeId: 'default',
            matchedProvider: 'anthropic',
            matchedEndpoint: 'messages',
            confidence: 0.97,
          },
          normalized: {
            provider: 'anthropic',
            apiStyle: 'messages',
            model: 'claude-3-7-sonnet',
            stream: true,
          },
        }),
      );

      await expect(store.listSessions({ provider: 'anthropic' })).resolves.toEqual([
        expect.objectContaining({
          id: 'session-2',
          provider: 'anthropic',
          model: 'claude-3-7-sonnet',
        }),
      ]);
      await expect(store.listSessions({ search: '/v1/chat' })).resolves.toEqual([
        expect.objectContaining({ id: 'session-1' }),
      ]);
    } finally {
      store.close();
    }
  });

  it('deletes and clears persisted sessions', async () => {
    const store = new SqliteSessionStore({ filePath: createTempDbPath() });

    try {
      await store.saveSession(createSession({ id: 'session-1' }));
      await store.saveSession(createSession({ id: 'session-2' }));

      await store.deleteSession('session-1');
      await expect(store.getSession('session-1')).resolves.toBeNull();

      await store.clearAll();
      await expect(store.listSessions()).resolves.toEqual([]);
    } finally {
      store.close();
    }
  });

  it('evicts the least recently accessed session when maxSessions is exceeded', async () => {
    const store = new SqliteSessionStore({
      filePath: createTempDbPath(),
      maxSessions: 2,
    });

    try {
      await store.saveSession(createSession({ id: 'session-1' }));
      await store.saveSession(createSession({ id: 'session-2' }));
      await store.getSession('session-1');
      await store.saveSession(createSession({ id: 'session-3' }));

      await expect(store.getSession('session-1')).resolves.not.toBeNull();
      await expect(store.getSession('session-2')).resolves.toBeNull();
      await expect(store.getSession('session-3')).resolves.not.toBeNull();
    } finally {
      store.close();
    }
  });
});
