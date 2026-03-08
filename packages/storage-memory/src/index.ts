import type { SessionStore } from '@llmscope/core';
import type {
  CanonicalStreamEvent,
  ListSessionsQuery,
  Session,
  SessionSummary,
} from '@llmscope/shared-types';

export interface MemorySessionStoreOptions {
  maxSessions?: number;
}

const DEFAULT_MAX_SESSIONS = 500;

const clone = <T>(value: T): T => structuredClone(value);

export const toSessionSummary = (session: Session): SessionSummary => {
  const summary: SessionSummary = {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    method: session.transport.method,
    path: session.transport.path,
    warningCount: session.warnings?.length ?? 0,
  };

  if (session.endedAt !== undefined) {
    summary.endedAt = session.endedAt;
  }

  if (session.normalized?.provider !== undefined) {
    summary.provider = session.normalized.provider;
  }

  if (session.normalized?.model !== undefined) {
    summary.model = session.normalized.model;
  }

  if (session.transport.statusCode !== undefined) {
    summary.statusCode = session.transport.statusCode;
  }

  if (session.transport.durationMs !== undefined) {
    summary.durationMs = session.transport.durationMs;
  }

  if (session.normalized?.stream !== undefined) {
    summary.stream = session.normalized.stream;
  }

  if (session.error?.code !== undefined) {
    summary.errorCode = session.error.code;
  }

  return summary;
};

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  private readonly maxSessions: number;

  public constructor(options: MemorySessionStoreOptions = {}) {
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  }

  public async saveSession(session: Session): Promise<void> {
    this.setSession(session.id, session);
  }

  public async updateSession(session: Session): Promise<void> {
    this.setSession(session.id, session);
  }

  public async appendStreamEvent(
    sessionId: string,
    event: CanonicalStreamEvent,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session === undefined) {
      return;
    }

    const nextSession = clone(session);
    nextSession.streamEvents = [...(nextSession.streamEvents ?? []), clone(event)];
    this.setSession(sessionId, nextSession);
  }

  public async listSessions(
    query: ListSessionsQuery = {},
  ): Promise<SessionSummary[]> {
    const normalizedSearch = query.search?.trim().toLowerCase();

    const filtered = Array.from(this.sessions.values())
      .filter((session) => {
        if (query.status !== undefined && session.status !== query.status) {
          return false;
        }

        if (
          query.provider !== undefined &&
          session.normalized?.provider !== query.provider
        ) {
          return false;
        }

        if (query.model !== undefined && session.normalized?.model !== query.model) {
          return false;
        }

        if (normalizedSearch === undefined || normalizedSearch.length === 0) {
          return true;
        }

        const haystacks = [
          session.id,
          session.transport.method,
          session.transport.path,
          session.transport.url,
          session.normalized?.provider,
          session.normalized?.model,
          session.routing.matchedEndpoint,
        ].filter((value): value is string => value !== undefined);

        return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, query.limit ?? Number.POSITIVE_INFINITY)
      .map((session) => toSessionSummary(clone(session)));

    return filtered;
  }

  public async getSession(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);

    if (session === undefined) {
      return null;
    }

    this.touch(sessionId, session);
    return clone(session);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  public async clearAll(): Promise<void> {
    this.sessions.clear();
  }

  private setSession(sessionId: string, session: Session): void {
    this.touch(sessionId, clone(session));
    this.evictIfNeeded();
  }

  private touch(sessionId: string, session: Session): void {
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, session);
  }

  private evictIfNeeded(): void {
    while (this.sessions.size > this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value;

      if (oldestKey === undefined) {
        return;
      }

      this.sessions.delete(oldestKey);
    }
  }
}

