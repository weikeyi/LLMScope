import { describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import { diffSessions } from '../src/index.js';

const createSession = (overrides: Partial<Session> = {}): Session => ({
  id: overrides.id ?? 'session-1',
  status: overrides.status ?? 'completed',
  startedAt: overrides.startedAt ?? '2026-03-20T10:00:00.000Z',
  endedAt: overrides.endedAt ?? '2026-03-20T10:00:00.250Z',
  transport: {
    mode: 'proxy',
    protocol: 'http',
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions',
    host: 'api.openai.com',
    path: '/v1/chat/completions',
    statusCode: 200,
    durationMs: 250,
    ...(overrides.transport ?? {}),
  },
  routing: {
    routeId: 'default',
    upstreamBaseUrl: 'https://api.openai.com',
    matchedProvider: 'openai',
    matchedEndpoint: 'chat.completions',
    confidence: 0.99,
    ...(overrides.routing ?? {}),
  },
  request: {
    headers: {
      authorization: 'Bearer [redacted]',
      'content-type': 'application/json',
    },
    contentType: 'application/json',
    bodyJson: {
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
    },
    ...(overrides.request ?? {}),
  },
  response: {
    headers: {
      'content-type': 'application/json',
    },
    contentType: 'application/json',
    bodyJson: {
      id: 'resp_123',
      choices: [{ message: { role: 'assistant', content: 'hi' } }],
    },
    ...(overrides.response ?? {}),
  },
  normalized: {
    provider: 'openai',
    apiStyle: 'chat.completions',
    model: 'gpt-4.1-mini',
    stream: false,
    output: { text: 'hi' },
    usage: {
      inputTokens: 10,
      outputTokens: 12,
      totalTokens: 22,
    },
    ...(overrides.normalized ?? {}),
  },
  ...(overrides.warnings !== undefined ? { warnings: overrides.warnings } : {}),
});

describe('@llmscope/replay session diff', () => {
  it('reports structured changes across transport, model, output, and warnings', () => {
    const previous = createSession({
      id: 'session-1',
      warnings: ['slow upstream'],
    });
    const selected = createSession({
      id: 'session-2',
      transport: {
        mode: 'proxy',
        protocol: 'http',
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        host: 'api.openai.com',
        path: '/v1/chat/completions',
        statusCode: 429,
        durationMs: 600,
      },
      normalized: {
        provider: 'openai',
        apiStyle: 'chat.completions',
        model: 'gpt-4.1',
        stream: false,
        output: { text: 'rate limited' },
        usage: {
          inputTokens: 12,
          outputTokens: 0,
          totalTokens: 12,
        },
      },
      warnings: ['retry suggested'],
    });

    expect(diffSessions(previous, selected)).toEqual({
      leftSessionId: 'session-1',
      rightSessionId: 'session-2',
      changes: [
        {
          label: 'HTTP status',
          path: 'transport.statusCode',
          left: '200',
          right: '429',
        },
        {
          label: 'Duration',
          path: 'transport.durationMs',
          left: '250ms',
          right: '600ms',
        },
        {
          label: 'Model',
          path: 'normalized.model',
          left: 'gpt-4.1-mini',
          right: 'gpt-4.1',
        },
        {
          label: 'Output text',
          path: 'normalized.output.text',
          left: 'hi',
          right: 'rate limited',
        },
        {
          label: 'Warnings',
          path: 'warnings',
          left: 'slow upstream',
          right: 'retry suggested',
        },
      ],
    });
  });
});
