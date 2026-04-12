import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { describe, expect, it } from 'vitest';

import { MemorySessionStore } from '../../storage-memory/src/index.js';
import {
  NodeProxyEngine,
  StaticRouteResolver,
  openAiChatCompletionsPlugin,
} from '../src/index.js';

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

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }

  throw new Error('Timed out waiting for condition.');
};

describe('@llmscope/proxy-engine runtime hardening', () => {
  it('returns a typed overload error when maxConcurrentSessions is exceeded', async () => {
    let releaseFirstRequest!: () => void;
    const firstRequestBlocked = new Promise<void>((resolve) => {
      releaseFirstRequest = () => {
        resolve();
      };
    });
    const upstream = createServer(
      async (_request: IncomingMessage, response: ServerResponse) => {
        await firstRequestBlocked;
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
    );
    const upstreamAddress = await listen(upstream);
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      maxConcurrentSessions: 1,
      routeResolver: new StaticRouteResolver({
        routeId: 'default',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store: new MemorySessionStore(),
    });

    await proxy.start();
    const proxyAddress = proxy.getAddress();

    const firstResponsePromise = fetch(
      `http://${proxyAddress.host}:${proxyAddress.port}/slow`,
    );
    await waitFor(() => releaseFirstRequest !== null);

    const overloadedResponse = await fetch(
      `http://${proxyAddress.host}:${proxyAddress.port}/second`,
    );
    const overloadedJson = (await overloadedResponse.json()) as {
      error: string;
      code?: string;
      phase?: string;
    };

    expect(overloadedResponse.status).toBe(429);
    expect(overloadedJson).toMatchObject({
      error: 'Too many concurrent sessions.',
      code: 'TOO_MANY_CONCURRENT_SESSIONS',
      phase: 'request',
    });

    releaseFirstRequest();
    await firstResponsePromise;
    await proxy.stop();
    await upstreamAddress.close();
  });

  it('returns a typed timeout error and stores it on the session', async () => {
    const upstream = createServer(
      async (_request: IncomingMessage, _response: ServerResponse) => {
        await new Promise((resolve) => {
          setTimeout(resolve, 250);
        });
      },
    );
    const upstreamAddress = await listen(upstream);
    const store = new MemorySessionStore();
    const proxy = new NodeProxyEngine({
      host: '127.0.0.1',
      port: 0,
      requestTimeoutMs: 25,
      routeResolver: new StaticRouteResolver({
        routeId: 'timeout',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      providerPlugins: [openAiChatCompletionsPlugin],
    });

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
          messages: [{ role: 'user', content: 'hi' }],
        }),
      },
    );
    const body = (await response.json()) as {
      error: string;
      code?: string;
    };
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(504);
    expect(body.code).toBe('UPSTREAM_TIMEOUT');
    expect(stored?.status).toBe('error');
    expect(stored?.error).toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      phase: 'upstream',
      retryable: true,
      statusCode: 504,
    });

    await proxy.stop();
    await upstreamAddress.close();
  });

  it('classifies upstream 429 responses with a typed session error', async () => {
    const upstream = createServer(
      async (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 429;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            error: {
              message: 'Rate limit exceeded.',
            },
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
        routeId: 'rate-limit',
        targetBaseUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        rewriteHost: true,
      }),
      store,
      providerPlugins: [openAiChatCompletionsPlugin],
    });

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
          messages: [{ role: 'user', content: 'hi' }],
        }),
      },
    );
    await response.json();
    const sessions = await store.listSessions();
    const stored = await store.getSession(sessions[0]?.id ?? '');

    expect(response.status).toBe(429);
    expect(stored?.status).toBe('error');
    expect(stored?.error).toMatchObject({
      code: 'UPSTREAM_RATE_LIMITED',
      phase: 'upstream',
      statusCode: 429,
      retryable: true,
      message: 'Rate limit exceeded.',
    });

    await proxy.stop();
    await upstreamAddress.close();
  });
});
