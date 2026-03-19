import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import process from 'node:process';
import { URL } from 'node:url';

import type { SessionStore } from '@llmscope/core';
import { defaultConfig, type ResolvedPrivacyConfig, type RouteConfig } from '@llmscope/config';
import { NodeProxyEngine, StaticRouteResolver, anthropicMessagesPlugin, openAiChatCompletionsPlugin, openAiResponsesPlugin } from '@llmscope/proxy-engine';
import type { ListSessionsQuery, Session, SessionStatus } from '@llmscope/shared-types';
import { MemorySessionStore } from '@llmscope/storage-memory';
import { SqliteSessionStore } from '@llmscope/storage-sqlite';

export interface CliRuntimeOptions {
  upstreamUrl: string;
  host?: string;
  port?: number;
  maxSessions?: number;
  privacy?: ResolvedPrivacyConfig;
  observationPort?: number;
}

export interface CliRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  getProxyAddress(): { host: string; port: number };
  getObservationAddress(): { host: string; port: number } | null;
}

export interface ObservationServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getAddress(): { host: string; port: number };
}

const EXIT_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

const usage = 'Usage: llmscope-cli --upstream <url> [--host <host>] [--port <port>]';

const parseNumberOption = (name: string, value: string | undefined): number => {
  if (value === undefined) {
    throw new Error(`Missing value for ${name}.`);
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid value for ${name}: ${value}.`);
  }

  return parsed;
};

const takeOptionValue = (args: string[], index: number, name: string): string => {
  const value = args[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
};

export const parseCliArgs = (args: string[]): CliRuntimeOptions => {
  let upstreamUrl: string | undefined;
  let host: string | undefined;
  let port: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--upstream':
        upstreamUrl = takeOptionValue(args, index, '--upstream');
        index += 1;
        break;
      case '--host':
        host = takeOptionValue(args, index, '--host');
        index += 1;
        break;
      case '--port':
        port = parseNumberOption('--port', takeOptionValue(args, index, '--port'));
        index += 1;
        break;
      case '--help':
      case '-h':
        throw new Error(usage);
      default:
        throw new Error(`Unknown argument: ${arg}.\n${usage}`);
    }
  }

  if (upstreamUrl === undefined) {
    throw new Error(`Missing required --upstream option.\n${usage}`);
  }

  let normalizedUpstreamUrl: string;

  try {
    normalizedUpstreamUrl = new URL(upstreamUrl).toString();
  } catch {
    throw new Error(`Invalid upstream URL: ${upstreamUrl}.`);
  }

  const options: CliRuntimeOptions = {
    upstreamUrl: normalizedUpstreamUrl,
  };

  if (host !== undefined) {
    options.host = host;
  }

  if (port !== undefined) {
    options.port = port;
  }

  return options;
};

const formatStatusCode = (session: Session): string => {
  if (session.transport.statusCode !== undefined) {
    return String(session.transport.statusCode);
  }

  if (session.error?.code !== undefined) {
    return session.error.code;
  }

  return '-';
};

const formatDuration = (session: Session): string => {
  if (session.transport.durationMs === undefined) {
    return '-';
  }

  return `${session.transport.durationMs}ms`;
};

export const formatSessionSummary = (session: Session): string => {
  return [
    `[session ${session.id}]`,
    session.transport.method,
    session.transport.path,
    `status=${session.status}`,
    `code=${formatStatusCode(session)}`,
    `duration=${formatDuration(session)}`,
  ].join(' ');
};

const toRouteConfig = (upstreamUrl: string): RouteConfig => ({
  id: 'default',
  targetBaseUrl: upstreamUrl,
  rewriteHost: true,
});

const toResolvedRoute = (route: RouteConfig) => {
  const resolvedRoute: {
    routeId: string;
    targetBaseUrl: string;
    rewriteHost?: boolean;
    injectHeaders?: Record<string, string>;
    removeHeaders?: string[];
  } = {
    routeId: route.id,
    targetBaseUrl: route.targetBaseUrl,
  };

  if (route.rewriteHost !== undefined) {
    resolvedRoute.rewriteHost = route.rewriteHost;
  }

  if (route.injectHeaders !== undefined) {
    resolvedRoute.injectHeaders = route.injectHeaders;
  }

  if (route.removeHeaders !== undefined) {
    resolvedRoute.removeHeaders = route.removeHeaders;
  }

  return resolvedRoute;
};

const sendJson = (response: ServerResponse, statusCode: number, body: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const sendNotFound = (response: ServerResponse): void => {
  sendJson(response, 404, {
    error: 'Not found.',
  });
};

const sendMethodNotAllowed = (response: ServerResponse): void => {
  sendJson(response, 405, {
    error: 'Method not allowed.',
  });
};

const sendBadRequest = (response: ServerResponse, message: string): void => {
  sendJson(response, 400, {
    error: message,
  });
};

const isSessionStatus = (value: string): value is SessionStatus => {
  return ['pending', 'streaming', 'completed', 'error'].includes(value);
};

const takeSingleSearchParam = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const toListSessionsQuery = (url: URL): { query: ListSessionsQuery } | { error: string } => {
  const query: ListSessionsQuery = {};

  const status = takeSingleSearchParam(url.searchParams.getAll('status'));
  if (status !== undefined && status.length > 0) {
    if (!isSessionStatus(status)) {
      return {
        error: `Invalid status query value: ${status}.`,
      };
    }

    query.status = status;
  }

  const provider = url.searchParams.get('provider')?.trim();
  if (provider !== undefined && provider.length > 0) {
    query.provider = provider;
  }

  const model = url.searchParams.get('model')?.trim();
  if (model !== undefined && model.length > 0) {
    query.model = model;
  }

  const search = url.searchParams.get('search')?.trim();
  if (search !== undefined && search.length > 0) {
    query.search = search;
  }

  const limit = url.searchParams.get('limit')?.trim();
  if (limit !== undefined && limit.length > 0) {
    const parsed = Number(limit);

    if (!Number.isInteger(parsed) || parsed < 0) {
      return {
        error: `Invalid limit query value: ${limit}.`,
      };
    }

    query.limit = parsed;
  }

  return {
    query,
  };
};

const createObservationServer = (
  store: SessionStore,
  options: {
    host: string;
    port: number;
    corsOrigin: string;
  },
): ObservationServer => {
  const address = {
    host: options.host,
    port: options.port,
  };
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      response.setHeader('access-control-allow-origin', options.corsOrigin);
      response.setHeader('access-control-allow-methods', 'GET, OPTIONS');
      response.setHeader('access-control-allow-headers', 'content-type');

      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method !== 'GET') {
        sendMethodNotAllowed(response);
        return;
      }

      const requestUrl = new URL(
        request.url ?? '/',
        `http://${request.headers.host ?? `${options.host}:${options.port}`}`,
      );

      if (requestUrl.pathname === '/health') {
        sendJson(response, 200, {
          ok: true,
        });
        return;
      }

      if (requestUrl.pathname === '/api/sessions') {
        const queryResult = toListSessionsQuery(requestUrl);

        if ('error' in queryResult) {
          sendBadRequest(response, queryResult.error);
          return;
        }

        const sessions = await store.listSessions(queryResult.query);
        sendJson(response, 200, sessions);
        return;
      }

      const sessionDetailMatch = /^\/api\/sessions\/([^/]+)$/.exec(requestUrl.pathname);
      if (sessionDetailMatch !== null) {
        const sessionId = decodeURIComponent(sessionDetailMatch[1] ?? '');
      const session = await store.getSession(sessionId);

        if (session === null) {
          sendNotFound(response);
          return;
        }

        sendJson(response, 200, session);
        return;
      }

      sendNotFound(response);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown observation server error.';

      if (response.headersSent) {
        response.end();
        return;
      }

      sendJson(response, 500, {
        error: message,
      });
    });
  });

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

          if (listeningAddress === null || typeof listeningAddress === 'string') {
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
  };
};

const createSessionStore = (options: CliRuntimeOptions): SessionStore => {
  const resolvedMaxSessions = options.maxSessions ?? defaultConfig.storage.memory.maxSessions;

  if (defaultConfig.storage.mode === 'sqlite') {
    return new SqliteSessionStore({
      filePath: defaultConfig.storage.sqlite.filePath,
      maxSessions: resolvedMaxSessions,
    });
  }

  return new MemorySessionStore({
    maxSessions: resolvedMaxSessions,
  });
};

export const createCliRuntime = (options: CliRuntimeOptions): CliRuntime => {
  const resolvedHost = options.host ?? defaultConfig.proxy.host;
  const resolvedPort = options.port ?? defaultConfig.proxy.port;
  const route = toRouteConfig(options.upstreamUrl);
  const store = createSessionStore(options);
  const privacy = options.privacy ?? defaultConfig.privacy;
  const engine = new NodeProxyEngine({
    host: resolvedHost,
    port: resolvedPort,
    mode: defaultConfig.proxy.mode,
    routeResolver: new StaticRouteResolver(toResolvedRoute(route)),
    store,
    privacy,
    providerPlugins: [openAiChatCompletionsPlugin, openAiResponsesPlugin, anthropicMessagesPlugin],
  });
  const observationServer = defaultConfig.ui.enabled
    ? createObservationServer(store, {
        host: resolvedHost,
        port: options.observationPort ?? defaultConfig.ui.port,
        corsOrigin: defaultConfig.ui.corsOrigin,
      })
    : null;

  engine.onSession((session) => {
    console.log(formatSessionSummary(session));
  });

  let started = false;

  return {
    async start(): Promise<void> {
      await engine.start();

      try {
        await observationServer?.start();
      } catch (error) {
        await engine.stop();
        throw error;
      }

      started = true;
      const address = engine.getAddress();
      console.log(`LLMScope proxy listening on http://${address.host}:${address.port}`);
      console.log(`Forwarding requests to ${route.targetBaseUrl}`);

      if (observationServer !== null) {
        const observationAddress = observationServer.getAddress();
        console.log(
          `LLMScope observation API listening on http://${observationAddress.host}:${observationAddress.port}`,
        );
      }
    },
    async stop(): Promise<void> {
      if (!started) {
        return;
      }

      started = false;
      await Promise.all([engine.stop(), observationServer?.stop()]);
    },
    getProxyAddress(): { host: string; port: number } {
      return engine.getAddress();
    },
    getObservationAddress(): { host: string; port: number } | null {
      if (observationServer === null) {
        return null;
      }

      return observationServer.getAddress();
    },
  };
};

export const runCli = async (args: string[]): Promise<void> => {
  const runtime = createCliRuntime(parseCliArgs(args));
  await runtime.start();

  let isStopping = false;

  const stop = async (): Promise<void> => {
    if (isStopping) {
      return;
    }

    isStopping = true;
    await runtime.stop();
  };

  const signalHandlers = new Map<(typeof EXIT_SIGNALS)[number], () => void>();

  for (const signal of EXIT_SIGNALS) {
    const handler = () => {
      void stop().finally(() => {
        process.exit(0);
      });
    };

    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }

  process.once('beforeExit', () => {
    void stop();
  });
};

const isMainModule = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMainModule) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown CLI error.';
    console.error(message);
    process.exitCode = 1;
  });
}
