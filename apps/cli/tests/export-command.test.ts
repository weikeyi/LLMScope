import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseCommand } from '../src/index.js';
import { createCliRuntime, runCli } from '../src/index.js';

const tempDirectories: string[] = [];

const createTempDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'llmscope-cli-export-'));
  tempDirectories.push(directory);
  return directory;
};

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

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  process.exitCode = undefined;
});

describe('@llmscope/cli export command parsing', () => {
  it('parses a single-session export command', () => {
    expect(
      parseCommand([
        'export',
        '--config',
        './llmscope.yaml',
        '--host',
        '127.0.0.1',
        '--ui-port',
        '9001',
        '--session-id',
        'session-123',
        '--format',
        'json',
        '--output',
        './tmp/session.json',
      ]),
    ).toEqual({
      kind: 'export',
      configFilePath: './llmscope.yaml',
      target: {
        host: '127.0.0.1',
        port: 9001,
      },
      sessionId: 'session-123',
      format: 'json',
      outputPath: './tmp/session.json',
      query: {},
    });
  });

  it('parses a filtered collection export command', () => {
    expect(
      parseCommand([
        'export',
        '--format',
        'markdown',
        '--output',
        './tmp/sessions.md',
        '--status',
        'completed',
        '--provider',
        'openai',
        '--search',
        '/v1/chat',
        '--limit',
        '5',
      ]),
    ).toEqual({
      kind: 'export',
      target: {},
      format: 'markdown',
      outputPath: './tmp/sessions.md',
      query: {
        status: 'completed',
        provider: 'openai',
        search: '/v1/chat',
        limit: 5,
      },
    });
  });

  it('rejects an invalid export format', () => {
    expect(() =>
      parseCommand(['export', '--format', 'csv', '--output', './tmp/data.csv']),
    ).toThrow('Invalid value for --format: csv.');
  });

  it('rejects session-id mixed with collection filters', () => {
    expect(() =>
      parseCommand([
        'export',
        '--session-id',
        'session-123',
        '--status',
        'completed',
      ]),
    ).toThrow(
      'The --session-id option cannot be combined with collection filters.',
    );
  });
});

describe('@llmscope/cli export flows', () => {
  it('exposes resolved config and export payloads from the observation api', async () => {
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
      await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-test',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      const configResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/config`,
      );
      const configJson = (await configResponse.json()) as {
        proxy: { host: string };
        ui: { port: number };
      };

      const exportResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/export`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            format: 'json',
            query: {
              status: 'completed',
            },
          }),
        },
      );
      const exportText = await exportResponse.text();

      expect(configResponse.status).toBe(200);
      expect(configJson.proxy.host).toBe('127.0.0.1');
      expect(configJson.ui.port).toBe(8788);
      expect(exportResponse.status).toBe(200);
      expect(exportResponse.headers.get('content-type')).toContain(
        'application/json',
      );
      expect(exportText).toContain('"id"');
      expect(exportText).toContain('/v1/chat/completions');
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('writes exported sessions to disk through the cli command', async () => {
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
    const tempDirectory = createTempDirectory();
    const outputPath = join(tempDirectory, 'exports', 'sessions.md');
    const configFilePath = join(tempDirectory, 'llmscope.yaml');

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    writeFileSync(
      configFilePath,
      [
        'proxy:',
        `  host: ${observationAddress.host}`,
        '  port: 8787',
        'ui:',
        '  enabled: true',
        `  port: ${observationAddress.port}`,
        'storage:',
        '  mode: memory',
        'privacy:',
        '  mode: balanced',
        'routes: []',
      ].join('\n'),
      'utf8',
    );

    try {
      await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-test',
          messages: [{ role: 'user', content: 'hello export' }],
        }),
      });

      await runCli([
        'export',
        '--config',
        configFilePath,
        '--format',
        'markdown',
        '--output',
        outputPath,
        '--status',
        'completed',
      ]);

      const written = readFileSync(outputPath, 'utf8');

      expect(written).toContain('# LLMScope Export');
      expect(written).toContain('/v1/chat/completions');
      expect(written).toContain('gpt-test');
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('writes filtered exports as ndjson', async () => {
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
    const tempDirectory = createTempDirectory();
    const outputPath = join(tempDirectory, 'exports', 'sessions.ndjson');

    if (observationAddress === null) {
      throw new Error('Expected observation server address.');
    }

    try {
      await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-ndjson',
          messages: [{ role: 'user', content: 'hello ndjson' }],
        }),
      });

      await runCli([
        'export',
        '--host',
        observationAddress.host,
        '--ui-port',
        String(observationAddress.port),
        '--format',
        'ndjson',
        '--output',
        outputPath,
        '--status',
        'completed',
      ]);

      const lines = readFileSync(outputPath, 'utf8')
        .trim()
        .split('\n');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('"id"');
      expect(lines[0]).toContain('"model":"gpt-ndjson"');
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });

  it('redacts captured secrets from exported artifacts by default', async () => {
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
      await fetch(`http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer top-secret-token',
          'x-api-key': 'sk-hidden',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-secret',
          messages: [{ role: 'user', content: 'hide my key' }],
        }),
      });

      const exportResponse = await fetch(
        `http://${observationAddress.host}:${observationAddress.port}/api/sessions/export`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            format: 'json',
            query: {
              status: 'completed',
            },
          }),
        },
      );
      const exportText = await exportResponse.text();

      expect(exportResponse.status).toBe(200);
      expect(exportText).toContain('"authorization": "[redacted]"');
      expect(exportText).toContain('"x-api-key": "[redacted]"');
      expect(exportText).not.toContain('top-secret-token');
      expect(exportText).not.toContain('sk-hidden');
    } finally {
      await runtime.stop();
      await upstreamAddress.close();
    }
  });
});
