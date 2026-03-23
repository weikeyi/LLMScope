import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve as resolvePath } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export type ProxyMode = 'gateway' | 'proxy' | 'mitm';

export type StorageMode = 'memory' | 'sqlite';

export type PrivacyMode = 'strict' | 'balanced' | 'off';

export interface RouteMatchConfig {
  host?: string;
  pathPrefix?: string;
}

export interface RouteConfig {
  id: string;
  targetBaseUrl: string;
  match?: RouteMatchConfig;
  rewriteHost?: boolean;
  injectHeaders?: Record<string, string>;
  removeHeaders?: string[];
}

export interface ProxyConfig {
  host?: string;
  port?: number;
  mode?: ProxyMode;
}

export interface UiConfig {
  enabled?: boolean;
  port?: number;
  corsOrigin?: string;
}

export interface MemoryStorageConfig {
  maxSessions?: number;
}

export interface SqliteStorageConfig {
  filePath?: string;
}

export interface StorageConfig {
  mode?: StorageMode;
  memory?: MemoryStorageConfig;
  sqlite?: SqliteStorageConfig;
}

export interface PrivacyConfig {
  mode?: PrivacyMode;
}

export interface LLMScopeConfig {
  proxy?: ProxyConfig;
  ui?: UiConfig;
  storage?: StorageConfig;
  privacy?: PrivacyConfig;
  routes?: RouteConfig[];
}

export interface ResolvedProxyConfig {
  host: string;
  port: number;
  mode: ProxyMode;
}

export interface ResolvedUiConfig {
  enabled: boolean;
  port: number;
  corsOrigin: string;
}

export interface ResolvedMemoryStorageConfig {
  maxSessions: number;
}

export interface ResolvedSqliteStorageConfig {
  filePath: string;
}

export interface ResolvedStorageConfig {
  mode: StorageMode;
  memory: ResolvedMemoryStorageConfig;
  sqlite: ResolvedSqliteStorageConfig;
}

export interface ResolvedPrivacyConfig {
  mode: PrivacyMode;
}

export interface ResolvedConfig {
  proxy: ResolvedProxyConfig;
  ui: ResolvedUiConfig;
  storage: ResolvedStorageConfig;
  privacy: ResolvedPrivacyConfig;
  routes: RouteConfig[];
}

export interface ResolveConfigOptions {
  cwd?: string;
  filePath?: string;
  env?: NodeJS.ProcessEnv;
  overrides?: LLMScopeConfig;
}

const proxyModeSchema = z.enum(['gateway', 'proxy', 'mitm']);
const storageModeSchema = z.enum(['memory', 'sqlite']);
const privacyModeSchema = z.enum(['strict', 'balanced', 'off']);

const routeMatchConfigSchema = z
  .object({
    host: z.string().min(1).optional(),
    pathPrefix: z.string().min(1).optional(),
  })
  .strict();

const routeConfigSchema = z
  .object({
    id: z.string().min(1),
    targetBaseUrl: z.string().url(),
    match: routeMatchConfigSchema.optional(),
    rewriteHost: z.boolean().optional(),
    injectHeaders: z.record(z.string(), z.string()).optional(),
    removeHeaders: z.array(z.string().min(1)).optional(),
  })
  .strict();

const proxyConfigSchema = z
  .object({
    host: z.string().min(1).optional(),
    port: z.number().int().min(0).optional(),
    mode: proxyModeSchema.optional(),
  })
  .strict();

const uiConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    port: z.number().int().min(0).optional(),
    corsOrigin: z.string().url().optional(),
  })
  .strict();

const memoryStorageConfigSchema = z
  .object({
    maxSessions: z.number().int().min(1).optional(),
  })
  .strict();

const sqliteStorageConfigSchema = z
  .object({
    filePath: z.string().min(1).optional(),
  })
  .strict();

const storageConfigSchema = z
  .object({
    mode: storageModeSchema.optional(),
    memory: memoryStorageConfigSchema.optional(),
    sqlite: sqliteStorageConfigSchema.optional(),
  })
  .strict();

const privacyConfigSchema = z
  .object({
    mode: privacyModeSchema.optional(),
  })
  .strict();

const llmScopeConfigSchema = z
  .object({
    proxy: proxyConfigSchema.optional(),
    ui: uiConfigSchema.optional(),
    storage: storageConfigSchema.optional(),
    privacy: privacyConfigSchema.optional(),
    routes: z.array(routeConfigSchema).optional(),
  })
  .strict();

export const defaultConfig: ResolvedConfig = {
  proxy: {
    host: '127.0.0.1',
    port: 8787,
    mode: 'gateway',
  },
  ui: {
    enabled: true,
    port: 8788,
    corsOrigin: 'http://127.0.0.1:8788',
  },
  storage: {
    mode: 'memory',
    memory: {
      maxSessions: 500,
    },
    sqlite: {
      filePath: './data/llmscope.db',
    },
  },
  privacy: {
    mode: 'balanced',
  },
  routes: [],
};

const clone = <T>(value: T): T => structuredClone(value);

const normalizeConfig = (input: unknown): LLMScopeConfig => {
  const parsed = llmScopeConfigSchema.parse(input);
  const normalized: LLMScopeConfig = {};

  if (parsed.proxy !== undefined) {
    const proxy: ProxyConfig = {};

    if (parsed.proxy.host !== undefined) {
      proxy.host = parsed.proxy.host;
    }

    if (parsed.proxy.port !== undefined) {
      proxy.port = parsed.proxy.port;
    }

    if (parsed.proxy.mode !== undefined) {
      proxy.mode = parsed.proxy.mode;
    }

    normalized.proxy = proxy;
  }

  if (parsed.ui !== undefined) {
    const ui: UiConfig = {};

    if (parsed.ui.enabled !== undefined) {
      ui.enabled = parsed.ui.enabled;
    }

    if (parsed.ui.port !== undefined) {
      ui.port = parsed.ui.port;
    }

    if (parsed.ui.corsOrigin !== undefined) {
      ui.corsOrigin = parsed.ui.corsOrigin;
    }

    normalized.ui = ui;
  }

  if (parsed.storage !== undefined) {
    const storage: StorageConfig = {};

    if (parsed.storage.mode !== undefined) {
      storage.mode = parsed.storage.mode;
    }

    if (parsed.storage.memory !== undefined) {
      const memory: MemoryStorageConfig = {};

      if (parsed.storage.memory.maxSessions !== undefined) {
        memory.maxSessions = parsed.storage.memory.maxSessions;
      }

      storage.memory = memory;
    }

    if (parsed.storage.sqlite !== undefined) {
      const sqlite: SqliteStorageConfig = {};

      if (parsed.storage.sqlite.filePath !== undefined) {
        sqlite.filePath = parsed.storage.sqlite.filePath;
      }

      storage.sqlite = sqlite;
    }

    normalized.storage = storage;
  }

  if (parsed.privacy !== undefined) {
    const privacy: PrivacyConfig = {};

    if (parsed.privacy.mode !== undefined) {
      privacy.mode = parsed.privacy.mode;
    }

    normalized.privacy = privacy;
  }

  if (parsed.routes !== undefined) {
    normalized.routes = parsed.routes.map((route) => {
      const normalizedRoute: RouteConfig = {
        id: route.id,
        targetBaseUrl: route.targetBaseUrl,
      };

      if (route.match !== undefined) {
        const match: RouteMatchConfig = {};

        if (route.match.host !== undefined) {
          match.host = route.match.host;
        }

        if (route.match.pathPrefix !== undefined) {
          match.pathPrefix = route.match.pathPrefix;
        }

        normalizedRoute.match = match;
      }

      if (route.rewriteHost !== undefined) {
        normalizedRoute.rewriteHost = route.rewriteHost;
      }

      if (route.injectHeaders !== undefined) {
        normalizedRoute.injectHeaders = route.injectHeaders;
      }

      if (route.removeHeaders !== undefined) {
        normalizedRoute.removeHeaders = route.removeHeaders;
      }

      return normalizedRoute;
    });
  }

  return normalized;
};

const createConfigError = (message: string, cause?: unknown): Error => {
  const error = new Error(message);

  if (cause !== undefined) {
    (error as Error & { cause?: unknown }).cause = cause;
  }

  return error;
};

const parseBoolean = (
  name: string,
  value: string | undefined,
): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true' || value === '1') {
    return true;
  }

  if (value === 'false' || value === '0') {
    return false;
  }

  throw createConfigError(`Invalid boolean value for ${name}: ${value}.`);
};

const parseInteger = (
  name: string,
  value: string | undefined,
  min: number,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw createConfigError(`Invalid numeric value for ${name}: ${value}.`);
  }

  return parsed;
};

const normalizeBaseUrl = (value: string, label: string): string => {
  try {
    return new URL(value).toString();
  } catch (error) {
    throw createConfigError(`Invalid URL for ${label}: ${value}.`, error);
  }
};

const mergeConfig = (
  base: LLMScopeConfig,
  overlay: LLMScopeConfig,
): LLMScopeConfig => {
  const merged: LLMScopeConfig = {};

  if (base.proxy !== undefined || overlay.proxy !== undefined) {
    merged.proxy = {
      ...base.proxy,
      ...overlay.proxy,
    };
  }

  if (base.ui !== undefined || overlay.ui !== undefined) {
    merged.ui = {
      ...base.ui,
      ...overlay.ui,
    };
  }

  if (base.storage !== undefined || overlay.storage !== undefined) {
    const storage: StorageConfig = {
      ...base.storage,
      ...overlay.storage,
    };

    if (
      base.storage?.memory !== undefined ||
      overlay.storage?.memory !== undefined
    ) {
      storage.memory = {
        ...base.storage?.memory,
        ...overlay.storage?.memory,
      };
    }

    if (
      base.storage?.sqlite !== undefined ||
      overlay.storage?.sqlite !== undefined
    ) {
      storage.sqlite = {
        ...base.storage?.sqlite,
        ...overlay.storage?.sqlite,
      };
    }

    merged.storage = storage;
  }

  if (base.privacy !== undefined || overlay.privacy !== undefined) {
    merged.privacy = {
      ...base.privacy,
      ...overlay.privacy,
    };
  }

  if (overlay.routes !== undefined) {
    merged.routes = overlay.routes;
  } else if (base.routes !== undefined) {
    merged.routes = base.routes;
  }

  return merged;
};

const toEnvConfig = (env: NodeJS.ProcessEnv): LLMScopeConfig => {
  const proxyHost = env.LLMSCOPE_PROXY_HOST;
  const proxyPort = parseInteger(
    'LLMSCOPE_PROXY_PORT',
    env.LLMSCOPE_PROXY_PORT,
    0,
  );
  const proxyMode = env.LLMSCOPE_PROXY_MODE;
  const uiEnabled = parseBoolean(
    'LLMSCOPE_UI_ENABLED',
    env.LLMSCOPE_UI_ENABLED,
  );
  const uiPort = parseInteger('LLMSCOPE_UI_PORT', env.LLMSCOPE_UI_PORT, 0);
  const uiCorsOrigin = env.LLMSCOPE_UI_CORS_ORIGIN;
  const storageMode = env.LLMSCOPE_STORAGE_MODE;
  const maxSessions = parseInteger(
    'LLMSCOPE_STORAGE_MEMORY_MAX_SESSIONS',
    env.LLMSCOPE_STORAGE_MEMORY_MAX_SESSIONS,
    1,
  );
  const sqliteFilePath = env.LLMSCOPE_STORAGE_SQLITE_FILE_PATH;
  const privacyMode = env.LLMSCOPE_PRIVACY_MODE;
  const routeTargetBaseUrl = env.LLMSCOPE_ROUTE_TARGET_BASE_URL;

  const config: LLMScopeConfig = {};

  if (
    proxyHost !== undefined ||
    proxyPort !== undefined ||
    proxyMode !== undefined
  ) {
    config.proxy = {};

    if (proxyHost !== undefined) {
      config.proxy.host = proxyHost;
    }

    if (proxyPort !== undefined) {
      config.proxy.port = proxyPort;
    }

    if (proxyMode !== undefined) {
      config.proxy.mode = proxyMode as ProxyMode;
    }
  }

  if (
    uiEnabled !== undefined ||
    uiPort !== undefined ||
    uiCorsOrigin !== undefined
  ) {
    config.ui = {};

    if (uiEnabled !== undefined) {
      config.ui.enabled = uiEnabled;
    }

    if (uiPort !== undefined) {
      config.ui.port = uiPort;
    }

    if (uiCorsOrigin !== undefined) {
      config.ui.corsOrigin = uiCorsOrigin;
    }
  }

  if (
    storageMode !== undefined ||
    maxSessions !== undefined ||
    sqliteFilePath !== undefined
  ) {
    config.storage = {};

    if (storageMode !== undefined) {
      config.storage.mode = storageMode as StorageMode;
    }

    if (maxSessions !== undefined) {
      config.storage.memory = {
        maxSessions,
      };
    }

    if (sqliteFilePath !== undefined) {
      config.storage.sqlite = {
        filePath: sqliteFilePath,
      };
    }
  }

  if (privacyMode !== undefined) {
    config.privacy = {
      mode: privacyMode as PrivacyMode,
    };
  }

  if (routeTargetBaseUrl !== undefined) {
    config.routes = [
      {
        id: 'default',
        targetBaseUrl: routeTargetBaseUrl,
        rewriteHost: true,
      },
    ];
  }

  return normalizeConfig(config);
};

const normalizeConfigFilePath = (cwd: string, filePath: string): string => {
  return isAbsolute(filePath) ? filePath : resolvePath(cwd, filePath);
};

const DEFAULT_CONFIG_FILE_NAMES = [
  'llmscope.yaml',
  'llmscope.yml',
  'llmscope.json',
] as const;

const findDefaultConfigFilePath = (cwd: string): string | undefined => {
  for (const fileName of DEFAULT_CONFIG_FILE_NAMES) {
    const candidatePath = resolvePath(cwd, fileName);

    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return undefined;
};

const parseConfigFile = (filePath: string, rawText: string): unknown => {
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return parseYaml(rawText);
  }

  if (filePath.endsWith('.json')) {
    return JSON.parse(rawText) as unknown;
  }

  throw createConfigError(
    `Unsupported config file format: ${filePath}. Use .json, .yaml, or .yml.`,
  );
};

export const loadConfigFile = (
  filePath: string,
  cwd = process.cwd(),
): LLMScopeConfig => {
  const resolvedFilePath = normalizeConfigFilePath(cwd, filePath);

  if (!existsSync(resolvedFilePath)) {
    throw createConfigError(`Config file not found: ${resolvedFilePath}.`);
  }

  try {
    const rawText = readFileSync(resolvedFilePath, 'utf8');
    const parsed = parseConfigFile(resolvedFilePath, rawText);
    return normalizeConfig(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw createConfigError(
        `Invalid LLMScope config in ${resolvedFilePath}: ${error.message}`,
        error,
      );
    }

    if (
      error instanceof Error &&
      error.message.startsWith('Unsupported config file format')
    ) {
      throw error;
    }

    throw createConfigError(
      `Failed to load config file ${resolvedFilePath}: ${error instanceof Error ? error.message : 'Unknown error.'}`,
      error,
    );
  }
};

export const resolveConfig = (
  options: ResolveConfigOptions = {},
): ResolvedConfig => {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const resolvedFilePath =
    options.filePath ?? findDefaultConfigFilePath(cwd);

  const fileConfig =
    resolvedFilePath === undefined
      ? ({} as LLMScopeConfig)
      : loadConfigFile(resolvedFilePath, cwd);
  const envConfig = toEnvConfig(env);
  const overrideConfig = normalizeConfig(options.overrides ?? {});

  const merged = mergeConfig(
    mergeConfig(fileConfig, envConfig),
    overrideConfig,
  );

  const proxyPort = merged.proxy?.port ?? defaultConfig.proxy.port;
  const uiPort = merged.ui?.port ?? defaultConfig.ui.port;
  const uiCorsOrigin = merged.ui?.corsOrigin ?? `http://127.0.0.1:${uiPort}`;
  const routes = (merged.routes ?? []).map((route) => ({
    ...route,
    targetBaseUrl: normalizeBaseUrl(
      route.targetBaseUrl,
      `routes.${route.id}.targetBaseUrl`,
    ),
  }));

  return {
    proxy: {
      host: merged.proxy?.host ?? defaultConfig.proxy.host,
      port: proxyPort,
      mode: merged.proxy?.mode ?? defaultConfig.proxy.mode,
    },
    ui: {
      enabled: merged.ui?.enabled ?? defaultConfig.ui.enabled,
      port: uiPort,
      corsOrigin: uiCorsOrigin,
    },
    storage: {
      mode: merged.storage?.mode ?? defaultConfig.storage.mode,
      memory: {
        maxSessions:
          merged.storage?.memory?.maxSessions ??
          defaultConfig.storage.memory.maxSessions,
      },
      sqlite: {
        filePath:
          merged.storage?.sqlite?.filePath ??
          defaultConfig.storage.sqlite.filePath,
      },
    },
    privacy: {
      mode: merged.privacy?.mode ?? defaultConfig.privacy.mode,
    },
    routes,
  };
};

export const toConfigOverrides = (config: ResolvedConfig): LLMScopeConfig => {
  const overrides: LLMScopeConfig = {
    proxy: clone(config.proxy),
    ui: clone(config.ui),
    storage: clone(config.storage),
    privacy: clone(config.privacy),
  };

  if (config.routes.length > 0) {
    overrides.routes = clone(config.routes);
  }

  return overrides;
};
