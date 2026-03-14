import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import { createCliRuntime, parseCliArgs } from '../src/index.js';

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

describe('@llmscope/cli parseCliArgs', () => {
  it('parses valid CLI arguments and applies optional fields', () => {
    expect(
      parseCliArgs(['--upstream', 'http://127.0.0.1:3000', '--host', '0.0.0.0', '--port', '9000']),
    ).toEqual({
      upstreamUrl: 'http://127.0.0.1:3000/',
      host: '0.0.0.0',
      port: 9000,
    });
  });

  it('rejects invalid CLI arguments', () => {
    expect(() => parseCliArgs([])).toThrow('Missing required --upstream option.');
    expect(() => parseCliArgs(['--upstream', 'not-a-url'])).toThrow('Invalid upstream URL: not-a-url.');
    expect(() => parseCliArgs(['--upstream', 'http://127.0.0.1:3000', '--port', '-1'])).toThrow(
      'Invalid value for --port: -1.',
    );
    expect(() => parseCliArgs(['--upstream', 'http://127.0.0.1:3000', '--wat'])).toThrow(
      'Unknown argument: --wat.',
    );
    expect(() => parseCliArgs(['--help'])).toThrow('Usage: llmscope-cli --upstream <url>');
  });
});

describe('@llmscope/cli observation api', () => {
  it('serves health, session summaries, and session detail for proxied JSON traffic', async () => {
    const upstream = createServer(
      async (request: IncomingMessage, response: ServerResponse) => {
        const body = await readBody(request);
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            ok: true,
            body: JSON.parse(body),
          }),
        );
      },
    );
    const upstreamAddress = await listen(upstream);
    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      const healthResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/health`,
      );
      const proxyResponse = await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ model: 'gpt-test', messages: [{ role: 'user', content: 'hi' }] }),
        },
      );
      const proxyJson = (await proxyResponse.json()) as { ok: boolean };
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?status=completed&search=%2Fv1%2Fchat&limit=10`,
      );
      const sessions = (await sessionsResponse.json()) as Array<{ id: string; model?: string; path: string }>;
      const detailResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/${sessions[0]?.id ?? ''}`,
      );
      const detail = (await detailResponse.json()) as Session;

      expect(healthResponse.status).toBe(200);
      expect(await healthResponse.json()).toEqual({ ok: true });
      expect(proxyResponse.status).toBe(200);
      expect(proxyJson.ok).toBe(true);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        path: '/v1/chat/completions',
        provider: 'openai',
      });
      const firstSession = sessions[0];

      if (firstSession === undefined) {
        throw new Error('Expected a captured session.');
      }

      expect(detail.id).toBe(firstSession.id);
      expect(detail.normalized).toMatchObject({
        provider: 'openai',
        model: 'gpt-test',
        apiStyle: 'chat.completions',
      });
      expect(detail.request.bodyJson).toEqual({
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(detail.response?.bodyJson).toMatchObject({ ok: true });
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('exposes stream events in session detail and reports API errors', async () => {
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
    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      const streamResponse = await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`,
      );
      const streamBody = await streamResponse.text();
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
      );
      const sessions = (await sessionsResponse.json()) as Array<{ id: string }>;
      const detailResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/${sessions[0]?.id ?? ''}`,
      );
      const detail = (await detailResponse.json()) as Session;
      const missingResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/missing`,
      );
      const invalidLimitResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?limit=abc`,
      );
      const invalidStatusResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?status=wat`,
      );
      const optionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
        { method: 'OPTIONS' },
      );
      const methodNotAllowedResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
        { method: 'POST' },
      );

      expect(streamResponse.status).toBe(200);
      expect(streamBody).toContain('data: {"delta":"Hello"}');
      expect(detail.streamEvents?.map((event) => event.eventType)).toEqual(['unknown', 'message_stop']);
      expect(missingResponse.status).toBe(404);
      expect(await missingResponse.json()).toEqual({ error: 'Not found.' });
      expect(invalidLimitResponse.status).toBe(400);
      expect(await invalidLimitResponse.json()).toEqual({
        error: 'Invalid limit query value: abc.',
      });
      expect(invalidStatusResponse.status).toBe(400);
      expect(await invalidStatusResponse.json()).toEqual({
        error: 'Invalid status query value: wat.',
      });
      expect(optionsResponse.status).toBe(204);
      expect(optionsResponse.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
      expect(methodNotAllowedResponse.status).toBe(405);
      expect(await methodNotAllowedResponse.json()).toEqual({ error: 'Method not allowed.' });
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('stops the proxy if observation server startup fails', async () => {
    const upstream = createServer(
      async (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
    );
    const upstreamAddress = await listen(upstream);
    const blockingServer = createServer((_request: IncomingMessage, response: ServerResponse) => {
      response.statusCode = 200;
      response.end('blocked');
    });
    blockingServer.listen(8788, '127.0.0.1');
    await once(blockingServer, 'listening');

    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
    });
    const proxyAddress = runtime.getProxyAddress();

    try {
      await expect(runtime.start()).rejects.toThrow();
      await expect(fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`)).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve, reject) => {
        blockingServer.close((error) => {
          if (error !== undefined && error !== null) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      await upstreamAddress.close();
    }
  });
});
