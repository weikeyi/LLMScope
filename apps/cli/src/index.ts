import { accessSync, constants, mkdirSync } from 'node:fs';
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
  SessionStatus,
} from '@llmscope/shared-types';
import { MemorySessionStore } from '@llmscope/storage-memory';
import { SqliteSessionStore } from '@llmscope/storage-sqlite';

import { runClearCommand } from './commands/clear.js';
import { runDoctorCommand } from './commands/doctor.js';
import { runExportCommand } from './commands/export.js';
import { runListCommand } from './commands/list.js';
import { resolveCommandConfig } from './commands/shared.js';
import { runShowCommand } from './commands/show.js';
import { runStartCommand } from './commands/start.js';
import { createObservationServer, type ObservationServer } from './server/http.js';
import type { ExportFormat } from './server/export.js';

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

export interface ExportCommand {
  kind: 'export';
  configFilePath?: string;
  target: {
    host?: string;
    port?: number;
  };
  sessionId?: string;
  format: ExportFormat;
  outputPath?: string;
  query: ListSessionsQuery;
}

export type CliCommand =
  | StartCommand
  | DoctorCommand
  | ClearCommand
  | ListCommand
  | ShowCommand
  | ExportCommand;

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

const EXIT_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

const generalUsage = [
  'Usage:',
  '  llmscope-cli start [--upstream <url>] [--config <path>] [--host <host>] [--port <port>] [--ui-port <port>]',
  '  llmscope-cli doctor [--config <path>] [--host <host>] [--port <port>] [--ui-port <port>]',
  '  llmscope-cli list [--config <path>] [--host <host>] [--ui-port <port>] [--status <status>] [--provider <provider>] [--model <model>] [--search <text>] [--limit <n>]',
  '  llmscope-cli show --session-id <id> [--config <path>] [--host <host>] [--ui-port <port>]',
  '  llmscope-cli clear [--host <host>] [--ui-port <port>] [--session-id <id>]',
  '  llmscope-cli export [--config <path>] [--host <host>] [--ui-port <port>] [--session-id <id>] [--format json|ndjson|markdown] [--output <path>] [--status <status>] [--provider <provider>] [--model <model>] [--search <text>] [--limit <n>]',
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

const exportUsage =
  'Usage: llmscope-cli export [--config <path>] [--host <host>] [--ui-port <port>] [--session-id <id>] [--format json|ndjson|markdown] [--output <path>] [--status <status>] [--provider <provider>] [--model <model>] [--search <text>] [--limit <n>]';

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

const parseExportCommand = (args: string[]): ExportCommand => {
  let host: string | undefined;
  let uiPort: number | undefined;
  let configFilePath: string | undefined;
  let sessionId: string | undefined;
  let outputPath: string | undefined;
  let format: ExportFormat = 'json';
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
      case '--session-id':
        sessionId = takeOptionValue(args, index, '--session-id');
        index += 1;
        break;
      case '--format': {
        const value = takeOptionValue(args, index, '--format');

        if (value !== 'json' && value !== 'ndjson' && value !== 'markdown') {
          throw new Error(`Invalid value for --format: ${value}.`);
        }

        format = value;
        index += 1;
        break;
      }
      case '--output':
        outputPath = takeOptionValue(args, index, '--output');
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
        throw new Error(exportUsage);
      default:
        throw new Error(`Unknown argument: ${arg}.\n${exportUsage}`);
    }
  }

  const hasCollectionFilters =
    query.status !== undefined ||
    query.provider !== undefined ||
    query.model !== undefined ||
    query.search !== undefined ||
    query.limit !== undefined;

  if (sessionId !== undefined && hasCollectionFilters) {
    throw new Error(
      'The --session-id option cannot be combined with collection filters.',
    );
  }

  const result: ExportCommand = {
    kind: 'export',
    target: {},
    format,
    query,
  };

  if (sessionId !== undefined) {
    result.sessionId = sessionId;
  }

  if (host !== undefined) {
    result.target.host = host;
  }

  if (uiPort !== undefined) {
    result.target.port = uiPort;
  }

  if (configFilePath !== undefined) {
    result.configFilePath = configFilePath;
  }

  if (outputPath !== undefined) {
    result.outputPath = outputPath;
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

  if (command === 'export') {
    return parseExportCommand(rest);
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

const isSessionStatus = (value: string): value is SessionStatus => {
  return ['pending', 'streaming', 'completed', 'error'].includes(value);
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
        config,
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
    await runDoctorCommand(command, runDoctor);
    return;
  }

  if (command.kind === 'clear') {
    await runClearCommand(command);
    return;
  }

  if (command.kind === 'list') {
    await runListCommand(command);
    return;
  }

  if (command.kind === 'show') {
    await runShowCommand(command);
    return;
  }

  if (command.kind === 'export') {
    await runExportCommand(command);
    return;
  }

  const parsedArgs = command.args;
  const resolvedConfig = resolveCommandConfig(
    parsedArgs.configOverrides,
    parsedArgs.configFilePath,
  );

  await runStartCommand(parsedArgs, resolvedConfig, createCliRuntime);
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
