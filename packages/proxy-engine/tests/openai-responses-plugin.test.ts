import { describe, expect, it } from 'vitest';

import { openAiResponsesPlugin } from '../src/providers/index.js';

describe('openAiResponsesPlugin', () => {
  it('matches OpenAI responses requests with strongest confidence when model and input exist', () => {
    const result = openAiResponsesPlugin.match({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/responses',
        host: 'localhost',
        path: '/v1/responses',
        headers: {},
      },
      requestBody: {
        model: 'gpt-4.1-mini',
        input: 'hi',
      },
    });

    expect(result).toEqual({
      provider: 'openai',
      apiStyle: 'responses',
      confidence: 1,
      reasons: [
        'matched POST /v1/responses',
        'found model field',
        'found input field',
      ],
    });
  });

  it('does not match non-responses routes', () => {
    expect(
      openAiResponsesPlugin.match({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/chat/completions',
          host: 'localhost',
          path: '/v1/chat/completions',
          headers: {},
        },
      }),
    ).toBeNull();
  });

  it('parses responses requests into canonical fields', () => {
    const result = openAiResponsesPlugin.parseRequest({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/responses',
        host: 'localhost',
        path: '/v1/responses',
        headers: {},
      },
      rawRequest: {
        headers: {},
        bodyJson: {
          model: 'gpt-4.1-mini',
          stream: true,
          temperature: 0.3,
          top_p: 0.7,
          max_output_tokens: 128,
          instructions: 'Be concise.',
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello there' }],
            },
          ],
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
          tool_choice: 'auto',
          text: { format: { type: 'json_schema' } },
        },
      },
    });

    expect(result).toEqual({
      exchange: {
        provider: 'openai',
        apiStyle: 'responses',
        model: 'gpt-4.1-mini',
        stream: true,
        temperature: 0.3,
        topP: 0.7,
        maxTokens: 128,
        instructions: [
          {
            role: 'system',
            parts: [{ type: 'text', text: 'Be concise.' }],
            raw: 'Be concise.',
          },
        ],
        inputMessages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'Hello there' }],
            raw: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello there' }],
            },
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
        toolChoice: 'auto',
        responseFormat: { format: { type: 'json_schema' } },
      },
    });
  });

  it('parses responses responses into output and usage', () => {
    const result = openAiResponsesPlugin.parseResponse({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/responses',
        host: 'localhost',
        path: '/v1/responses',
        headers: {},
      },
      rawRequest: {
        headers: {},
      },
      rawResponse: {
        headers: {},
        bodyJson: {
          model: 'gpt-4.1-mini',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Hello back' }],
            },
          ],
          usage: {
            input_tokens: 5,
            output_tokens: 7,
            total_tokens: 12,
            output_tokens_details: {
              reasoning_tokens: 2,
            },
          },
        },
      },
      statusCode: 200,
    });

    expect(result).toEqual({
      exchange: {
        provider: 'openai',
        apiStyle: 'responses',
        model: 'gpt-4.1-mini',
        output: {
          text: 'Hello back',
          finishReason: 'completed',
          messages: [
            {
              role: 'assistant',
              parts: [{ type: 'text', text: 'Hello back' }],
              raw: {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Hello back' }],
              },
            },
          ],
          raw: {
            model: 'gpt-4.1-mini',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Hello back' }],
              },
            ],
            usage: {
              input_tokens: 5,
              output_tokens: 7,
              total_tokens: 12,
              output_tokens_details: {
                reasoning_tokens: 2,
              },
            },
          },
        },
        usage: {
          inputTokens: 5,
          outputTokens: 7,
          reasoningTokens: 2,
          totalTokens: 12,
        },
      },
    });
  });

  it('parses responses SSE lifecycle, tool, usage, and done events', () => {
    const created = openAiResponsesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/responses',
        host: 'localhost',
        path: '/v1/responses',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-1',
      sequence: 0,
      rawLine:
        '{"type":"response.created","response":{"status":"in_progress"}}',
      rawJson: {
        type: 'response.created',
        response: { status: 'in_progress' },
      },
    });
    const delta = openAiResponsesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/responses',
        host: 'localhost',
        path: '/v1/responses',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-2',
      sequence: 1,
      rawLine: '{"type":"response.output_text.delta","delta":"Hello"}',
      rawJson: {
        type: 'response.output_text.delta',
        delta: 'Hello',
      },
    });
    const toolCall = openAiResponsesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/responses',
        host: 'localhost',
        path: '/v1/responses',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-3',
      sequence: 2,
      rawLine:
        '{"type":"response.output_item.added","item":{"type":"function_call","call_id":"call_1","name":"lookup_weather","arguments":"{\\"city\\":\\"Paris\\"}"}}',
      rawJson: {
        type: 'response.output_item.added',
        item: {
          type: 'function_call',
          call_id: 'call_1',
          name: 'lookup_weather',
          arguments: '{"city":"Paris"}',
        },
      },
    });
    const usage = openAiResponsesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/responses',
        host: 'localhost',
        path: '/v1/responses',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-4',
      sequence: 3,
      rawLine:
        '{"type":"response.usage","usage":{"input_tokens":5,"output_tokens":7,"total_tokens":12}}',
      rawJson: {
        type: 'response.usage',
        usage: {
          input_tokens: 5,
          output_tokens: 7,
          total_tokens: 12,
        },
      },
    });
    const done = openAiResponsesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/responses',
        host: 'localhost',
        path: '/v1/responses',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-5',
      sequence: 4,
      rawLine:
        '{"type":"response.completed","response":{"status":"completed"}}',
      rawJson: {
        type: 'response.completed',
        response: { status: 'completed' },
      },
    });

    expect(created).toEqual({
      event: {
        id: 'event-1',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'message_start',
        rawLine:
          '{"type":"response.created","response":{"status":"in_progress"}}',
        rawJson: {
          type: 'response.created',
          response: { status: 'in_progress' },
        },
        normalized: {
          status: 'in_progress',
        },
      },
    });
    expect(delta).toEqual({
      event: {
        id: 'event-2',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'delta',
        rawLine: '{"type":"response.output_text.delta","delta":"Hello"}',
        rawJson: {
          type: 'response.output_text.delta',
          delta: 'Hello',
        },
        normalized: {
          text: 'Hello',
        },
      },
    });
    expect(toolCall).toEqual({
      event: {
        id: 'event-3',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'tool_call_start',
        rawLine:
          '{"type":"response.output_item.added","item":{"type":"function_call","call_id":"call_1","name":"lookup_weather","arguments":"{\\"city\\":\\"Paris\\"}"}}',
        rawJson: {
          type: 'response.output_item.added',
          item: {
            type: 'function_call',
            call_id: 'call_1',
            name: 'lookup_weather',
            arguments: '{"city":"Paris"}',
          },
        },
        normalized: {
          id: 'call_1',
          name: 'lookup_weather',
          arguments: '{"city":"Paris"}',
        },
      },
    });
    expect(usage).toEqual({
      event: {
        id: 'event-4',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'usage',
        rawLine:
          '{"type":"response.usage","usage":{"input_tokens":5,"output_tokens":7,"total_tokens":12}}',
        rawJson: {
          type: 'response.usage',
          usage: {
            input_tokens: 5,
            output_tokens: 7,
            total_tokens: 12,
          },
        },
        normalized: {
          inputTokens: 5,
          outputTokens: 7,
          totalTokens: 12,
        },
      },
    });
    expect(done).toEqual({
      event: {
        id: 'event-5',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'message_stop',
        rawLine:
          '{"type":"response.completed","response":{"status":"completed"}}',
        rawJson: {
          type: 'response.completed',
          response: { status: 'completed' },
        },
        normalized: {
          done: true,
          status: 'completed',
        },
      },
    });
  });

  it('returns warnings for malformed payloads instead of throwing', () => {
    expect(
      openAiResponsesPlugin.parseRequest({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/responses',
          host: 'localhost',
          path: '/v1/responses',
          headers: {},
        },
        rawRequest: {
          headers: {},
          bodyJson: 'not-an-object',
        },
      }),
    ).toEqual({
      warnings: ['Expected JSON object request body for OpenAI responses.'],
    });

    expect(
      openAiResponsesPlugin.parseResponse({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/responses',
          host: 'localhost',
          path: '/v1/responses',
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
      warnings: ['Expected JSON object response body for OpenAI responses.'],
    });

    expect(
      openAiResponsesPlugin.parseStreamEvent?.({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/responses',
          host: 'localhost',
          path: '/v1/responses',
          headers: {},
        },
        sessionId: 'session-1',
        eventId: 'event-6',
        sequence: 5,
        rawLine: '{"type":"response.foo"}',
        rawJson: {
          type: 'response.foo',
        },
      }),
    ).toEqual({
      event: {
        id: 'event-6',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'unknown',
        rawLine: '{"type":"response.foo"}',
        rawJson: {
          type: 'response.foo',
        },
      },
      warnings: ['Unhandled OpenAI responses SSE event shape.'],
    });
  });
});
