import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import {
  createCliRuntime,
  parseCliArgs,
  parseCommand,
  runDoctor,
} from '../src/index.js';

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
      parseCliArgs([
        '--upstream',
        'http://127.0.0.1:3000',
        '--config',
        './llmscope.yaml',
        '--host',
        '0.0.0.0',
        '--port',
        '9000',
        '--ui-port',
        '9001',
      ]),
    ).toEqual({
      runtimeOptions: {
        upstreamUrl: 'http://127.0.0.1:3000/',
        host: '0.0.0.0',
        port: 9000,
        observationPort: 9001,
      },
      configFilePath: './llmscope.yaml',
      configOverrides: {
        proxy: {
          host: '0.0.0.0',
          port: 9000,
        },
        ui: {
          port: 9001,
        },
        routes: [
          {
            id: 'default',
            targetBaseUrl: 'http://127.0.0.1:3000/',
            rewriteHost: true,
          },
        ],
      },
    });
  });

  it('rejects invalid CLI arguments', () => {
    expect(() => parseCliArgs([])).toThrow(
      'Missing required --upstream option.',
    );
    expect(() => parseCliArgs(['--upstream', 'not-a-url'])).toThrow(
      'Invalid upstream URL: not-a-url.',
    );
    expect(() =>
      parseCliArgs(['--upstream', 'http://127.0.0.1:3000', '--port', '-1']),
    ).toThrow('Invalid value for --port: -1.');
    expect(() =>
      parseCliArgs(['--upstream', 'http://127.0.0.1:3000', '--ui-port', '-1']),
    ).toThrow('Invalid value for --ui-port: -1.');
    expect(() =>
      parseCliArgs(['--upstream', 'http://127.0.0.1:3000', '--wat']),
    ).toThrow('Unknown argument: --wat.');
    expect(() => parseCliArgs(['--help'])).toThrow(
      'Usage: llmscope-cli start --upstream <url>',
    );
  });
});

describe('@llmscope/cli parseCommand', () => {
  it('parses the start subcommand', () => {
    expect(
      parseCommand(['start', '--upstream', 'http://127.0.0.1:3000']),
    ).toEqual({
      kind: 'start',
      args: {
        runtimeOptions: {
          upstreamUrl: 'http://127.0.0.1:3000/',
        },
        configOverrides: {
          routes: [
            {
              id: 'default',
              targetBaseUrl: 'http://127.0.0.1:3000/',
              rewriteHost: true,
            },
          ],
        },
      },
    });
  });

  it('parses the doctor subcommand with config overrides', () => {
    expect(
      parseCommand([
        'doctor',
        '--config',
        './llmscope.yaml',
        '--port',
        '9000',
        '--ui-port',
        '9001',
      ]),
    ).toEqual({
      kind: 'doctor',
      configFilePath: './llmscope.yaml',
      configOverrides: {
        proxy: {
          port: 9000,
        },
        ui: {
          port: 9001,
        },
      },
    });
  });

  it('rejects unknown commands', () => {
    expect(() => parseCommand(['wat'])).toThrow('Unknown command: wat.');
  });

  it('parses the clear subcommand with optional target arguments', () => {
    expect(
      parseCommand([
        'clear',
        '--config',
        './llmscope.yaml',
        '--host',
        '127.0.0.1',
        '--ui-port',
        '9001',
        '--session-id',
        'session-123',
      ]),
    ).toEqual({
      kind: 'clear',
      configFilePath: './llmscope.yaml',
      target: {
        host: '127.0.0.1',
        port: 9001,
      },
      sessionId: 'session-123',
    });
  });
});

describe('@llmscope/cli doctor', () => {
  it('reports a healthy config for memory storage', async () => {
    const report = await runDoctor({
      proxy: {
        host: '127.0.0.1',
        port: 0,
        mode: 'gateway',
      },
      ui: {
        enabled: true,
        port: 0,
        corsOrigin: 'http://127.0.0.1:8788',
      },
      storage: {
        mode: 'memory',
        memory: {
          maxSessions: 10,
        },
        sqlite: {
          filePath: './data/llmscope.db',
        },
      },
      privacy: {
        mode: 'balanced',
      },
      routes: [],
    });

    expect(report.ok).toBe(true);
    expect(
      report.checks.some((check) => check.label === 'node version' && check.ok),
    ).toBe(true);
    expect(
      report.checks.some(
        (check) =>
          check.label === 'sqlite writable' && check.detail.includes('skipped'),
      ),
    ).toBe(true);
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
      observationPort: 0,
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
          body: JSON.stringify({
            model: 'gpt-test',
            messages: [{ role: 'user', content: 'hi' }],
          }),
        },
      );
      const proxyJson = (await proxyResponse.json()) as { ok: boolean };
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?status=completed&search=%2Fv1%2Fchat&limit=10`,
      );
      const sessions = (await sessionsResponse.json()) as Array<{
        id: string;
        model?: string;
        path: string;
      }>;
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

  it('reports OpenAI responses sessions in observation detail', async () => {
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
      observationPort: 0,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      const proxyResponse = await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            input: 'hi',
            instructions: 'Be concise.',
          }),
        },
      );
      const proxyJson = (await proxyResponse.json()) as {
        body?: { model: string };
      };
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?search=%2Fv1%2Fresponses`,
      );
      const sessions = (await sessionsResponse.json()) as Array<{
        id: string;
        provider?: string;
        path: string;
      }>;
      const detailResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/${sessions[0]?.id ?? ''}`,
      );
      const detail = (await detailResponse.json()) as Session;

      expect(proxyResponse.status).toBe(200);
      expect(proxyJson.body).toBeDefined();
      expect(proxyJson.body?.model).toBe('gpt-4.1-mini');
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        path: '/v1/responses',
        provider: 'openai',
      });
      expect(detail.normalized).toMatchObject({
        provider: 'openai',
        apiStyle: 'responses',
        model: 'gpt-4.1-mini',
      });
      expect(detail.request.bodyJson).toEqual({
        model: 'gpt-4.1-mini',
        input: 'hi',
        instructions: 'Be concise.',
      });
      expect(detail.response?.bodyJson).toMatchObject({ status: 'completed' });
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('exposes provider-normalized stream events in session detail and reports API errors', async () => {
    const upstream = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/event-stream');
        response.write('event: response.created\n');
        response.write(
          'data: {"type":"response.created","response":{"status":"in_progress"}}\n\n',
        );
        response.write('event: response.output_text.delta\n');
        response.write(
          'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
        );
        response.write('event: response.completed\n');
        response.write(
          'data: {"type":"response.completed","response":{"status":"completed"}}\n\n',
        );
        response.end();
      },
    );
    const upstreamAddress = await listen(upstream);
    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
      observationPort: 0,
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
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            stream: true,
            input: 'hi',
          }),
        },
      );
      const streamBody = await streamResponse.text();
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?search=%2Fv1%2Fresponses`,
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
      expect(streamBody).toContain('response.output_text.delta');
      expect(detail.normalized).toMatchObject({
        provider: 'openai',
        apiStyle: 'responses',
        model: 'gpt-4.1-mini',
        stream: true,
      });
      expect(detail.streamEvents?.map((event) => event.eventType)).toEqual([
        'message_start',
        'delta',
        'message_stop',
      ]);
      expect(detail.streamEvents?.[0]?.normalized).toEqual({
        status: 'in_progress',
      });
      expect(detail.streamEvents?.[1]?.normalized).toEqual({ text: 'Hello' });
      expect(detail.streamEvents?.[2]?.normalized).toEqual({
        done: true,
        status: 'completed',
      });
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
      expect(optionsResponse.headers.get('access-control-allow-methods')).toBe(
        'GET, DELETE, OPTIONS',
      );
      expect(methodNotAllowedResponse.status).toBe(405);
      expect(await methodNotAllowedResponse.json()).toEqual({
        error: 'Method not allowed.',
      });
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('reports Anthropic messages sessions in observation detail', async () => {
    const upstream = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            id: 'msg_123',
            model: 'claude-3-5-sonnet',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Hello back' }],
            usage: {
              input_tokens: 11,
              output_tokens: 7,
            },
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
      observationPort: 0,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      const proxyResponse = await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 256,
          }),
        },
      );
      await proxyResponse.json();
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?search=%2Fv1%2Fmessages`,
      );
      const sessions = (await sessionsResponse.json()) as Array<{
        id: string;
        provider?: string;
        path: string;
      }>;
      const detailResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/${sessions[0]?.id ?? ''}`,
      );
      const detail = (await detailResponse.json()) as Session;

      expect(proxyResponse.status).toBe(200);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        path: '/v1/messages',
        provider: 'anthropic',
      });
      expect(detail.normalized).toMatchObject({
        provider: 'anthropic',
        apiStyle: 'messages',
        model: 'claude-3-5-sonnet',
        maxTokens: 256,
      });
      expect(detail.request.bodyJson).toEqual({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 256,
      });
      expect(detail.response?.bodyJson).toMatchObject({
        stop_reason: 'end_turn',
      });
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('returns redacted session detail when strict privacy mode is enabled', async () => {
    const upstream = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.setHeader('set-cookie', 'session=secret');
        response.end(
          JSON.stringify({
            model: 'gpt-4.1-mini',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'private reply' }],
              },
            ],
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
      privacy: { mode: 'strict' },
      observationPort: 0,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      const proxyResponse = await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`,
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer top-secret',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            input: 'private prompt',
            instructions: 'keep this secret',
          }),
        },
      );
      await proxyResponse.json();
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?search=%2Fv1%2Fresponses`,
      );
      const sessions = (await sessionsResponse.json()) as Array<{ id: string }>;
      const detailResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/${sessions[0]?.id ?? ''}`,
      );
      const detail = (await detailResponse.json()) as Session;

      expect(detail.request.headers.authorization).toBe('[redacted]');
      expect(detail.request.bodyJson).toMatchObject({
        input: '[redacted]',
        instructions: '[redacted]',
      });
      expect(detail.normalized).toMatchObject({
        inputMessages: [{ parts: [{ text: '[redacted]' }] }],
        instructions: [{ parts: [{ text: '[redacted]' }] }],
      });
      expect(detail.response?.headers['set-cookie']).toBe('[redacted]');
      expect(
        detail.warnings?.some((warning) => warning.includes('Redacted')),
      ).toBe(true);
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('preserves raw session detail when privacy mode is off', async () => {
    const upstream = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
    );
    const upstreamAddress = await listen(upstream);
    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
      privacy: { mode: 'off' },
      observationPort: 0,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      const proxyResponse = await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/responses`,
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer top-secret',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            input: 'private prompt',
          }),
        },
      );
      await proxyResponse.json();
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?search=%2Fv1%2Fresponses`,
      );
      const sessions = (await sessionsResponse.json()) as Array<{ id: string }>;
      const detailResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/${sessions[0]?.id ?? ''}`,
      );
      const detail = (await detailResponse.json()) as Session;

      expect(detail.request.headers.authorization).toBe('Bearer top-secret');
      expect(detail.request.bodyJson).toMatchObject({
        input: 'private prompt',
      });
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
    const blockingServer = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.end('blocked');
      },
    );
    const blockingServerAddress = await listen(blockingServer);

    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
      observationPort: blockingServerAddress.port,
    });
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      await expect(runtime.start()).rejects.toThrow();
      expect(runtime.getObservationAddress()).toEqual(observationAddress);
      await blockingServerAddress.close();
      await runtime.start();
      const proxyAddress = runtime.getProxyAddress();
      await expect(
        fetch(
          `http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`,
        ),
      ).resolves.toBeDefined();
    } finally {
      await new Promise<void>((resolve, reject) => {
        blockingServer.close((error) => {
          if (error !== undefined && error !== null) {
            reject(error);
            return;
          }

          resolve();
        });
      }).catch(() => undefined);
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('deletes a single session through the observation api', async () => {
    const upstream = createServer(
      async (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
    );
    const upstreamAddress = await listen(upstream);
    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
      observationPort: 0,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      await fetch(
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
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
      );
      const sessions = (await sessionsResponse.json()) as Array<{
        id: string;
      }>;

      expect(sessions).toHaveLength(1);
      const session = sessions[0];
      if (session === undefined) {
        throw new Error('Expected at least one session.');
      }
      const sessionId = session.id;

      const deleteResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/${sessionId}`,
        { method: 'DELETE' },
      );
      expect(deleteResponse.status).toBe(204);

      const sessionsAfterDeleteResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
      );
      const sessionsAfterDelete =
        (await sessionsAfterDeleteResponse.json()) as Array<unknown>;
      expect(sessionsAfterDelete).toHaveLength(0);

      const deletedDetailResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/${sessionId}`,
      );
      expect(deletedDetailResponse.status).toBe(404);
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('clears all sessions through the observation api when confirm=true is provided', async () => {
    const upstream = createServer(
      async (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
    );
    const upstreamAddress = await listen(upstream);
    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
      observationPort: 0,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-test',
            messages: [{ role: 'user', content: 'first' }],
          }),
        },
      );
      await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-test',
            messages: [{ role: 'user', content: 'second' }],
          }),
        },
      );

      const withoutConfirmResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
        { method: 'DELETE' },
      );
      expect(withoutConfirmResponse.status).toBe(400);

      const clearResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions?confirm=true`,
        { method: 'DELETE' },
      );
      expect(clearResponse.status).toBe(204);

      const sessionsAfterClearResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
      );
      const sessionsAfterClear =
        (await sessionsAfterClearResponse.json()) as Array<unknown>;
      expect(sessionsAfterClear).toHaveLength(0);
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('clear command deletes a single session through the observation api', async () => {
    const upstream = createServer(
      async (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
    );
    const upstreamAddress = await listen(upstream);
    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
      observationPort: 0,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      await fetch(
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
      const sessionsResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
      );
      const sessions = (await sessionsResponse.json()) as Array<{
        id: string;
      }>;

      expect(sessions).toHaveLength(1);
      const session = sessions[0];
      if (session === undefined) {
        throw new Error('Expected at least one session.');
      }
      const sessionId = session.id;

      const { runCli } = await import('../src/index.js');
      await runCli([
        'clear',
        '--host',
        observationAddress.host,
        '--ui-port',
        String(observationAddress.port),
        '--session-id',
        sessionId,
      ]);

      const deletedDetailResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/${sessionId}`,
      );
      expect(deletedDetailResponse.status).toBe(404);
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('clear command clears all sessions when no session id is provided', async () => {
    const upstream = createServer(
      async (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
    );
    const upstreamAddress = await listen(upstream);
    const runtime = createCliRuntime({
      upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
      host: '127.0.0.1',
      port: 0,
      maxSessions: 10,
      observationPort: 0,
    });

    await runtime.start();
    const proxyAddress = runtime.getProxyAddress();
    const observationAddress = runtime.getObservationAddress();

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-test',
            messages: [{ role: 'user', content: 'first' }],
          }),
        },
      );
      await fetch(
        `http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-test',
            messages: [{ role: 'user', content: 'second' }],
          }),
        },
      );

      const { runCli } = await import('../src/index.js');
      await runCli([
        'clear',
        '--host',
        observationAddress.host,
        '--ui-port',
        String(observationAddress.port),
      ]);

      const sessionsAfterClearResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
      );
      const sessionsAfterClear =
        (await sessionsAfterClearResponse.json()) as Array<unknown>;
      expect(sessionsAfterClear).toHaveLength(0);
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });
});
