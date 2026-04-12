import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import {
  clearSessions,
  deleteSession,
  exportSessions,
} from '../src/server/api-client.js';

const startedServers: Array<{ close: () => Promise<void> }> = [];

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

afterEach(async () => {
  while (startedServers.length > 0) {
    const server = startedServers.pop();

    if (server !== undefined) {
      await server.close();
    }
  }
});

describe('@llmscope/web observation actions', () => {
  it('deletes a single session through the observation api', async () => {
    const requests: string[] = [];
    const apiServer = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        requests.push(`${_request.method ?? 'GET'} ${_request.url ?? '/'}`);
        response.statusCode = 204;
        response.end();
      },
    );
    const address = await listen(apiServer);
    startedServers.push(address);

    await deleteSession(`http://${address.host}:${address.port}`, 'session-1');

    expect(requests).toEqual(['DELETE /api/sessions/session-1']);
  });

  it('clears all sessions with an explicit confirmation query', async () => {
    const requests: string[] = [];
    const apiServer = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        requests.push(`${_request.method ?? 'GET'} ${_request.url ?? '/'}`);
        response.statusCode = 204;
        response.end();
      },
    );
    const address = await listen(apiServer);
    startedServers.push(address);

    await clearSessions(`http://${address.host}:${address.port}`);

    expect(requests).toEqual(['DELETE /api/sessions?confirm=true']);
  });

  it('exports selected sessions through the observation api', async () => {
    const requests: Array<{
      method: string;
      url: string;
      body: string;
      contentType: string | null;
    }> = [];
    const apiServer = createServer(
      async (request: IncomingMessage, response: ServerResponse) => {
        const chunks: Buffer[] = [];

        for await (const chunk of request) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        requests.push({
          method: request.method ?? 'GET',
          url: request.url ?? '/',
          body: Buffer.concat(chunks).toString('utf8'),
          contentType: request.headers['content-type'] ?? null,
        });
        response.statusCode = 200;
        response.setHeader('content-type', 'text/markdown; charset=utf-8');
        response.end('# Export');
      },
    );
    const address = await listen(apiServer);
    startedServers.push(address);

    const result = await exportSessions(
      `http://${address.host}:${address.port}`,
      {
        format: 'markdown',
        sessionIds: ['session-1', 'session-2'],
      },
    );

    expect(requests).toEqual([
      {
        method: 'POST',
        url: '/api/sessions/export',
        body: JSON.stringify({
          format: 'markdown',
          sessionIds: ['session-1', 'session-2'],
        }),
        contentType: 'application/json',
      },
    ]);
    expect(result.contentType).toContain('text/markdown');
    expect(result.body).toBe('# Export');
  });
});
