import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

import type { SessionStore } from '@llmscope/core';
import type { ResolvedConfig } from '@llmscope/config';
import type { ListSessionsQuery, SessionStatus } from '@llmscope/shared-types';

import {
  getExportContentType,
  loadExportSessions,
  serializeExport,
  type ExportFormat,
  type ExportRequest,
} from './export.js';

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

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const body = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(body) as unknown;
};

const isExportFormat = (value: unknown): value is ExportFormat => {
  return value === 'json' || value === 'ndjson' || value === 'markdown';
};

const toExportRequest = (value: unknown): ExportRequest => {
  if (value === null || typeof value !== 'object') {
    throw new Error('Export request body must be a JSON object.');
  }

  const record = value as Record<string, unknown>;
  const format = record.format;

  if (!isExportFormat(format)) {
    throw new Error('Export format must be one of json, ndjson, or markdown.');
  }

  const exportRequest: ExportRequest = {
    format,
  };

  if (typeof record.sessionId === 'string' && record.sessionId.length > 0) {
    exportRequest.sessionId = record.sessionId;
  }

  if (Array.isArray(record.sessionIds)) {
    exportRequest.sessionIds = record.sessionIds.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
  }

  if (record.query !== undefined) {
    const queryRecord =
      record.query !== null && typeof record.query === 'object'
        ? (record.query as Record<string, unknown>)
        : {};

    const query: ListSessionsQuery = {};

    if (
      typeof queryRecord.status === 'string' &&
      isSessionStatus(queryRecord.status)
    ) {
      query.status = queryRecord.status;
    }

    if (typeof queryRecord.provider === 'string') {
      query.provider = queryRecord.provider;
    }

    if (typeof queryRecord.model === 'string') {
      query.model = queryRecord.model;
    }

    if (typeof queryRecord.search === 'string') {
      query.search = queryRecord.search;
    }

    if (
      typeof queryRecord.limit === 'number' &&
      Number.isInteger(queryRecord.limit) &&
      queryRecord.limit >= 0
    ) {
      query.limit = queryRecord.limit;
    }

    exportRequest.query = query;
  }

  return exportRequest;
};

export const handleObservationRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    store: SessionStore;
    config: ResolvedConfig;
    host: string;
    port: number;
    corsOrigin: string;
  },
): Promise<void> => {
  response.setHeader('access-control-allow-origin', options.corsOrigin);
  response.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
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

  if (requestUrl.pathname === '/api/config') {
    if (request.method !== 'GET') {
      sendMethodNotAllowed(response);
      return;
    }

    sendJson(response, 200, options.config);
    return;
  }

  if (requestUrl.pathname === '/api/sessions/export') {
    if (request.method !== 'POST') {
      sendMethodNotAllowed(response);
      return;
    }

    const exportRequest = toExportRequest(await readJsonBody(request));
    const sessions = await loadExportSessions(options.store, exportRequest);
    const payload = serializeExport(exportRequest, sessions);

    response.statusCode = 200;
    response.setHeader(
      'content-type',
      getExportContentType(exportRequest.format),
    );
    response.end(payload);
    return;
  }

  if (requestUrl.pathname === '/api/sessions') {
    if (request.method === 'GET') {
      const queryResult = toListSessionsQuery(requestUrl);

      if ('error' in queryResult) {
        sendBadRequest(response, queryResult.error);
        return;
      }

      const sessions = await options.store.listSessions(queryResult.query);
      sendJson(response, 200, sessions);
      return;
    }

    if (request.method === 'DELETE') {
      if (requestUrl.searchParams.get('confirm') !== 'true') {
        sendBadRequest(response, 'Missing confirm=true query parameter.');
        return;
      }

      await options.store.clearAll();
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
      const session = await options.store.getSession(sessionId);

      if (session === null) {
        sendNotFound(response);
        return;
      }

      sendJson(response, 200, session);
      return;
    }

    if (request.method === 'DELETE') {
      await options.store.deleteSession(sessionId);
      response.statusCode = 204;
      response.end();
      return;
    }

    sendMethodNotAllowed(response);
    return;
  }

  sendNotFound(response);
};
