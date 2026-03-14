import { describe, expect, it } from 'vitest';

import { openAiChatCompletionsPlugin } from '../src/providers/index.js';

describe('openAiChatCompletionsPlugin', () => {
  it('matches OpenAI chat completions requests with strongest confidence when model and messages exist', () => {
    const result = openAiChatCompletionsPlugin.match({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/chat/completions',
        host: 'localhost',
        path: '/v1/chat/completions',
        headers: {},
      },
      requestBody: {
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hi' }],
      },
    });

    expect(result).toEqual({
      provider: 'openai',
      apiStyle: 'chat.completions',
      confidence: 1,
      reasons: [
        'matched POST /v1/chat/completions',
        'found model field',
        'found messages array',
      ],
    });
  });

  it('does not match non-chat-completions routes', () => {
    expect(
      openAiChatCompletionsPlugin.match({
        request: {
          protocol: 'http',
          method: 'GET',
          url: 'http://localhost/v1/responses',
          host: 'localhost',
          path: '/v1/responses',
          headers: {},
        },
      }),
    ).toBeNull();
  });

  it('parses standard chat completions requests into canonical fields', () => {
    const result = openAiChatCompletionsPlugin.parseRequest({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/chat/completions',
        host: 'localhost',
        path: '/v1/chat/completions',
        headers: {},
      },
      rawRequest: {
        headers: {},
        bodyJson: {
          model: 'gpt-test',
          stream: true,
          temperature: 0.4,
          top_p: 0.8,
          max_tokens: 64,
          tool_choice: 'auto',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'lookup_weather',
                description: 'Lookup weather',
                parameters: { type: 'object' },
              },
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      exchange: {
        provider: 'openai',
        apiStyle: 'chat.completions',
        model: 'gpt-test',
        stream: true,
        temperature: 0.4,
        topP: 0.8,
        maxTokens: 64,
        toolChoice: 'auto',
        inputMessages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'hi' }],
            raw: { role: 'user', content: 'hi' },
          },
        ],
        tools: [
          {
            name: 'lookup_weather',
            description: 'Lookup weather',
            inputSchema: { type: 'object' },
            raw: {
              type: 'function',
              function: {
                name: 'lookup_weather',
                description: 'Lookup weather',
                parameters: { type: 'object' },
              },
            },
          },
        ],
      },
    });
  });

  it('parses standard non-stream chat completions responses into output and usage', () => {
    const result = openAiChatCompletionsPlugin.parseResponse({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/chat/completions',
        host: 'localhost',
        path: '/v1/chat/completions',
        headers: {},
      },
      rawRequest: {
        headers: {},
      },
      rawResponse: {
        headers: {},
        bodyJson: {
          model: 'gpt-test',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'Hello back',
              },
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 7,
            total_tokens: 12,
          },
        },
      },
      statusCode: 200,
    });

    expect(result).toEqual({
      exchange: {
        provider: 'openai',
        apiStyle: 'chat.completions',
        model: 'gpt-test',
        output: {
          text: 'Hello back',
          messages: [
            {
              role: 'assistant',
              parts: [{ type: 'text', text: 'Hello back' }],
              raw: {
                role: 'assistant',
                content: 'Hello back',
              },
            },
          ],
          finishReason: 'stop',
          raw: {
            model: 'gpt-test',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: 'Hello back',
                },
              },
            ],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 7,
              total_tokens: 12,
            },
          },
        },
        usage: {
          inputTokens: 5,
          outputTokens: 7,
          totalTokens: 12,
        },
      },
    });
  });

  it('parses SSE delta and done events', () => {
    const delta = openAiChatCompletionsPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/chat/completions',
        host: 'localhost',
        path: '/v1/chat/completions',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-1',
      sequence: 0,
      rawLine: '{"choices":[{"delta":{"content":"Hello"}}]}',
      rawJson: {
        choices: [{ delta: { content: 'Hello' } }],
      },
    });
    const done = openAiChatCompletionsPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/chat/completions',
        host: 'localhost',
        path: '/v1/chat/completions',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-2',
      sequence: 1,
      rawLine: '[DONE]',
    });

    expect(delta).toEqual({
      event: {
        id: 'event-1',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'delta',
        rawLine: '{"choices":[{"delta":{"content":"Hello"}}]}',
        rawJson: {
          choices: [{ delta: { content: 'Hello' } }],
        },
        normalized: {
          text: 'Hello',
        },
      },
    });
    expect(done).toEqual({
      event: {
        id: 'event-2',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'message_stop',
        rawLine: '[DONE]',
        normalized: { done: true },
      },
    });
  });

  it('returns warnings for malformed or partial payloads instead of throwing', () => {
    expect(
      openAiChatCompletionsPlugin.parseRequest({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/chat/completions',
          host: 'localhost',
          path: '/v1/chat/completions',
          headers: {},
        },
        rawRequest: {
          headers: {},
          bodyJson: 'not-an-object',
        },
      }),
    ).toEqual({
      warnings: ['Expected JSON object request body for OpenAI chat completions.'],
    });

    expect(
      openAiChatCompletionsPlugin.parseResponse({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/chat/completions',
          host: 'localhost',
          path: '/v1/chat/completions',
          headers: {},
        },
        rawRequest: {
          headers: {},
        },
        rawResponse: {
          headers: {},
          bodyJson: 'not-an-object',
        },
        statusCode: 200,
      }),
    ).toEqual({
      warnings: ['Expected JSON object response body for OpenAI chat completions.'],
    });

    expect(
      openAiChatCompletionsPlugin.parseStreamEvent?.({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/chat/completions',
          host: 'localhost',
          path: '/v1/chat/completions',
          headers: {},
        },
        sessionId: 'session-1',
        eventId: 'event-3',
        sequence: 2,
        rawLine: '{"choices":[{"delta":{}}]}',
        rawJson: {
          choices: [{ delta: {} }],
        },
      }),
    ).toEqual({
      event: {
        id: 'event-3',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'unknown',
        rawLine: '{"choices":[{"delta":{}}]}',
        rawJson: {
          choices: [{ delta: {} }],
        },
      },
      warnings: ['Unhandled OpenAI chat completions SSE event shape.'],
    });
  });
});
