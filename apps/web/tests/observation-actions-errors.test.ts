import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { deleteSession } from '../src/server/api-client.js';

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

describe('@llmscope/web observation action errors', () => {
  it('formats typed observation api errors with their code', async () => {
    const apiServer = createServer(
      (_request: IncomingMessage, response: ServerResponse) => {
        response.statusCode = 405;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            error: 'Delete denied.',
            code: 'METHOD_NOT_ALLOWED',
            phase: 'ui',
          }),
        );
      },
    );
    const address = await listen(apiServer);
    startedServers.push(address);

    await expect(
      deleteSession(`http://${address.host}:${address.port}`, 'session-1'),
    ).rejects.toThrow('[METHOD_NOT_ALLOWED] Delete denied.');
  });
});
