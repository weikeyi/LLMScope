import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import type { SessionStatus } from '@llmscope/shared-types';

import type {
  ObservationUiOptions,
  ObservationUiServer,
  ObservationUiServerOptions,
} from '../types.js';
import {
  renderObservationFragments,
  renderObservationPage,
} from '../ui/layout.js';
import { loadObservationPageData } from './api-client.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const observationUiUsage =
  'Usage: llmscope-web --api-base-url <url> [--host <host>] [--port <port>]';

const toSessionStatus = (value: string | null): SessionStatus | undefined => {
  if (
    value === 'pending' ||
    value === 'streaming' ||
    value === 'completed' ||
    value === 'error'
  ) {
    return value;
  }

  return undefined;
};

const toQueryOptions = (
  requestUrl: URL,
  apiBaseUrl: string,
): ObservationUiOptions => {
  const limitValue = requestUrl.searchParams.get('limit');
  const parsedLimit = limitValue === null ? undefined : Number(limitValue);
  const options: ObservationUiOptions = {
    apiBaseUrl,
  };

  const selectedSessionId = requestUrl.searchParams.get('sessionId');
  if (selectedSessionId !== null && selectedSessionId.length > 0) {
    options.selectedSessionId = selectedSessionId;
  }

  if (requestUrl.searchParams.get('compare') === 'previous') {
    options.compareMode = 'previous';
  }

  const compareToSessionId = requestUrl.searchParams.get('compareTo');
  if (compareToSessionId !== null && compareToSessionId.length > 0) {
    options.compareToSessionId = compareToSessionId;
  }

  const status = toSessionStatus(requestUrl.searchParams.get('status'));
  if (status !== undefined) {
    options.status = status;
  }

  const provider = requestUrl.searchParams.get('provider');
  if (provider !== null && provider.length > 0) {
    options.provider = provider;
  }

  const model = requestUrl.searchParams.get('model');
  if (model !== null && model.length > 0) {
    options.model = model;
  }

  const search = requestUrl.searchParams.get('search');
  if (search !== null && search.length > 0) {
    options.search = search;
  }

  if (parsedLimit !== undefined && Number.isFinite(parsedLimit)) {
    options.limit = parsedLimit;
  }

  return options;
};

const sendHtml = (
  response: ServerResponse,
  statusCode: number,
  html: string,
): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(html);
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const sendNotFound = (response: ServerResponse): void => {
  sendJson(response, 404, { error: 'Not found.' });
};

const takeOptionValue = (
  args: string[],
  index: number,
  name: string,
): string => {
  const value = args[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
};

const parsePort = (value: string): number => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid value for --port: ${value}.`);
  }

  return parsed;
};

export const parseObservationUiArgs = (
  args: string[],
): ObservationUiServerOptions => {
  let apiBaseUrl: string | undefined;
  let host: string | undefined;
  let port: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--api-base-url':
        apiBaseUrl = takeOptionValue(args, index, '--api-base-url');
        index += 1;
        break;
      case '--host':
        host = takeOptionValue(args, index, '--host');
        index += 1;
        break;
      case '--port':
        port = parsePort(takeOptionValue(args, index, '--port'));
        index += 1;
        break;
      case '--help':
      case '-h':
        throw new Error(observationUiUsage);
      default:
        throw new Error(`Unknown argument: ${arg}.\n${observationUiUsage}`);
    }
  }

  if (apiBaseUrl === undefined) {
    throw new Error(
      `Missing required --api-base-url option.\n${observationUiUsage}`,
    );
  }

  let normalizedApiBaseUrl: string;

  try {
    normalizedApiBaseUrl = new URL(apiBaseUrl).toString();
  } catch {
    throw new Error(`Invalid API base URL: ${apiBaseUrl}.`);
  }

  return {
    apiBaseUrl: normalizedApiBaseUrl,
    ...(host === undefined ? {} : { host }),
    ...(port === undefined ? {} : { port }),
  };
};

export const createObservationUiServer = (
  options: ObservationUiServerOptions,
): ObservationUiServer => {
  const host = options.host ?? DEFAULT_HOST;
  let port = options.port ?? DEFAULT_PORT;
  const server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        const requestUrl = new URL(
          request.url ?? '/',
          `http://${host}:${port}`,
        );

        if (request.method === 'GET' && requestUrl.pathname === '/') {
          const data = await loadObservationPageData(
            toQueryOptions(requestUrl, options.apiBaseUrl),
          );
          sendHtml(response, 200, renderObservationPage(data));
          return;
        }

        if (
          request.method === 'GET' &&
          requestUrl.pathname === '/__llmscope/fragment'
        ) {
          const data = await loadObservationPageData(
            toQueryOptions(requestUrl, options.apiBaseUrl),
          );
          sendJson(response, 200, renderObservationFragments(data));
          return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/health') {
          sendJson(response, 200, { ok: true });
          return;
        }

        sendNotFound(response);
      })().catch((error: unknown) => {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : 'Unknown observation UI server error.',
        });
      });
    },
  );

  return {
    async start(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          const address = server.address();

          if (address === null || typeof address === 'string') {
            reject(new Error('Observation UI address unavailable.'));
            return;
          }

          port = address.port;
          resolve();
        });
      });
    },
    async stop(): Promise<void> {
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
    getAddress(): { host: string; port: number } {
      return { host, port };
    },
  };
};
