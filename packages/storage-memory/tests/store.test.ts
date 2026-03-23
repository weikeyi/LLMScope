import { describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import { MemorySessionStore } from '../src/index.js';

const createSession = (
  id: string,
  startedAt: string,
  provider?: string,
): Session => {
  const session: Session = {
    id,
    status: 'pending',
    startedAt,
    transport: {
      mode: 'gateway',
      protocol: 'http',
      method: 'POST',
      url: `http://127.0.0.1:8787/${id}`,
      host: '127.0.0.1:8787',
      path: `/${id}`,
    },
    routing: {},
    request: {
      headers: {
        'content-type': 'application/json',
      },
    },
  };

  if (provider !== undefined) {
    session.normalized = {
      provider,
      apiStyle: 'chat.completions',
      model: 'gpt-test',
    };
  }

  return session;
};

describe('@llmscope/storage-memory', () => {
  it('stores, updates, filters, and clears sessions', async () => {
    const store = new MemorySessionStore({ maxSessions: 10 });
    const alpha = createSession('alpha', '2026-03-08T10:00:00.000Z', 'openai');
    const beta = createSession('beta', '2026-03-08T10:00:01.000Z', 'anthropic');

    await store.saveSession(alpha);
    await store.saveSession(beta);

    await store.updateSession({
      ...alpha,
      status: 'completed',
      warnings: ['redacted'],
      transport: {
        ...alpha.transport,
        statusCode: 200,
        durationMs: 250,
      },
    });

    await store.appendStreamEvent('alpha', {
      id: 'event-1',
      sessionId: 'alpha',
      ts: 1,
      eventType: 'delta',
      rawLine: 'data: hello',
    });

    const completed = await store.listSessions({ status: 'completed' });
    const openai = await store.listSessions({
      provider: 'openai',
      search: '/alpha',
    });
    const storedAlpha = await store.getSession('alpha');

    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      id: 'alpha',
      status: 'completed',
      provider: 'openai',
      warningCount: 1,
      statusCode: 200,
    });
    expect(openai).toHaveLength(1);
    expect(storedAlpha?.streamEvents).toHaveLength(1);

    await store.deleteSession('beta');
    expect(await store.getSession('beta')).toBeNull();

    await store.clearAll();
    expect(await store.listSessions()).toEqual([]);
  });

  it('evicts the least recently used session when over capacity', async () => {
    const store = new MemorySessionStore({ maxSessions: 2 });

    await store.saveSession(
      createSession('first', '2026-03-08T10:00:00.000Z', 'openai'),
    );
    await store.saveSession(
      createSession('second', '2026-03-08T10:00:01.000Z', 'openai'),
    );

    await store.getSession('first');

    await store.saveSession(
      createSession('third', '2026-03-08T10:00:02.000Z', 'openai'),
    );

    expect(await store.getSession('first')).not.toBeNull();
    expect(await store.getSession('second')).toBeNull();
    expect(await store.getSession('third')).not.toBeNull();
  });

  it('returns newest-first summaries and respects model and limit filters', async () => {
    const store = new MemorySessionStore({ maxSessions: 10 });

    await store.saveSession(
      createSession('oldest', '2026-03-08T10:00:00.000Z', 'openai'),
    );
    await store.saveSession(
      createSession('middle', '2026-03-08T10:00:01.000Z', 'openai'),
    );
    await store.saveSession(
      createSession('newest', '2026-03-08T10:00:02.000Z', 'anthropic'),
    );

    const newestFirst = await store.listSessions();
    const limited = await store.listSessions({ limit: 2 });
    const byModel = await store.listSessions({ model: 'gpt-test' });

    expect(newestFirst.map((session) => session.id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
    expect(limited.map((session) => session.id)).toEqual(['newest', 'middle']);
    expect(byModel).toHaveLength(3);
  });
});
