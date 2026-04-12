import { describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import {
  getExportContentType,
  serializeExport,
} from '../src/index.js';

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
      authorization: 'Bearer super-secret-token',
      'x-api-key': 'sk-top-secret',
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
    inputMessages: [{ role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
    output: { text: 'hi' },
    usage: {
      inputTokens: 10,
      outputTokens: 12,
      totalTokens: 22,
    },
    ...(overrides.normalized ?? {}),
  },
  ...(overrides.streamEvents !== undefined
    ? { streamEvents: overrides.streamEvents }
    : {}),
  ...(overrides.warnings !== undefined ? { warnings: overrides.warnings } : {}),
  ...(overrides.error !== undefined ? { error: overrides.error } : {}),
});

describe('@llmscope/replay export serializers', () => {
  it('serializes markdown exports with redacted secrets by default', () => {
    const markdown = serializeExport(
      { format: 'markdown' },
      [createSession(), createSession({ id: 'session-2' })],
    );

    expect(markdown).toMatchInlineSnapshot(`
      "# LLMScope Export

      ## Session session-1

      - Method: POST
      - Path: /v1/chat/completions
      - Status: completed
      - Provider: openai
      - API style: chat.completions
      - Model: gpt-4.1-mini

      \`\`\`json
      {
        "id": "session-1",
        "status": "completed",
        "startedAt": "2026-03-20T10:00:00.000Z",
        "endedAt": "2026-03-20T10:00:00.250Z",
        "transport": {
          "mode": "proxy",
          "protocol": "http",
          "method": "POST",
          "url": "https://api.openai.com/v1/chat/completions",
          "host": "api.openai.com",
          "path": "/v1/chat/completions",
          "statusCode": 200,
          "durationMs": 250
        },
        "routing": {
          "routeId": "default",
          "upstreamBaseUrl": "https://api.openai.com",
          "matchedProvider": "openai",
          "matchedEndpoint": "chat.completions",
          "confidence": 0.99
        },
        "request": {
          "headers": {
            "authorization": "[redacted]",
            "x-api-key": "[redacted]",
            "content-type": "application/json"
          },
          "contentType": "application/json",
          "bodyJson": {
            "model": "gpt-4.1-mini",
            "messages": [
              {
                "role": "user",
                "content": "hello"
              }
            ]
          }
        },
        "response": {
          "headers": {
            "content-type": "application/json"
          },
          "contentType": "application/json",
          "bodyJson": {
            "id": "resp_123",
            "choices": [
              {
                "message": {
                  "role": "assistant",
                  "content": "hi"
                }
              }
            ]
          }
        },
        "normalized": {
          "provider": "openai",
          "apiStyle": "chat.completions",
          "model": "gpt-4.1-mini",
          "stream": false,
          "inputMessages": [
            {
              "role": "user",
              "parts": [
                {
                  "type": "text",
                  "text": "hello"
                }
              ]
            }
          ],
          "output": {
            "text": "hi"
          },
          "usage": {
            "inputTokens": 10,
            "outputTokens": 12,
            "totalTokens": 22
          }
        }
      }
      \`\`\`
      ## Session session-2

      - Method: POST
      - Path: /v1/chat/completions
      - Status: completed
      - Provider: openai
      - API style: chat.completions
      - Model: gpt-4.1-mini

      \`\`\`json
      {
        "id": "session-2",
        "status": "completed",
        "startedAt": "2026-03-20T10:00:00.000Z",
        "endedAt": "2026-03-20T10:00:00.250Z",
        "transport": {
          "mode": "proxy",
          "protocol": "http",
          "method": "POST",
          "url": "https://api.openai.com/v1/chat/completions",
          "host": "api.openai.com",
          "path": "/v1/chat/completions",
          "statusCode": 200,
          "durationMs": 250
        },
        "routing": {
          "routeId": "default",
          "upstreamBaseUrl": "https://api.openai.com",
          "matchedProvider": "openai",
          "matchedEndpoint": "chat.completions",
          "confidence": 0.99
        },
        "request": {
          "headers": {
            "authorization": "[redacted]",
            "x-api-key": "[redacted]",
            "content-type": "application/json"
          },
          "contentType": "application/json",
          "bodyJson": {
            "model": "gpt-4.1-mini",
            "messages": [
              {
                "role": "user",
                "content": "hello"
              }
            ]
          }
        },
        "response": {
          "headers": {
            "content-type": "application/json"
          },
          "contentType": "application/json",
          "bodyJson": {
            "id": "resp_123",
            "choices": [
              {
                "message": {
                  "role": "assistant",
                  "content": "hi"
                }
              }
            ]
          }
        },
        "normalized": {
          "provider": "openai",
          "apiStyle": "chat.completions",
          "model": "gpt-4.1-mini",
          "stream": false,
          "inputMessages": [
            {
              "role": "user",
              "parts": [
                {
                  "type": "text",
                  "text": "hello"
                }
              ]
            }
          ],
          "output": {
            "text": "hi"
          },
          "usage": {
            "inputTokens": 10,
            "outputTokens": 12,
            "totalTokens": 22
          }
        }
      }
      \`\`\`"
    `);
    expect(markdown).not.toContain('super-secret-token');
    expect(markdown).not.toContain('sk-top-secret');
  });

  it('keeps content types aligned with the selected export format', () => {
    expect(getExportContentType('json')).toBe('application/json; charset=utf-8');
    expect(getExportContentType('ndjson')).toBe(
      'application/x-ndjson; charset=utf-8',
    );
    expect(getExportContentType('markdown')).toBe(
      'text/markdown; charset=utf-8',
    );
  });
});
