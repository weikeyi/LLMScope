import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import { NodeProxyEngine, StaticRouteResolver } from '../src/index.js';
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
  it('forwards JSON requests and persists completed sessions', async () => {
    const upstream = createServer(
      async (request: IncomingMessage, response: ServerResponse) => {
        const body = await readBody(request);
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            ok: true,
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
        body: JSON.stringify({ model: 'gpt-test', messages: [{ role: 'user', content: 'hi' }] }),
      },
    );

    const json = (await response.json()) as { ok: boolean; echoedMethod: string };
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.echoedMethod).toBe('POST');
    expect(sessions).toHaveLength(1);
    expect(stored?.status).toBe('completed');
    expect(stored?.routing.routeId).toBe('default');
    expect(stored?.request.bodyJson).toEqual({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(stored?.response?.bodyJson).toMatchObject({ ok: true });
    expect(emitted.at(-1)?.status).toBe('completed');

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('streams SSE responses and appends stream events to the store', async () => {
    const upstream = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/event-stream');
        response.write('event: response.output_text.delta\n');
        response.write('data: {"delta":"Hello"}\n\n');
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
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const response = await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`);
    const bodyText = await response.text();
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(200);
    expect(bodyText).toContain('data: {"delta":"Hello"}');
    expect(stored?.transport.protocol).toBe('sse');
    expect(stored?.streamEvents?.map((event) => event.eventType)).toEqual([
      'unknown',
      'message_stop',
    ]);
    expect(stored?.response?.bodyText).toContain('[DONE]');

    await proxy.stop();
    await upstreamAddress.close();
  });
});
