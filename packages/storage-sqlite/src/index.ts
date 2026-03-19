import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

import type { SessionStore } from '@llmscope/core';
import type {
  CanonicalStreamEvent,
  ListSessionsQuery,
  Session,
  SessionSummary,
} from '@llmscope/shared-types';

export interface SqliteSessionStoreOptions {
  filePath: string;
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

export class SqliteSessionStore implements SessionStore {
  private readonly database: Database.Database;

  private readonly maxSessions: number;

  public constructor(options: SqliteSessionStoreOptions) {
    mkdirSync(dirname(options.filePath), { recursive: true });
    this.database = new Database(options.filePath);
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.database.exec(
      [
        'CREATE TABLE IF NOT EXISTS sessions (',
        '  session_id TEXT PRIMARY KEY,',
        '  session_json TEXT NOT NULL,',
        '  started_at TEXT NOT NULL,',
        '  last_accessed_at INTEGER NOT NULL',
        ')',
      ].join(' '),
    );
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
    const session = this.readSession(sessionId);

    if (session === null) {
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

    const sessions = this.readAllSessions()
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

    return sessions;
  }

  public async getSession(sessionId: string): Promise<Session | null> {
    const session = this.readSession(sessionId);

    if (session === null) {
      return null;
    }

    this.touch(sessionId);
    return clone(session);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    this.database.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
  }

  public async clearAll(): Promise<void> {
    this.database.prepare('DELETE FROM sessions').run();
  }

  public close(): void {
    this.database.close();
  }

  private setSession(sessionId: string, session: Session): void {
    const stored = clone(session);
    this.database
      .prepare(
        [
          'INSERT INTO sessions (session_id, session_json, started_at, last_accessed_at)',
          'VALUES (?, ?, ?, ?)',
          'ON CONFLICT(session_id) DO UPDATE SET',
          '  session_json = excluded.session_json,',
          '  started_at = excluded.started_at,',
          '  last_accessed_at = excluded.last_accessed_at',
        ].join(' '),
      )
      .run(sessionId, JSON.stringify(stored), stored.startedAt, Date.now());
    this.evictIfNeeded();
  }

  private touch(sessionId: string): void {
    this.database
      .prepare('UPDATE sessions SET last_accessed_at = ? WHERE session_id = ?')
      .run(Date.now(), sessionId);
  }

  private evictIfNeeded(): void {
    const row = this.database
      .prepare('SELECT COUNT(*) AS count FROM sessions')
      .get() as { count: number };

    while (row.count > this.maxSessions) {
      const oldest = this.database
        .prepare(
          [
            'SELECT session_id FROM sessions',
            'ORDER BY last_accessed_at ASC, rowid ASC',
            'LIMIT 1',
          ].join(' '),
        )
        .get() as { session_id: string } | undefined;

      if (oldest?.session_id === undefined) {
        return;
      }

      this.database.prepare('DELETE FROM sessions WHERE session_id = ?').run(oldest.session_id);
      row.count -= 1;
    }
  }

  private readSession(sessionId: string): Session | null {
    const row = this.database
      .prepare('SELECT session_json FROM sessions WHERE session_id = ?')
      .get(sessionId) as { session_json: string } | undefined;

    if (row?.session_json === undefined) {
      return null;
    }

    return JSON.parse(row.session_json) as Session;
  }

  private readAllSessions(): Session[] {
    const rows = this.database
      .prepare('SELECT session_json FROM sessions')
      .all() as Array<{ session_json: string }>;

    return rows.map((row) => JSON.parse(row.session_json) as Session);
  }
}
