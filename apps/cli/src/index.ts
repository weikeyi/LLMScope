import { accessSync, constants, mkdirSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { dirname } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

import type { SessionStore } from '@llmscope/core';
import {
  defaultConfig,
  resolveConfig,
  type LLMScopeConfig,
  type ResolvedConfig,
  type ResolvedPrivacyConfig,
  type RouteConfig,
} from '@llmscope/config';
import {
  NodeProxyEngine,
  StaticRouteResolver,
  anthropicMessagesPlugin,
  openAiChatCompletionsPlugin,
  openAiResponsesPlugin,
} from '@llmscope/proxy-engine';
import type {
  ListSessionsQuery,
  Session,
  SessionSummary,
  SessionStatus,
} from '@llmscope/shared-types';
import { MemorySessionStore } from '@llmscope/storage-memory';
import { SqliteSessionStore } from '@llmscope/storage-sqlite';

export interface CliRuntimeOptions {
  upstreamUrl?: string;
  host?: string;
  port?: number;
  maxSessions?: number;
  privacy?: ResolvedPrivacyConfig;
  observationPort?: number;
  config?: ResolvedConfig;
}

export interface ParsedCliArgs {
  runtimeOptions: CliRuntimeOptions;
  configFilePath?: string;
  configOverrides: LLMScopeConfig;
}

export interface StartCommand {
  kind: 'start';
  args: ParsedCliArgs;
}

export interface DoctorCommand {
  kind: 'doctor';
  configFilePath?: string;
  configOverrides: LLMScopeConfig;
}

export interface ClearCommand {
  kind: 'clear';
  configFilePath?: string;
  target: {
    host?: string;
    port?: number;
  };
  sessionId?: string;
}

export interface ListCommand {
  kind: 'list';
  configFilePath?: string;
  target: {
    host?: string;
    port?: number;
  };
  query: ListSessionsQuery;
}

export interface ShowCommand {
  kind: 'show';
  configFilePath?: string;
  target: {
    host?: string;
    port?: number;
  };
  sessionId: string;
}

export type CliCommand =
  | StartCommand
  | DoctorCommand
  | ClearCommand
  | ListCommand
  | ShowCommand;

export interface DoctorCheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheckResult[];
  config: ResolvedConfig;
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

const generalUsage = [
  'Usage:',
  '  llmscope-cli start [--upstream <url>] [--config <path>] [--host <host>] [--port <port>] [--ui-port <port>]',
  '  llmscope-cli doctor [--config <path>] [--host <host>] [--port <port>] [--ui-port <port>]',
  '  llmscope-cli list [--config <path>] [--host <host>] [--ui-port <port>] [--status <status>] [--provider <provider>] [--model <model>] [--search <text>] [--limit <n>]',
  '  llmscope-cli show --session-id <id> [--config <path>] [--host <host>] [--ui-port <port>]',
  '  llmscope-cli clear [--host <host>] [--ui-port <port>] [--session-id <id>]',
  '',
].join('\n');

const startUsage =
  'Usage: llmscope-cli start [--upstream <url>] [--config <path>] [--host <host>] [--port <port>] [--ui-port <port>]';

const doctorUsage =
  'Usage: llmscope-cli doctor [--config <path>] [--host <host>] [--port <port>] [--ui-port <port>]';

const listUsage =
  'Usage: llmscope-cli list [--config <path>] [--host <host>] [--ui-port <port>] [--status <status>] [--provider <provider>] [--model <model>] [--search <text>] [--limit <n>]';

const showUsage =
  'Usage: llmscope-cli show --session-id <id> [--config <path>] [--host <host>] [--ui-port <port>]';

const clearUsage =
  'Usage: llmscope-cli clear [--host <host>] [--ui-port <port>] [--session-id <id>]';

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

export const parseCliArgs = (args: string[]): ParsedCliArgs => {
  let upstreamUrl: string | undefined;
  let host: string | undefined;
  let port: number | undefined;
  let observationPort: number | undefined;
  let configFilePath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--upstream':
        upstreamUrl = takeOptionValue(args, index, '--upstream');
        index += 1;
        break;
      case '--config':
        configFilePath = takeOptionValue(args, index, '--config');
        index += 1;
        break;
      case '--host':
        host = takeOptionValue(args, index, '--host');
        index += 1;
        break;
      case '--port':
        port = parseNumberOption(
          '--port',
          takeOptionValue(args, index, '--port'),
        );
        index += 1;
        break;
      case '--ui-port':
        observationPort = parseNumberOption(
          '--ui-port',
          takeOptionValue(args, index, '--ui-port'),
        );
        index += 1;
        break;
      case '--help':
      case '-h':
        throw new Error(startUsage);
      default:
        throw new Error(`Unknown argument: ${arg}.\n${startUsage}`);
    }
  }

  const options: CliRuntimeOptions = {};
  const configOverrides: LLMScopeConfig = {};

  if (upstreamUrl !== undefined) {
    let normalizedUpstreamUrl: string;

    try {
      normalizedUpstreamUrl = new URL(upstreamUrl).toString();
    } catch {
      throw new Error(`Invalid upstream URL: ${upstreamUrl}.`);
    }

    options.upstreamUrl = normalizedUpstreamUrl;
    configOverrides.routes = [toRouteConfig(normalizedUpstreamUrl)];
  }

  if (host !== undefined) {
    options.host = host;
    configOverrides.proxy = {
      ...(configOverrides.proxy ?? {}),
      host,
    };
  }

  if (port !== undefined) {
    options.port = port;
    configOverrides.proxy = {
      ...(configOverrides.proxy ?? {}),
      port,
    };
  }

  if (observationPort !== undefined) {
    options.observationPort = observationPort;
    configOverrides.ui = {
      ...(configOverrides.ui ?? {}),
      port: observationPort,
    };
  }

  const parsedArgs: ParsedCliArgs = {
    runtimeOptions: options,
    configOverrides,
  };

  if (configFilePath !== undefined) {
    parsedArgs.configFilePath = configFilePath;
  }

  return parsedArgs;
};

const parseGlobalOptionArgs = (
  args: string[],
  commandUsage: string,
): { configFilePath?: string; configOverrides: LLMScopeConfig } => {
  let host: string | undefined;
  let port: number | undefined;
  let uiPort: number | undefined;
  let configFilePath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--config':
        configFilePath = takeOptionValue(args, index, '--config');
        index += 1;
        break;
      case '--host':
        host = takeOptionValue(args, index, '--host');
        index += 1;
        break;
      case '--port':
        port = parseNumberOption(
          '--port',
          takeOptionValue(args, index, '--port'),
        );
        index += 1;
        break;
      case '--ui-port':
        uiPort = parseNumberOption(
          '--ui-port',
          takeOptionValue(args, index, '--ui-port'),
        );
        index += 1;
        break;
      case '--help':
      case '-h':
        throw new Error(commandUsage);
      default:
        throw new Error(`Unknown argument: ${arg}.\n${commandUsage}`);
    }
  }

  const configOverrides: LLMScopeConfig = {};

  if (host !== undefined || port !== undefined) {
    configOverrides.proxy = {};

    if (host !== undefined) {
      configOverrides.proxy.host = host;
    }

    if (port !== undefined) {
      configOverrides.proxy.port = port;
    }
  }

  if (uiPort !== undefined) {
    configOverrides.ui = {
      port: uiPort,
    };
  }

  return configFilePath === undefined
    ? { configOverrides }
    : { configFilePath, configOverrides };
};

const parseClearCommand = (args: string[]): ClearCommand => {
  let host: string | undefined;
  let uiPort: number | undefined;
  let sessionId: string | undefined;
  let configFilePath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--config':
        configFilePath = takeOptionValue(args, index, '--config');
        index += 1;
        break;
      case '--host':
        host = takeOptionValue(args, index, '--host');
        index += 1;
        break;
      case '--ui-port':
        uiPort = parseNumberOption(
          '--ui-port',
          takeOptionValue(args, index, '--ui-port'),
        );
        index += 1;
        break;
      case '--session-id':
        sessionId = takeOptionValue(args, index, '--session-id');
        index += 1;
        break;
      case '--help':
      case '-h':
        throw new Error(clearUsage);
      default:
        throw new Error(`Unknown argument: ${arg}.\n${clearUsage}`);
    }
  }

  const result: ClearCommand = {
    kind: 'clear',
    target: {},
  };

  if (host !== undefined) {
    result.target.host = host;
  }

  if (uiPort !== undefined) {
    result.target.port = uiPort;
  }

  if (configFilePath !== undefined) {
    result.configFilePath = configFilePath;
  }

  if (sessionId !== undefined) {
    result.sessionId = sessionId;
  }

  return result;
};

const parseListCommand = (args: string[]): ListCommand => {
  let host: string | undefined;
  let uiPort: number | undefined;
  let configFilePath: string | undefined;
  const query: ListSessionsQuery = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--config':
        configFilePath = takeOptionValue(args, index, '--config');
        index += 1;
        break;
      case '--host':
        host = takeOptionValue(args, index, '--host');
        index += 1;
        break;
      case '--ui-port':
        uiPort = parseNumberOption(
          '--ui-port',
          takeOptionValue(args, index, '--ui-port'),
        );
        index += 1;
        break;
      case '--status': {
        const status = takeOptionValue(args, index, '--status');
        if (!isSessionStatus(status)) {
          throw new Error(`Invalid value for --status: ${status}.`);
        }
        query.status = status;
        index += 1;
        break;
      }
      case '--provider':
        query.provider = takeOptionValue(args, index, '--provider').trim();
        index += 1;
        break;
      case '--model':
        query.model = takeOptionValue(args, index, '--model').trim();
        index += 1;
        break;
      case '--search':
        query.search = takeOptionValue(args, index, '--search').trim();
        index += 1;
        break;
      case '--limit':
        query.limit = parseNumberOption(
          '--limit',
          takeOptionValue(args, index, '--limit'),
        );
        index += 1;
        break;
      case '--help':
      case '-h':
        throw new Error(listUsage);
      default:
        throw new Error(`Unknown argument: ${arg}.\n${listUsage}`);
    }
  }

  const result: ListCommand = {
    kind: 'list',
    target: {},
    query,
  };

  if (host !== undefined) {
    result.target.host = host;
  }

  if (uiPort !== undefined) {
    result.target.port = uiPort;
  }

  if (configFilePath !== undefined) {
    result.configFilePath = configFilePath;
  }

  return result;
};

const parseShowCommand = (args: string[]): ShowCommand => {
  let host: string | undefined;
  let uiPort: number | undefined;
  let configFilePath: string | undefined;
  let sessionId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--config':
        configFilePath = takeOptionValue(args, index, '--config');
        index += 1;
        break;
      case '--host':
        host = takeOptionValue(args, index, '--host');
        index += 1;
        break;
      case '--ui-port':
        uiPort = parseNumberOption(
          '--ui-port',
          takeOptionValue(args, index, '--ui-port'),
        );
        index += 1;
        break;
      case '--session-id':
        sessionId = takeOptionValue(args, index, '--session-id');
        index += 1;
        break;
      case '--help':
      case '-h':
        throw new Error(showUsage);
      default:
        throw new Error(`Unknown argument: ${arg}.\n${showUsage}`);
    }
  }

  if (sessionId === undefined) {
    throw new Error(`Missing required --session-id option.\n${showUsage}`);
  }

  const result: ShowCommand = {
    kind: 'show',
    target: {},
    sessionId,
  };

  if (host !== undefined) {
    result.target.host = host;
  }

  if (uiPort !== undefined) {
    result.target.port = uiPort;
  }

  if (configFilePath !== undefined) {
    result.configFilePath = configFilePath;
  }

  return result;
};

export const parseCommand = (args: string[]): CliCommand => {
  const [command, ...rest] = args;

  if (command === undefined || command === '--help' || command === '-h') {
    throw new Error(generalUsage);
  }

  if (command === 'start') {
    return {
      kind: 'start',
      args: parseCliArgs(rest),
    };
  }

  if (command === 'doctor') {
    const parsed = parseGlobalOptionArgs(rest, doctorUsage);
    return {
      kind: 'doctor',
      ...parsed,
    };
  }

  if (command === 'list') {
    return parseListCommand(rest);
  }

  if (command === 'show') {
    return parseShowCommand(rest);
  }

  if (command === 'clear') {
    return parseClearCommand(rest);
  }

  throw new Error(`Unknown command: ${command}.\n${generalUsage}`);
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

const formatSummaryValue = (
  value: string | number | boolean | undefined,
): string => {
  if (value === undefined) {
    return '-';
  }

  return String(value);
};

const renderSessionSummaryRow = (session: SessionSummary): string => {
  return [
    `[session ${session.id}]`,
    session.method,
    session.path,
    `status=${session.status}`,
    `provider=${formatSummaryValue(session.provider)}`,
    `model=${formatSummaryValue(session.model)}`,
    `duration=${session.durationMs === undefined ? '-' : `${session.durationMs}ms`}`,
    `warnings=${session.warningCount}`,
    `error=${formatSummaryValue(session.errorCode)}`,
  ].join(' ');
};

const readErrorBody = async (response: Response): Promise<string> => {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return (
    body?.error ??
    `Observation API request failed with status ${response.status}.`
  );
};

const buildObservationBaseUrl = (host: string, port: number): string => {
  return `http://${host}:${port}`;
};

const toResolveConfigOptions = (
  overrides: LLMScopeConfig,
  configFilePath?: string,
): NonNullable<Parameters<typeof resolveConfig>[0]> => {
  return configFilePath === undefined
    ? { overrides }
    : {
        filePath: configFilePath,
        overrides,
      };
};

const resolveCommandConfig = (
  overrides: LLMScopeConfig,
  configFilePath?: string,
): ResolvedConfig => {
  return resolveConfig(toResolveConfigOptions(overrides, configFilePath));
};

const resolveObservationTarget = (
  target: { host?: string; port?: number },
  resolvedConfig: ResolvedConfig,
): { host: string; port: number } => {
  return {
    host: target.host ?? resolvedConfig.proxy.host,
    port: target.port ?? resolvedConfig.ui.port,
  };
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

const takeSingleSearchParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const toListSessionsQuery = (
  url: URL,
): { query: ListSessionsQuery } | { error: string } => {
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
  const server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        response.setHeader('access-control-allow-origin', options.corsOrigin);
        response.setHeader(
          'access-control-allow-methods',
          'GET, DELETE, OPTIONS',
        );
        response.setHeader('access-control-allow-headers', 'content-type');

        if (request.method === 'OPTIONS') {
          response.statusCode = 204;
          response.end();
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
          if (request.method === 'GET') {
            const queryResult = toListSessionsQuery(requestUrl);

            if ('error' in queryResult) {
              sendBadRequest(response, queryResult.error);
              return;
            }

            const sessions = await store.listSessions(queryResult.query);
            sendJson(response, 200, sessions);
            return;
          }

          if (request.method === 'DELETE') {
            if (requestUrl.searchParams.get('confirm') !== 'true') {
              sendBadRequest(response, 'Missing confirm=true query parameter.');
              return;
            }

            await store.clearAll();
            response.statusCode = 204;
            response.end();
            return;
          }

          sendMethodNotAllowed(response);
          return;
        }

        const sessionDetailMatch = /^\/api\/sessions\/([^/]+)$/.exec(
          requestUrl.pathname,
        );
        if (sessionDetailMatch !== null) {
          const sessionId = decodeURIComponent(sessionDetailMatch[1] ?? '');

          if (request.method === 'GET') {
            const session = await store.getSession(sessionId);

            if (session === null) {
              sendNotFound(response);
              return;
            }

            sendJson(response, 200, session);
            return;
          }

          if (request.method === 'DELETE') {
            await store.deleteSession(sessionId);
            response.statusCode = 204;
            response.end();
            return;
          }

          sendMethodNotAllowed(response);
          return;
        }

        sendNotFound(response);
      })().catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown observation server error.';

        if (response.headersSent) {
          response.end();
          return;
        }

        sendJson(response, 500, {
          error: message,
        });
      });
    },
  );

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
  const config = options.config ?? defaultConfig;
  const resolvedMaxSessions =
    options.maxSessions ?? config.storage.memory.maxSessions;

  if (config.storage.mode === 'sqlite') {
    return new SqliteSessionStore({
      filePath: config.storage.sqlite.filePath,
      maxSessions: resolvedMaxSessions,
    });
  }

  return new MemorySessionStore({
    maxSessions: resolvedMaxSessions,
  });
};

const getNodeMajorVersion = (): number => {
  const major = Number(process.versions.node.split('.')[0] ?? '0');
  return Number.isInteger(major) ? major : 0;
};

const checkPortAvailable = async (
  host: string,
  port: number,
): Promise<DoctorCheckResult> => {
  const server = createNetServer();

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off('listening', onListening);
        reject(error);
      };

      const onListening = () => {
        server.off('error', onError);
        resolve();
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });

    return {
      label: `port ${host}:${port}`,
      ok: true,
      detail: 'available',
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown port error';
    return {
      label: `port ${host}:${port}`,
      ok: false,
      detail: message,
    };
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
};

const checkDirectoryWritable = (
  directoryPath: string,
  label: string,
): DoctorCheckResult => {
  try {
    mkdirSync(directoryPath, { recursive: true });
    accessSync(directoryPath, constants.W_OK);
    return {
      label,
      ok: true,
      detail: directoryPath,
    };
  } catch (error) {
    return {
      label,
      ok: false,
      detail:
        error instanceof Error ? error.message : 'directory is not writable',
    };
  }
};

const checkSqliteWritable = (config: ResolvedConfig): DoctorCheckResult => {
  if (config.storage.mode !== 'sqlite') {
    return {
      label: 'sqlite writable',
      ok: true,
      detail: 'skipped (storage mode is not sqlite)',
    };
  }

  try {
    const store = new SqliteSessionStore({
      filePath: config.storage.sqlite.filePath,
      maxSessions: 1,
    });
    store.close();
    return {
      label: 'sqlite writable',
      ok: true,
      detail: config.storage.sqlite.filePath,
    };
  } catch (error) {
    return {
      label: 'sqlite writable',
      ok: false,
      detail:
        error instanceof Error ? error.message : 'failed to open sqlite store',
    };
  }
};

export const runDoctor = async (
  config: ResolvedConfig,
): Promise<DoctorReport> => {
  const checks: DoctorCheckResult[] = [];

  checks.push({
    label: 'node version',
    ok: getNodeMajorVersion() >= 20,
    detail: process.versions.node,
  });

  checks.push(await checkPortAvailable(config.proxy.host, config.proxy.port));

  if (config.ui.enabled) {
    checks.push(await checkPortAvailable(config.proxy.host, config.ui.port));
  } else {
    checks.push({
      label: `port ${config.proxy.host}:${config.ui.port}`,
      ok: true,
      detail: 'skipped (ui disabled)',
    });
  }

  checks.push(
    checkDirectoryWritable(
      dirname(config.storage.sqlite.filePath),
      'data directory writable',
    ),
  );
  checks.push(checkSqliteWritable(config));

  return {
    ok: checks.every((check) => check.ok),
    checks,
    config,
  };
};

const formatDoctorCheck = (check: DoctorCheckResult): string => {
  return `[${check.ok ? 'ok' : 'fail'}] ${check.label}: ${check.detail}`;
};

export const createCliRuntime = (options: CliRuntimeOptions): CliRuntime => {
  const config = options.config ?? defaultConfig;
  const resolvedHost = options.host ?? config.proxy.host;
  const resolvedPort = options.port ?? config.proxy.port;
  const route =
    options.upstreamUrl === undefined
      ? config.routes[0]
      : toRouteConfig(options.upstreamUrl);

  if (route === undefined) {
    throw new Error(
      'No upstream route configured. Provide --upstream or configure at least one route.',
    );
  }

  const store = createSessionStore(options);
  const privacy = options.privacy ?? config.privacy;
  const engine = new NodeProxyEngine({
    host: resolvedHost,
    port: resolvedPort,
    mode: config.proxy.mode,
    routeResolver: new StaticRouteResolver(toResolvedRoute(route)),
    store,
    privacy,
    providerPlugins: [
      openAiChatCompletionsPlugin,
      openAiResponsesPlugin,
      anthropicMessagesPlugin,
    ],
  });
  const observationServer = config.ui.enabled
    ? createObservationServer(store, {
        host: resolvedHost,
        port: options.observationPort ?? config.ui.port,
        corsOrigin: config.ui.corsOrigin,
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
      console.log(
        `LLMScope proxy listening on http://${address.host}:${address.port}`,
      );
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
  const command = parseCommand(args);

  if (command.kind === 'doctor') {
    const report = await runDoctor(
      resolveCommandConfig(command.configOverrides, command.configFilePath),
    );

    for (const check of report.checks) {
      console.log(formatDoctorCheck(check));
    }

    console.log(`Doctor overall status: ${report.ok ? 'ok' : 'failed'}`);

    if (!report.ok) {
      process.exitCode = 1;
    }

    return;
  }

  if (command.kind === 'clear') {
    const resolvedConfig = resolveCommandConfig({}, command.configFilePath);
    const target = resolveObservationTarget(command.target, resolvedConfig);

    const targetHost = target.host;
    const targetPort = target.port;

    const path =
      command.sessionId === undefined
        ? '/api/sessions?confirm=true'
        : `/api/sessions/${encodeURIComponent(command.sessionId)}`;

    const response = await fetch(
      `${buildObservationBaseUrl(targetHost, targetPort)}${path}`,
      {
        method: 'DELETE',
      },
    );

    if (!response.ok && response.status !== 204) {
      throw new Error(await readErrorBody(response));
    }

    console.log(
      command.sessionId === undefined
        ? 'Cleared all sessions.'
        : `Cleared session ${command.sessionId}.`,
    );
    return;
  }

  if (command.kind === 'list') {
    const resolvedConfig = resolveCommandConfig({}, command.configFilePath);
    const target = resolveObservationTarget(command.target, resolvedConfig);
    const requestUrl = new URL(
      '/api/sessions',
      buildObservationBaseUrl(target.host, target.port),
    );

    if (command.query.status !== undefined) {
      requestUrl.searchParams.set('status', command.query.status);
    }
    if (command.query.provider !== undefined) {
      requestUrl.searchParams.set('provider', command.query.provider);
    }
    if (command.query.model !== undefined) {
      requestUrl.searchParams.set('model', command.query.model);
    }
    if (command.query.search !== undefined) {
      requestUrl.searchParams.set('search', command.query.search);
    }
    if (command.query.limit !== undefined) {
      requestUrl.searchParams.set('limit', String(command.query.limit));
    }

    const response = await fetch(requestUrl);
    if (!response.ok) {
      throw new Error(await readErrorBody(response));
    }

    const sessions = (await response.json()) as SessionSummary[];

    if (sessions.length === 0) {
      console.log('No captured sessions found.');
      return;
    }

    for (const session of sessions) {
      console.log(renderSessionSummaryRow(session));
    }

    return;
  }

  if (command.kind === 'show') {
    const resolvedConfig = resolveCommandConfig({}, command.configFilePath);
    const target = resolveObservationTarget(command.target, resolvedConfig);
    const response = await fetch(
      `${buildObservationBaseUrl(target.host, target.port)}/api/sessions/${encodeURIComponent(command.sessionId)}`,
    );

    if (!response.ok) {
      throw new Error(await readErrorBody(response));
    }

    const session = (await response.json()) as Session;
    console.log(JSON.stringify(session, null, 2));
    return;
  }

  const parsedArgs = command.args;
  const resolvedConfig = resolveCommandConfig(
    parsedArgs.configOverrides,
    parsedArgs.configFilePath,
  );

  const runtime = createCliRuntime({
    ...parsedArgs.runtimeOptions,
    config: resolvedConfig,
    maxSessions: resolvedConfig.storage.memory.maxSessions,
    privacy: resolvedConfig.privacy,
    observationPort: resolvedConfig.ui.port,
    host: resolvedConfig.proxy.host,
    port: resolvedConfig.proxy.port,
  });
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

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMainModule) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Unknown CLI error.';
    console.error(message);
    process.exitCode = 1;
  });
}
