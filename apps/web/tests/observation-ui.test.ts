import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import { loadObservationPageData, renderObservationPage, toObservationFilters } from '../src/index.js';

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

const createObservationApiServer = async (): Promise<string> => {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
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

    response.statusCode = 404;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: 'Not found.' }));
  });

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

  it('renders a read-only list and detail view for sessions', () => {
    const markup = renderObservationPage({
      apiBaseUrl: 'http://127.0.0.1:8788',
      filters: {
        status: 'completed',
        search: '/chat',
        limit: 10,
      },
      selectedSessionId: 'session-1',
      sessions: fixtureSessions,
      selectedSession: fixtureDetail,
    });

    expect(markup).toContain('LLMScope observation UI');
    expect(markup).toContain('Filters');
    expect(markup).toContain('session-1');
    expect(markup).toContain('Normalized exchange');
    expect(markup).toContain('Stream events');
    expect(markup).toContain('output_text');
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
});
