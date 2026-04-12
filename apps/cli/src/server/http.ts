import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import type { SessionStore } from '@llmscope/core';
import type { ResolvedConfig } from '@llmscope/config';
import type { InspectorError, WsEvent } from '@llmscope/shared-types';

import { handleObservationRequest, sendInspectorError } from './routes.js';
import { createObservationWsHub } from './ws.js';

export interface ObservationServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getAddress(): { host: string; port: number };
  broadcast(event: WsEvent): void;
}

const toObservationInspectorError = (error: unknown): InspectorError => {
  if (
    error instanceof Error &&
    error.message.startsWith('Session not found:')
  ) {
    return {
      code: 'SESSION_NOT_FOUND',
      phase: 'ui',
      message: error.message,
      statusCode: 404,
    };
  }

  if (error instanceof SyntaxError) {
    return {
      code: 'BAD_REQUEST',
      phase: 'ui',
      message: 'Request body must be valid JSON.',
      statusCode: 400,
      details: { name: error.name, message: error.message },
    };
  }

  if (error instanceof Error) {
    const isBadRequest =
      error.message.includes('must be') ||
      error.message.startsWith('Invalid ') ||
      error.message.startsWith('Missing ');

    return {
      code: isBadRequest ? 'BAD_REQUEST' : 'OBSERVATION_SERVER_ERROR',
      phase: 'ui',
      message: error.message,
      statusCode: isBadRequest ? 400 : 500,
      details: { name: error.name, message: error.message },
    };
  }

  return {
    code: 'OBSERVATION_SERVER_ERROR',
    phase: 'ui',
    message: 'Unknown observation server error.',
    statusCode: 500,
    details: error,
  };
};

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
        if (response.headersSent) {
          response.end();
          return;
        }

        sendInspectorError(response, toObservationInspectorError(error));
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
