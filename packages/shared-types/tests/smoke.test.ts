import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  CanonicalMessage,
  Session,
  SessionSummary,
  WsEvent,
} from '../src/index.js';

const session: Session = {
  id: 'session-1',
  status: 'completed',
  startedAt: '2026-03-08T00:00:00.000Z',
  endedAt: '2026-03-08T00:00:01.000Z',
  transport: {
    mode: 'gateway',
    protocol: 'sse',
    method: 'POST',
    url: 'http://127.0.0.1:8787/v1/responses',
    host: '127.0.0.1:8787',
    path: '/v1/responses',
    statusCode: 200,
    durationMs: 1000,
    firstByteAtMs: 120,
  },
  routing: {
    routeId: 'default',
    upstreamBaseUrl: 'https://api.openai.com',
    matchedProvider: 'openai',
    matchedEndpoint: 'responses',
    confidence: 0.99,
  },
  request: {
    headers: {
      authorization: 'Bearer ***',
      'content-type': 'application/json',
    },
    bodyJson: {
      model: 'gpt-4.1-mini',
    },
  },
  normalized: {
    provider: 'openai',
    apiStyle: 'responses',
    model: 'gpt-4.1-mini',
    stream: true,
  },
  warnings: ['redacted authorization header'],
};

const projectSummary = (value: Session): SessionSummary => {
  const summary: SessionSummary = {
    id: value.id,
    status: value.status,
    startedAt: value.startedAt,
    method: value.transport.method,
    path: value.transport.path,
    warningCount: value.warnings?.length ?? 0,
  };

  if (value.endedAt !== undefined) {
    summary.endedAt = value.endedAt;
  }

  if (value.normalized?.provider !== undefined) {
    summary.provider = value.normalized.provider;
  }

  if (value.normalized?.model !== undefined) {
    summary.model = value.normalized.model;
  }

  if (value.transport.statusCode !== undefined) {
    summary.statusCode = value.transport.statusCode;
  }

  if (value.transport.durationMs !== undefined) {
    summary.durationMs = value.transport.durationMs;
  }

  if (value.normalized?.stream !== undefined) {
    summary.stream = value.normalized.stream;
  }

  if (value.error?.code !== undefined) {
    summary.errorCode = value.error.code;
  }

  return summary;
};

describe('@llmscope/shared-types', () => {
  it('supports session and ws event discriminated unions', () => {
    const event: WsEvent = {
      type: 'session:error',
      sessionId: session.id,
      error: {
        code: 'UPSTREAM_TIMEOUT',
        phase: 'upstream',
        message: 'timed out',
      },
    };

    expectTypeOf(session.status).toEqualTypeOf<
      'pending' | 'streaming' | 'completed' | 'error'
    >();

    if (event.type === 'session:error') {
      expect(event.error.code).toBe('UPSTREAM_TIMEOUT');
      expectTypeOf(event.error.phase).toEqualTypeOf<
        'request' | 'routing' | 'upstream' | 'stream' | 'storage' | 'ui'
      >();
    }
  });

  it('supports canonical part narrowing', () => {
    const message: CanonicalMessage = {
      role: 'assistant',
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'tool_call', name: 'search', arguments: '{"q":"llm"}' },
        { type: 'tool_result', name: 'search', content: 'done' },
      ],
    };

    const [textPart, toolCallPart, toolResultPart] = message.parts;

    if (textPart?.type === 'text') {
      expect(textPart.text).toBe('hello');
    }

    if (toolCallPart?.type === 'tool_call') {
      expectTypeOf(toolCallPart.arguments).toEqualTypeOf<
        string | Record<string, unknown> | undefined
      >();
    }

    if (toolResultPart?.type === 'tool_result') {
      expect(toolResultPart.content).toBe('done');
    }
  });

  it('projects a session into the list summary shape', () => {
    const summary = projectSummary(session);

    expect(summary).toEqual({
      id: 'session-1',
      status: 'completed',
      startedAt: '2026-03-08T00:00:00.000Z',
      endedAt: '2026-03-08T00:00:01.000Z',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      method: 'POST',
      path: '/v1/responses',
      statusCode: 200,
      durationMs: 1000,
      stream: true,
      warningCount: 1,
      errorCode: undefined,
    });
  });
});
