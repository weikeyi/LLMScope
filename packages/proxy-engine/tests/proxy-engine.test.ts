import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import { NodeProxyEngine, StaticRouteResolver } from '../src/index.js';
import { openAiChatCompletionsPlugin } from '../src/providers/index.js';
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
});
