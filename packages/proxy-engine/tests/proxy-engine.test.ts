import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { describe, expect, it } from 'vitest';

import { genericOpenAiChatCompletionsPlugin } from '@llmscope/provider-generic';
import type { Session } from '@llmscope/shared-types';

import { NodeProxyEngine, StaticRouteResolver } from '../src/index.js';
import { anthropicMessagesPlugin, openAiChatCompletionsPlugin, openAiResponsesPlugin } from '../src/providers/index.js';
import { MemorySessionStore } from '../../storage-memory/src/index.js';

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
};

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

describe('@llmscope/proxy-engine', () => {
  it('forwards JSON requests and persists completed sessions with normalized OpenAI metadata', async () => {
    const upstream = createServer(
      async (request: IncomingMessage, response: ServerResponse) => {
        const body = await readBody(request);
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            id: 'chatcmpl_test',
            object: 'chat.completion',
            model: 'gpt-test',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: 'Hello back',
                },
              },
            ],
            usage: {
              prompt_tokens: 7,
              completion_tokens: 3,
              total_tokens: 10,
            },
            echoedMethod: request.method,
            body: JSON.parse(body),
          }),
        );
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      routeResolver: new StaticRouteResolver({
        routeId: 'default',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      providerPlugins: [openAiChatCompletionsPlugin],
    });
    const emitted: Session[] = [];
    proxy.onSession((session) => emitted.push(session));

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(
      `http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-test',
          stream: false,
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 50,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      },
    );

    const json = (await response.json()) as { echoedMethod: string; body: { model: string } };
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(200);
    expect(json.echoedMethod).toBe('POST');
    expect(json.body.model).toBe('gpt-test');
    expect(sessions).toHaveLength(1);
    expect(stored?.status).toBe('completed');
    expect(stored?.routing).toMatchObject({
      routeId: 'default',
      matchedProvider: 'openai',
      matchedEndpoint: 'chat.completions',
      confidence: 1,
    });
    expect(stored?.request.bodyJson).toEqual({
      model: 'gpt-test',
      stream: false,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 50,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(stored?.response?.bodyJson).toMatchObject({ model: 'gpt-test' });
    expect(stored?.normalized).toMatchObject({
      provider: 'openai',
      apiStyle: 'chat.completions',
      model: 'gpt-test',
      stream: false,
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 50,
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
        },
      ],
      output: {
        text: 'Hello back',
        finishReason: 'stop',
      },
      usage: {
        inputTokens: 7,
        outputTokens: 3,
        totalTokens: 10,
      },
    });
    expect(emitted.at(-1)?.status).toBe('completed');

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('streams SSE responses and appends normalized OpenAI stream events to the store', async () => {
    const upstream = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/event-stream');
        response.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
        response.write('data: [DONE]\n\n');
        response.end();
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      routeResolver: new StaticRouteResolver({
        routeId: 'sse',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      providerPlugins: [openAiChatCompletionsPlugin],
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-test',
        stream: true,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const bodyText = await response.text();
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(200);
    expect(bodyText).toContain('data: {"choices":[{"delta":{"content":"Hello"}}]}');
    expect(stored?.transport.protocol).toBe('sse');
    expect(stored?.routing).toMatchObject({
      matchedProvider: 'openai',
      matchedEndpoint: 'chat.completions',
    });
    expect(stored?.normalized).toMatchObject({
      provider: 'openai',
      apiStyle: 'chat.completions',
      model: 'gpt-test',
      stream: true,
    });
    expect(stored?.streamEvents?.map((event) => event.eventType)).toEqual([
      'delta',
      'message_stop',
    ]);
    expect(stored?.streamEvents?.[0]?.normalized).toEqual({ text: 'Hello' });
    expect(stored?.response?.bodyText).toContain('[DONE]');

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('normalizes OpenAI responses request, response, and stream events', async () => {
    const upstream = createServer(
      async (request: IncomingMessage, response: ServerResponse) => {
        const body = await readBody(request);
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
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
              input_tokens: 6,
              output_tokens: 4,
              total_tokens: 10,
            },
            echoedMethod: request.method,
            body: JSON.parse(body),
          }),
        );
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      routeResolver: new StaticRouteResolver({
        routeId: 'responses',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      providerPlugins: [openAiResponsesPlugin],
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        stream: false,
        instructions: 'Be concise.',
        input: 'hi',
      }),
    });
    const json = (await response.json()) as { echoedMethod: string; body: { model: string } };
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(200);
    expect(json.echoedMethod).toBe('POST');
    expect(json.body.model).toBe('gpt-4.1-mini');
    expect(stored?.routing).toMatchObject({
      routeId: 'responses',
      matchedProvider: 'openai',
      matchedEndpoint: 'responses',
      confidence: 1,
    });
    expect(stored?.normalized).toMatchObject({
      provider: 'openai',
      apiStyle: 'responses',
      model: 'gpt-4.1-mini',
      stream: false,
      instructions: [
        {
          role: 'system',
          parts: [{ type: 'text', text: 'Be concise.' }],
        },
      ],
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
        },
      ],
      output: {
        text: 'Hello back',
        finishReason: 'completed',
      },
      usage: {
        inputTokens: 6,
        outputTokens: 4,
        totalTokens: 10,
      },
    });

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('captures OpenAI responses SSE events with provider-aware normalization', async () => {
    const upstream = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/event-stream');
        response.write('data: {"type":"response.created","response":{"status":"in_progress"}}\n\n');
        response.write('data: {"type":"response.output_text.delta","delta":"Hello"}\n\n');
        response.write('data: {"type":"response.completed","response":{"status":"completed"}}\n\n');
        response.end();
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      routeResolver: new StaticRouteResolver({
        routeId: 'responses-sse',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      providerPlugins: [openAiResponsesPlugin],
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        stream: true,
        input: 'hi',
      }),
    });
    const bodyText = await response.text();
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(200);
    expect(bodyText).toContain('response.output_text.delta');
    expect(stored?.routing).toMatchObject({
      matchedProvider: 'openai',
      matchedEndpoint: 'responses',
    });
    expect(stored?.normalized).toMatchObject({
      provider: 'openai',
      apiStyle: 'responses',
      model: 'gpt-4.1-mini',
      stream: true,
    });
    expect(stored?.streamEvents?.map((event) => event.eventType)).toEqual([
      'message_start',
      'delta',
      'message_stop',
    ]);
    expect(stored?.streamEvents?.[0]?.normalized).toEqual({ status: 'in_progress' });
    expect(stored?.streamEvents?.[1]?.normalized).toEqual({ text: 'Hello' });
    expect(stored?.streamEvents?.[2]?.normalized).toEqual({ done: true, status: 'completed' });

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('preserves Anthropic messages request, response, and SSE metadata in stored sessions', async () => {
    const upstream = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/event-stream');
        response.write('event: message_start\n');
        response.write('data: {"type":"message_start"}\n\n');
        response.write('event: content_block_delta\n');
        response.write('data: {"delta":{"type":"text_delta","text":"Hello"}}\n\n');
        response.write('event: message_delta\n');
        response.write('data: {"usage":{"input_tokens":11,"output_tokens":7}}\n\n');
        response.write('event: message_stop\n');
        response.write('data: {"type":"message_stop"}\n\n');
        response.end();
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      routeResolver: new StaticRouteResolver({
        routeId: 'anthropic',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      providerPlugins: [anthropicMessagesPlugin],
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet',
        stream: true,
        max_tokens: 256,
        system: 'You are helpful.',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      }),
    });
    const bodyText = await response.text();
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(200);
    expect(bodyText).toContain('event: content_block_delta');
    expect(stored?.routing).toMatchObject({
      routeId: 'anthropic',
      matchedProvider: 'anthropic',
      matchedEndpoint: 'messages',
      confidence: 1,
    });
    expect(stored?.normalized).toMatchObject({
      provider: 'anthropic',
      apiStyle: 'messages',
      model: 'claude-3-5-sonnet',
      stream: true,
      maxTokens: 256,
      instructions: [
        {
          role: 'system',
          parts: [{ type: 'text', text: 'You are helpful.' }],
        },
      ],
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'Hi' }],
        },
      ],
    });
    expect(stored?.transport.protocol).toBe('sse');
    expect(stored?.streamEvents?.map((event) => event.eventType)).toEqual([
      'message_start',
      'delta',
      'usage',
      'message_stop',
    ]);
    expect(stored?.streamEvents?.[1]?.normalized).toEqual({ text: 'Hello' });
    expect(stored?.streamEvents?.[2]?.normalized).toEqual({
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
    });

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('redacts sensitive request, response, and stream payloads in strict privacy mode', async () => {
    const upstream = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/event-stream');
        response.setHeader('set-cookie', 'session=secret');
        response.write('data: {"type":"response.output_text.delta","delta":"secret reply"}\n\n');
        response.write('data: [DONE]\n\n');
        response.end();
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      routeResolver: new StaticRouteResolver({
        routeId: 'strict-redaction',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      privacy: { mode: 'strict' },
      providerPlugins: [openAiResponsesPlugin],
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer top-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: 'private prompt',
        instructions: 'keep this secret',
        stream: true,
      }),
    });
    await response.text();
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(stored?.request.headers.authorization).toBe('[redacted]');
    expect(stored?.request.bodyJson).toMatchObject({
      input: '[redacted]',
      instructions: '[redacted]',
    });
    expect(stored?.normalized).toMatchObject({
      inputMessages: [{ parts: [{ text: '[redacted]' }] }],
      instructions: [{ parts: [{ text: '[redacted]' }] }],
    });
    expect(stored?.response?.headers['set-cookie']).toBe('[redacted]');
    expect(stored?.response?.bodyText).toContain('secret reply');
    expect(stored?.streamEvents?.[0]?.normalized).toEqual({ text: '[redacted]' });
    expect(stored?.warnings?.some((warning) => warning.includes('Redacted'))).toBe(true);

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('preserves request content in off privacy mode', async () => {
    const upstream = createServer(
      async (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      routeResolver: new StaticRouteResolver({
        routeId: 'privacy-off',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      privacy: { mode: 'off' },
      providerPlugins: [openAiResponsesPlugin],
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer top-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: 'private prompt',
      }),
    });
    await response.json();
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(stored?.request.headers.authorization).toBe('Bearer top-secret');
    expect(stored?.request.bodyJson).toMatchObject({ input: 'private prompt' });
    expect(stored?.warnings).toBeUndefined();

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('preserves raw capture behavior when no provider plugin matches', async () => {
    const upstream = createServer(
      async (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      routeResolver: new StaticRouteResolver({
        routeId: 'default',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      providerPlugins: [openAiChatCompletionsPlugin],
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`);
    const body = await response.json();
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(stored?.routing.routeId).toBe('default');
    expect(stored?.routing.matchedProvider).toBeUndefined();
    expect(stored?.normalized).toBeUndefined();
    expect(stored?.response?.bodyJson).toEqual({ ok: true });

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('captures generic OpenAI-compatible chat routes with a diagnostic warning', async () => {
    const upstream = createServer(
      async (request: IncomingMessage, response: ServerResponse) => {
        const body = await readBody(request);
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            id: 'relay-chatcmpl-test',
            object: 'chat.completion',
            model: 'relay-model',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: 'Hello from relay',
                },
              },
            ],
            usage: {
              prompt_tokens: 4,
              completion_tokens: 3,
              total_tokens: 7,
            },
            echoedMethod: request.method,
            body: JSON.parse(body),
          }),
        );
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      routeResolver: new StaticRouteResolver({
        routeId: 'generic-chat',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      providerPlugins: [genericOpenAiChatCompletionsPlugin],
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(
      `http://${proxyAddress.host}:${proxyAddress.port}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'relay-model',
          stream: false,
          messages: [{ role: 'user', content: 'hello relay' }],
        }),
      },
    );
    await response.json();
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(stored?.routing).toMatchObject({
      routeId: 'generic-chat',
      matchedProvider: 'openai-compatible',
      matchedEndpoint: 'chat.completions',
    });
    expect(stored?.normalized).toMatchObject({
      provider: 'openai-compatible',
      apiStyle: 'chat.completions',
      model: 'relay-model',
    });
    expect(
      stored?.warnings?.some((warning) =>
        warning.includes('Generic OpenAI-compatible normalization applied'),
      ),
    ).toBe(true);

    await proxy.stop();
    await upstreamAddress.close();
  });
});
