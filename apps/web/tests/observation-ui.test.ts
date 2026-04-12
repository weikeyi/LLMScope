import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import {
  createObservationUiServer,
  loadObservationPageData,
  parseObservationUiArgs,
  renderObservationPage,
  toObservationFilters,
} from '../src/index.js';

const startedServers: Array<{ close: () => Promise<void> }> = [];

const listen = async (
  server: Server,
): Promise<{ host: string; port: number; close: () => Promise<void> }> => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('Server address unavailable.');
  }

  return {
    host: address.address,
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined && error !== null) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};

const fixtureSessions = [
  {
    id: 'session-2',
    status: 'streaming',
    startedAt: '2026-03-15T12:00:00.000Z',
    provider: 'anthropic',
    model: 'claude-3-7-sonnet',
    method: 'POST',
    path: '/v1/messages',
    statusCode: 200,
    durationMs: 140,
    stream: true,
    warningCount: 1,
  },
  {
    id: 'session-1',
    status: 'completed',
    startedAt: '2026-03-15T11:00:00.000Z',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    method: 'POST',
    path: '/v1/chat/completions',
    statusCode: 200,
    durationMs: 80,
    stream: false,
    warningCount: 0,
  },
] as const;

const fixtureDetail: Session = {
  id: 'session-1',
  status: 'completed',
  startedAt: '2026-03-15T11:00:00.000Z',
  endedAt: '2026-03-15T11:00:00.080Z',
  transport: {
    mode: 'proxy',
    protocol: 'http',
    method: 'POST',
    url: 'http://127.0.0.1:8788/v1/chat/completions',
    host: '127.0.0.1:8788',
    path: '/v1/chat/completions',
    statusCode: 200,
    durationMs: 80,
    firstByteAtMs: 20,
  },
  routing: {
    upstreamBaseUrl: 'http://127.0.0.1:9000',
    routeId: 'default',
    matchedProvider: 'openai',
    matchedEndpoint: 'chat.completions',
    confidence: 0.99,
  },
  request: {
    headers: {
      'content-type': 'application/json',
    },
    contentType: 'application/json',
    sizeBytes: 52,
    bodyJson: {
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    },
  },
  response: {
    headers: {
      'content-type': 'application/json',
    },
    contentType: 'application/json',
    sizeBytes: 64,
    bodyJson: {
      id: 'resp-1',
      output_text: 'Hello there',
    },
  },
  normalized: {
    provider: 'openai',
    apiStyle: 'chat.completions',
    model: 'gpt-4.1-mini',
    stream: false,
    inputMessages: [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      },
    ],
    output: {
      text: 'Hello there',
    },
    usage: {
      inputTokens: 10,
      outputTokens: 12,
      totalTokens: 22,
    },
  },
  streamEvents: [
    {
      id: 'event-1',
      sessionId: 'session-1',
      ts: Date.parse('2026-03-15T11:00:00.030Z'),
      eventType: 'message_stop',
      rawJson: { done: true },
    },
  ],
  warnings: ['normalized output omitted finish reason'],
};

const fixtureComparisonDetail: Session = {
  id: 'session-2',
  status: 'streaming',
  startedAt: '2026-03-15T12:00:00.000Z',
  endedAt: '2026-03-15T12:00:00.140Z',
  transport: {
    mode: 'proxy',
    protocol: 'http',
    method: 'POST',
    url: 'http://127.0.0.1:8788/v1/chat/completions',
    host: '127.0.0.1:8788',
    path: '/v1/chat/completions',
    statusCode: 429,
    durationMs: 140,
    firstByteAtMs: 30,
  },
  routing: {
    upstreamBaseUrl: 'http://127.0.0.1:9000',
    routeId: 'default',
    matchedProvider: 'openai',
    matchedEndpoint: 'chat.completions',
    confidence: 0.99,
  },
  request: {
    headers: {
      authorization: 'Bearer comparison-secret',
      'content-type': 'application/json',
    },
    contentType: 'application/json',
    sizeBytes: 53,
    bodyJson: {
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Hello again' }],
    },
  },
  response: {
    headers: {
      'content-type': 'application/json',
    },
    contentType: 'application/json',
    sizeBytes: 72,
    bodyJson: {
      id: 'resp-2',
      error: { message: 'rate limited' },
    },
  },
  normalized: {
    provider: 'openai',
    apiStyle: 'chat.completions',
    model: 'gpt-4.1',
    stream: false,
    inputMessages: [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello again' }],
      },
    ],
    output: {
      text: 'rate limited',
    },
  },
  warnings: ['retry suggested'],
};

const createObservationApiServer = async (): Promise<string> => {
  const server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');

      if (url.pathname === '/api/sessions') {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(fixtureSessions));
        return;
      }

      if (url.pathname === '/api/sessions/session-1') {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(fixtureDetail));
        return;
      }

      if (url.pathname === '/api/sessions/session-2') {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(fixtureComparisonDetail));
        return;
      }

      response.statusCode = 404;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ error: 'Not found.' }));
    },
  );

  const address = await listen(server);
  startedServers.push(address);
  return `http://${address.host}:${address.port}`;
};

afterEach(async () => {
  while (startedServers.length > 0) {
    const server = startedServers.pop();

    if (server !== undefined) {
      await server.close();
    }
  }
});

describe('@llmscope/web filters', () => {
  it('normalizes filter inputs and applies the default limit', () => {
    expect(
      toObservationFilters({
        apiBaseUrl: 'http://127.0.0.1:8788',
        provider: ' openai ',
        model: ' gpt-4.1-mini ',
        search: ' /chat ',
        limit: 0,
      }),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      search: '/chat',
      limit: 25,
    });
  });
});

describe('@llmscope/web observation ui', () => {
  it('loads sessions and selected session detail from the observation API', async () => {
    const apiBaseUrl = await createObservationApiServer();
    const data = await loadObservationPageData({
      apiBaseUrl,
      status: 'completed',
      search: '/chat',
      selectedSessionId: 'session-1',
      limit: 10,
    });

    expect(data.filters).toEqual({
      status: 'completed',
      search: '/chat',
      limit: 10,
    });
    expect(data.sessions).toHaveLength(2);
    expect(data.selectedSession?.id).toBe('session-1');
    expect(data.selectedSession?.normalized?.provider).toBe('openai');
    expect(data.error).toBeUndefined();
  });

  it('loads previous-session comparisons and replay snippets for the selected session', async () => {
    const apiBaseUrl = await createObservationApiServer();
    const data = (await loadObservationPageData({
      apiBaseUrl,
      selectedSessionId: 'session-1',
      compareMode: 'previous',
    } as never)) as {
      comparison?: {
        mode: string;
        compareSessionId: string;
        diff: { changes: Array<{ path: string }> };
      };
      replayArtifacts?: Array<{ format: string; content: string }>;
    };

    expect(data.comparison?.mode).toBe('previous');
    expect(data.comparison?.compareSessionId).toBe('session-2');
    expect(data.comparison?.diff.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'transport.statusCode' }),
        expect.objectContaining({ path: 'normalized.model' }),
      ]),
    );
    expect(data.replayArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ format: 'curl' }),
        expect.objectContaining({ format: 'fetch' }),
        expect.objectContaining({ format: 'openai' }),
      ]),
    );
    expect(data.replayArtifacts?.[0]?.content).not.toContain(
      'comparison-secret',
    );
  });

  it('renders a read-only list and detail view for sessions', () => {
    const markup = renderObservationPage({
      apiBaseUrl: 'http://127.0.0.1:8788',
      filters: {
        status: 'completed',
        search: '/chat',
        limit: 10,
      },
      selectedSessionId: 'session-1',
      sessions: [...fixtureSessions],
      selectedSession: fixtureDetail,
    });

    expect(markup).toContain('LLMScope observation UI');
    expect(markup).toContain('Filters');
    expect(markup).toContain('session-1');
    expect(markup).toContain('Normalized exchange');
    expect(markup).toContain('Stream events');
    expect(markup).toContain('output_text');
    expect(markup).toContain('Apply filters');
    expect(markup).toContain('Refresh sessions');
    expect(markup).toContain('Delete session');
    expect(markup).toContain('Clear all');
    expect(markup).toContain('Export selected');
    expect(markup).toContain('This permanently deletes the selected session.');
    expect(markup).toContain('This permanently deletes every captured session.');
    expect(markup).toContain('Compare with previous session');
    expect(markup).toContain('Replay snippets');
    expect(markup).toContain('compareTo=session-2');
    expect(markup).toContain('Loading observation UI...');
    expect(markup).toContain('sessionId=session-1');
  });

  it('renders actionable empty states when there are no matching sessions', () => {
    const markup = renderObservationPage({
      apiBaseUrl: 'http://127.0.0.1:8788',
      filters: {
        search: '/missing',
        limit: 10,
      },
      selectedSessionId: null,
      sessions: [],
      selectedSession: null,
    });

    expect(markup).toContain('No captured sessions match these filters yet.');
    expect(markup).toContain('Adjust the filters or refresh to look for new traffic.');
    expect(markup).toContain('Select a session to inspect transport, normalized data, and raw payloads.');
  });

  it('reports a missing selected session without failing the page load', async () => {
    const apiBaseUrl = await createObservationApiServer();
    const data = await loadObservationPageData({
      apiBaseUrl,
      selectedSessionId: 'missing-session',
    });

    expect(data.selectedSession).toBeNull();
    expect(data.error).toContain('missing-session');
  });

  it('reports session loading failures as page errors', async () => {
    const data = await loadObservationPageData({
      apiBaseUrl: 'http://127.0.0.1:1',
      selectedSessionId: 'session-1',
    });

    expect(data.sessions).toEqual([]);
    expect(data.selectedSession).toBeNull();
    expect(data.error).toContain(
      'Could not load sessions from the observation API',
    );
  });

  it('parses observation UI CLI arguments', () => {
    expect(
      parseObservationUiArgs([
        '--api-base-url',
        'http://127.0.0.1:8788',
        '--host',
        '0.0.0.0',
        '--port',
        '3001',
      ]),
    ).toEqual({
      apiBaseUrl: 'http://127.0.0.1:8788/',
      host: '0.0.0.0',
      port: 3001,
    });
  });

  it('serves the observation UI through the runtime entrypoint', async () => {
    const apiBaseUrl = await createObservationApiServer();
    const server = createObservationUiServer({
      apiBaseUrl,
      host: '127.0.0.1',
      port: 0,
    });

    await server.start();

    try {
      const address = server.getAddress();
      const response = await fetch(
        `http://${address.host}:${address.port}/?status=completed&search=%2Fchat&sessionId=session-1`,
      );
      const html = await response.text();
      const health = await fetch(
        `http://${address.host}:${address.port}/health`,
      );

      expect(response.status).toBe(200);
      expect(html).toContain('LLMScope observation UI');
      expect(html).toContain('session-1');
      expect(html).toContain('Normalized exchange');
      expect(html).toContain('Apply filters');
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({ ok: true });
    } finally {
      await server.stop();
    }
  });

  it('normalizes observation websocket URLs from the API base URL', async () => {
    const { toRealtimeUrl } = await import('../src/ui/live-store.js');

    expect(toRealtimeUrl('http://127.0.0.1:8788/')).toBe(
      'ws://127.0.0.1:8788/ws',
    );
    expect(toRealtimeUrl('https://llmscope.local/')).toBe(
      'wss://llmscope.local/ws',
    );
  });

  it('serves live fragment payloads for the current operator view', async () => {
    const apiBaseUrl = await createObservationApiServer();
    const server = createObservationUiServer({
      apiBaseUrl,
      host: '127.0.0.1',
      port: 0,
    });

    await server.start();

    try {
      const address = server.getAddress();
      const response = await fetch(
        `http://${address.host}:${address.port}/__llmscope/fragment?sessionId=session-1`,
      );
      const payload = (await response.json()) as {
        selectedSessionId: string | null;
        sessionListHtml: string;
        sessionDetailHtml: string;
      };

      expect(response.status).toBe(200);
      expect(payload.selectedSessionId).toBe('session-1');
      expect(payload.sessionListHtml).toContain('session-row');
      expect(payload.sessionDetailHtml).toContain('Normalized exchange');
      expect(payload.sessionDetailHtml).toContain('Stream events');
    } finally {
      await server.stop();
    }
  });
});
