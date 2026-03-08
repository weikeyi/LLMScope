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
