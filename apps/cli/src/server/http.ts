import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import type { SessionStore } from '@llmscope/core';
import type { ResolvedConfig } from '@llmscope/config';
import type { WsEvent } from '@llmscope/shared-types';

import { handleObservationRequest } from './routes.js';
import { createObservationWsHub } from './ws.js';

export interface ObservationServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getAddress(): { host: string; port: number };
  broadcast(event: WsEvent): void;
}

export const createObservationServer = (
  store: SessionStore,
  options: {
    config: ResolvedConfig;
    host: string;
    port: number;
    corsOrigin: string;
  },
): ObservationServer => {
  const address = {
    host: options.host,
    port: options.port,
  };
  const server: Server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      void handleObservationRequest(request, response, {
        store,
        config: options.config,
        host: address.host,
        port: address.port,
        corsOrigin: options.corsOrigin,
      }).catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown observation server error.';

        if (response.headersSent) {
          response.end();
          return;
        }

        response.statusCode = message.startsWith('Session not found:') ? 404 : 500;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ error: message }));
      });
    },
  );
  const wsHub = createObservationWsHub();
  wsHub.attach(server);

  let started = false;

  return {
    async start(): Promise<void> {
      if (started) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          const listeningAddress = server.address();

          if (
            listeningAddress === null ||
            typeof listeningAddress === 'string'
          ) {
            reject(new Error('Observation server address unavailable.'));
            return;
          }

          address.host = listeningAddress.address;
          address.port = listeningAddress.port;
          resolve();
        };

        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(options.port, options.host);
      });
      started = true;
    },
    async stop(): Promise<void> {
      if (!started) {
        return;
      }

      wsHub.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined && error !== null) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      started = false;
    },
    getAddress(): { host: string; port: number } {
      return { ...address };
    },
    broadcast(event: WsEvent): void {
      wsHub.broadcast(event);
    },
  };
};
