import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { URL } from 'node:url';

import {
  resolveConfig,
  type LLMScopeConfig,
  type ResolvedConfig,
} from '@llmscope/config';

export const readErrorBody = async (response: Response): Promise<string> => {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return (
    body?.error ??
    `Observation API request failed with status ${response.status}.`
  );
};

export const buildObservationBaseUrl = (host: string, port: number): string => {
  return `http://${host}:${port}`;
};

export const toResolveConfigOptions = (
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

export const resolveCommandConfig = (
  overrides: LLMScopeConfig,
  configFilePath?: string,
): ResolvedConfig => {
  return resolveConfig(toResolveConfigOptions(overrides, configFilePath));
};

export const resolveObservationTarget = (
  target: { host?: string; port?: number },
  resolvedConfig: ResolvedConfig,
): { host: string; port: number } => {
  return {
    host: target.host ?? resolvedConfig.proxy.host,
    port: target.port ?? resolvedConfig.ui.port,
  };
};

export const setListQueryParams = (
  requestUrl: URL,
  query: {
    status?: string;
    provider?: string;
    model?: string;
    search?: string;
    limit?: number;
  },
): void => {
  if (query.status !== undefined) {
    requestUrl.searchParams.set('status', query.status);
  }
  if (query.provider !== undefined) {
    requestUrl.searchParams.set('provider', query.provider);
  }
  if (query.model !== undefined) {
    requestUrl.searchParams.set('model', query.model);
  }
  if (query.search !== undefined) {
    requestUrl.searchParams.set('search', query.search);
  }
  if (query.limit !== undefined) {
    requestUrl.searchParams.set('limit', String(query.limit));
  }
};

export const writeCommandOutput = (
  payload: string,
  outputPath?: string,
): void => {
  if (outputPath === undefined) {
    process.stdout.write(payload);
    if (!payload.endsWith('\n')) {
      process.stdout.write('\n');
    }
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, payload, 'utf8');
};
