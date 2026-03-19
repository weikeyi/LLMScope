import { describe, expect, it } from 'vitest';

import { anthropicMessagesPlugin } from '../src/providers/index.js';

describe('anthropicMessagesPlugin', () => {
  it('matches Anthropic messages requests with strongest confidence when model and messages exist', () => {
    const result = anthropicMessagesPlugin.match({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/messages',
        host: 'localhost',
        path: '/v1/messages',
        headers: {},
      },
      requestBody: {
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'hi' }],
      },
    });

    expect(result).toEqual({
      provider: 'anthropic',
      apiStyle: 'messages',
      confidence: 1,
      reasons: ['matched POST /v1/messages', 'found model field', 'found messages array'],
    });
  });

  it('does not match non-message routes', () => {
    expect(
      anthropicMessagesPlugin.match({
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

  it('parses Anthropic messages requests into canonical fields', () => {
    const result = anthropicMessagesPlugin.parseRequest({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/messages',
        host: 'localhost',
        path: '/v1/messages',
        headers: {},
      },
      rawRequest: {
        headers: {},
        bodyJson: {
          model: 'claude-3-5-sonnet',
          stream: true,
          temperature: 0.3,
          top_p: 0.8,
          max_tokens: 256,
          system: 'You are helpful.',
          tool_choice: { type: 'auto' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Hi' },
                { type: 'tool_result', tool_use_id: 'tool_1', content: '72F' },
              ],
            },
          ],
          tools: [
            {
              name: 'lookup_weather',
              description: 'Lookup weather',
              input_schema: { type: 'object' },
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      exchange: {
        provider: 'anthropic',
        apiStyle: 'messages',
        model: 'claude-3-5-sonnet',
        stream: true,
        temperature: 0.3,
        topP: 0.8,
        maxTokens: 256,
        instructions: [
          {
            role: 'system',
            parts: [{ type: 'text', text: 'You are helpful.' }],
            raw: 'You are helpful.',
          },
        ],
        toolChoice: { type: 'auto' },
        inputMessages: [
          {
            role: 'user',
            parts: [
              { type: 'text', text: 'Hi' },
              { type: 'tool_result', toolCallId: 'tool_1', content: '72F' },
            ],
            raw: {
              role: 'user',
              content: [
                { type: 'text', text: 'Hi' },
                { type: 'tool_result', tool_use_id: 'tool_1', content: '72F' },
              ],
            },
          },
        ],
        tools: [
          {
            name: 'lookup_weather',
            description: 'Lookup weather',
            inputSchema: { type: 'object' },
            raw: {
              name: 'lookup_weather',
              description: 'Lookup weather',
              input_schema: { type: 'object' },
            },
          },
        ],
      },
    });
  });

  it('parses Anthropic messages responses into output and usage', () => {
    const result = anthropicMessagesPlugin.parseResponse({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/messages',
        host: 'localhost',
        path: '/v1/messages',
        headers: {},
      },
      rawRequest: {
        headers: {},
      },
      rawResponse: {
        headers: {},
        bodyJson: {
          id: 'msg_123',
          model: 'claude-3-5-sonnet',
          stop_reason: 'end_turn',
          content: [
            { type: 'text', text: 'Hello back' },
            { type: 'tool_use', id: 'tool_1', name: 'lookup_weather', input: { city: 'NYC' } },
          ],
          usage: {
            input_tokens: 11,
            output_tokens: 7,
          },
        },
      },
      statusCode: 200,
    });

    expect(result).toEqual({
      exchange: {
        provider: 'anthropic',
        apiStyle: 'messages',
        model: 'claude-3-5-sonnet',
        output: {
          text: 'Hello back',
          finishReason: 'end_turn',
          messages: [
            {
              role: 'assistant',
              parts: [
                { type: 'text', text: 'Hello back' },
                { type: 'tool_call', id: 'tool_1', name: 'lookup_weather', arguments: { city: 'NYC' } },
              ],
              raw: {
                id: 'msg_123',
                model: 'claude-3-5-sonnet',
                stop_reason: 'end_turn',
                content: [
                  { type: 'text', text: 'Hello back' },
                  { type: 'tool_use', id: 'tool_1', name: 'lookup_weather', input: { city: 'NYC' } },
                ],
                usage: {
                  input_tokens: 11,
                  output_tokens: 7,
                },
              },
            },
          ],
          raw: {
            id: 'msg_123',
            model: 'claude-3-5-sonnet',
            stop_reason: 'end_turn',
            content: [
              { type: 'text', text: 'Hello back' },
              { type: 'tool_use', id: 'tool_1', name: 'lookup_weather', input: { city: 'NYC' } },
            ],
            usage: {
              input_tokens: 11,
              output_tokens: 7,
            },
          },
        },
        usage: {
          inputTokens: 11,
          outputTokens: 7,
          totalTokens: 18,
        },
      },
    });
  });

  it('parses key Anthropic SSE event shapes', () => {
    const messageStart = anthropicMessagesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/messages',
        host: 'localhost',
        path: '/v1/messages',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-1',
      sequence: 0,
      eventName: 'message_start',
      rawLine: '{"type":"message_start"}',
      rawJson: { type: 'message_start' },
    });
    const textDelta = anthropicMessagesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/messages',
        host: 'localhost',
        path: '/v1/messages',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-2',
      sequence: 1,
      eventName: 'content_block_delta',
      rawLine: '{"delta":{"type":"text_delta","text":"Hello"}}',
      rawJson: { delta: { type: 'text_delta', text: 'Hello' } },
    });
    const toolStart = anthropicMessagesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/messages',
        host: 'localhost',
        path: '/v1/messages',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-3',
      sequence: 2,
      eventName: 'content_block_start',
      rawLine: '{"content_block":{"type":"tool_use","id":"tool_1","name":"lookup_weather","input":{"city":"NYC"}}}',
      rawJson: {
        content_block: { type: 'tool_use', id: 'tool_1', name: 'lookup_weather', input: { city: 'NYC' } },
      },
    });
    const toolDelta = anthropicMessagesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/messages',
        host: 'localhost',
        path: '/v1/messages',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-4',
      sequence: 3,
      eventName: 'content_block_delta',
      rawLine: '{"delta":{"type":"input_json_delta","partial_json":"{\"city\":\"N"}}',
      rawJson: { delta: { type: 'input_json_delta', partial_json: '{"city":"N' } },
    });
    const usage = anthropicMessagesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/messages',
        host: 'localhost',
        path: '/v1/messages',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-5',
      sequence: 4,
      eventName: 'message_delta',
      rawLine: '{"usage":{"input_tokens":11,"output_tokens":7}}',
      rawJson: { usage: { input_tokens: 11, output_tokens: 7 } },
    });
    const stop = anthropicMessagesPlugin.parseStreamEvent?.({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/v1/messages',
        host: 'localhost',
        path: '/v1/messages',
        headers: {},
      },
      sessionId: 'session-1',
      eventId: 'event-6',
      sequence: 5,
      eventName: 'message_stop',
      rawLine: '{"type":"message_stop"}',
      rawJson: { type: 'message_stop' },
    });

    expect(messageStart).toEqual({
      event: {
        id: 'event-1',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'message_start',
        rawLine: '{"type":"message_start"}',
        rawJson: { type: 'message_start' },
      },
    });
    expect(textDelta).toEqual({
      event: {
        id: 'event-2',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'delta',
        rawLine: '{"delta":{"type":"text_delta","text":"Hello"}}',
        rawJson: { delta: { type: 'text_delta', text: 'Hello' } },
        normalized: { text: 'Hello' },
      },
    });
    expect(toolStart).toEqual({
      event: {
        id: 'event-3',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'tool_call_start',
        rawLine:
          '{"content_block":{"type":"tool_use","id":"tool_1","name":"lookup_weather","input":{"city":"NYC"}}}',
        rawJson: {
          content_block: { type: 'tool_use', id: 'tool_1', name: 'lookup_weather', input: { city: 'NYC' } },
        },
        normalized: { type: 'tool_call', id: 'tool_1', name: 'lookup_weather', arguments: { city: 'NYC' } },
      },
    });
    expect(toolDelta).toEqual({
      event: {
        id: 'event-4',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'tool_call_delta',
        rawLine: '{"delta":{"type":"input_json_delta","partial_json":"{\"city\":\"N"}}',
        rawJson: { delta: { type: 'input_json_delta', partial_json: '{"city":"N' } },
        normalized: { arguments: '{"city":"N' },
      },
    });
    expect(usage).toEqual({
      event: {
        id: 'event-5',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'usage',
        rawLine: '{"usage":{"input_tokens":11,"output_tokens":7}}',
        rawJson: { usage: { input_tokens: 11, output_tokens: 7 } },
        normalized: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      },
    });
    expect(stop).toEqual({
      event: {
        id: 'event-6',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'message_stop',
        rawLine: '{"type":"message_stop"}',
        rawJson: { type: 'message_stop' },
      },
    });
  });

  it('returns warnings for malformed payloads instead of throwing', () => {
    expect(
      anthropicMessagesPlugin.parseRequest({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/messages',
          host: 'localhost',
          path: '/v1/messages',
          headers: {},
        },
        rawRequest: {
          headers: {},
          bodyJson: 'not-an-object',
        },
      }),
    ).toEqual({
      warnings: ['Expected JSON object request body for Anthropic messages.'],
    });

    expect(
      anthropicMessagesPlugin.parseResponse({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/messages',
          host: 'localhost',
          path: '/v1/messages',
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
      warnings: ['Expected JSON object response body for Anthropic messages.'],
    });

    expect(
      anthropicMessagesPlugin.parseStreamEvent?.({
        request: {
          protocol: 'http',
          method: 'POST',
          url: 'http://localhost/v1/messages',
          host: 'localhost',
          path: '/v1/messages',
          headers: {},
        },
        sessionId: 'session-1',
        eventId: 'event-7',
        sequence: 6,
        eventName: 'content_block_delta',
        rawLine: '{"delta":{}}',
        rawJson: { delta: {} },
      }),
    ).toEqual({
      event: {
        id: 'event-7',
        sessionId: 'session-1',
        ts: expect.any(Number),
        eventType: 'unknown',
        rawLine: '{"delta":{}}',
        rawJson: { delta: {} },
      },
      warnings: ['Unhandled Anthropic messages SSE event shape.'],
    });
  });
});
