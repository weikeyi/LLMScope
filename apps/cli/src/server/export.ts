import type { SessionStore } from '@llmscope/core';
import type { ListSessionsQuery, Session } from '@llmscope/shared-types';

export type ExportFormat = 'json' | 'ndjson' | 'markdown';

export interface ExportRequest {
  format: ExportFormat;
  sessionId?: string;
  sessionIds?: string[];
  query?: ListSessionsQuery;
}

const getSessionOrThrow = async (
  store: SessionStore,
  sessionId: string,
): Promise<Session> => {
  const session = await store.getSession(sessionId);

  if (session === null) {
    throw new Error(`Session not found: ${sessionId}.`);
  }

  return session;
};

const loadSessionsFromQuery = async (
  store: SessionStore,
  query: ListSessionsQuery,
): Promise<Session[]> => {
  const summaries = await store.listSessions(query);
  const sessions: Session[] = [];

  for (const summary of summaries) {
    sessions.push(await getSessionOrThrow(store, summary.id));
  }

  return sessions;
};

const loadSessionsFromIds = async (
  store: SessionStore,
  sessionIds: string[],
): Promise<Session[]> => {
  const sessions: Session[] = [];

  for (const sessionId of sessionIds) {
    sessions.push(await getSessionOrThrow(store, sessionId));
  }

  return sessions;
};

export const loadExportSessions = async (
  store: SessionStore,
  request: ExportRequest,
): Promise<Session[]> => {
  if (request.sessionId !== undefined) {
    return [await getSessionOrThrow(store, request.sessionId)];
  }

  if (request.sessionIds !== undefined && request.sessionIds.length > 0) {
    return loadSessionsFromIds(store, request.sessionIds);
  }

  return loadSessionsFromQuery(store, request.query ?? {});
};

const renderMarkdownSession = (session: Session): string => {
  return [
    `## Session ${session.id}`,
    '',
    `- Method: ${session.transport.method}`,
    `- Path: ${session.transport.path}`,
    `- Status: ${session.status}`,
    `- Provider: ${session.normalized?.provider ?? 'unknown'}`,
    `- API style: ${session.normalized?.apiStyle ?? 'unknown'}`,
    `- Model: ${session.normalized?.model ?? 'unknown'}`,
    '',
    '```json',
    JSON.stringify(session, null, 2),
    '```',
  ].join('\n');
};

export const serializeExport = (
  request: ExportRequest,
  sessions: Session[],
): string => {
  if (request.format === 'json') {
    return request.sessionId !== undefined
      ? JSON.stringify(sessions[0] ?? null, null, 2)
      : JSON.stringify(sessions, null, 2);
  }

  if (request.format === 'ndjson') {
    return sessions.map((session) => JSON.stringify(session)).join('\n');
  }

  return ['# LLMScope Export', '', ...sessions.map(renderMarkdownSession)].join(
    '\n',
  );
};

export const getExportContentType = (format: ExportFormat): string => {
  if (format === 'json') {
    return 'application/json; charset=utf-8';
  }

  if (format === 'ndjson') {
    return 'application/x-ndjson; charset=utf-8';
  }

  return 'text/markdown; charset=utf-8';
};
