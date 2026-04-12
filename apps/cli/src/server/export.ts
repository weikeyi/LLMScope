import type { SessionStore } from '@llmscope/core';
import type { ExportRequest } from '@llmscope/replay';
import type { ListSessionsQuery, Session } from '@llmscope/shared-types';

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
