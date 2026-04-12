import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
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
  cwd?: string;
}

const DEFAULT_MAX_SESSIONS = 500;
export const SQLITE_SCHEMA_VERSION = 1;
export const SQLITE_BUSY_TIMEOUT_MS = 5000;

const clone = <T>(value: T): T => structuredClone(value);

export interface SqliteStorageInspection {
  filePath: string;
  directoryPath: string;
  journalMode: string;
  busyTimeoutMs: number;
  schemaVersion: number;
}

export const resolveSqliteFilePath = (
  filePath: string,
  cwd = process.cwd(),
): string => {
  return isAbsolute(filePath) ? filePath : resolvePath(cwd, filePath);
};

const prepareSqliteDatabase = (
  database: Database.Database,
  filePath: string,
): SqliteStorageInspection => {
  try {
    const journalMode = String(
      database.pragma('journal_mode = wal', { simple: true }) ?? 'unknown',
    );
    database.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
    const busyTimeoutMs = Number(
      database.pragma('busy_timeout', { simple: true }) ?? 0,
    );
    let schemaVersion = Number(
      database.pragma('user_version', { simple: true }) ?? 0,
    );

    if (schemaVersion === 0) {
      database.pragma(`user_version = ${SQLITE_SCHEMA_VERSION}`);
      schemaVersion = SQLITE_SCHEMA_VERSION;
    } else if (schemaVersion !== SQLITE_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported sqlite schema version ${schemaVersion}; expected ${SQLITE_SCHEMA_VERSION}.`,
      );
    }

    return {
      filePath,
      directoryPath: dirname(filePath),
      journalMode,
      busyTimeoutMs,
      schemaVersion,
    };
  } catch (error) {
    throw new Error(
      `Failed to prepare sqlite storage at ${filePath}: ${error instanceof Error ? error.message : 'Unknown sqlite error.'}`,
    );
  }
};

export const inspectSqliteStorage = (options: {
  filePath: string;
  cwd?: string;
}): SqliteStorageInspection => {
  const filePath = resolveSqliteFilePath(options.filePath, options.cwd);
  const directoryPath = dirname(filePath);

  try {
    mkdirSync(directoryPath, { recursive: true });
  } catch (error) {
    throw new Error(
      `Invalid sqlite storage path ${filePath}: ${error instanceof Error ? error.message : 'Unknown path error.'}`,
    );
  }

  const database = new Database(filePath);

  try {
    return prepareSqliteDatabase(database, filePath);
  } catch (error) {
    throw new Error(
      `Failed to inspect sqlite storage path ${filePath}: ${error instanceof Error ? error.message : 'Unknown sqlite error.'}`,
    );
  } finally {
    database.close();
  }
};

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

  private lastAccessedAt = 0;

  public constructor(options: SqliteSessionStoreOptions) {
    const filePath = resolveSqliteFilePath(options.filePath, options.cwd);
    const inspection = inspectSqliteStorage({
      filePath,
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    });
    this.database = new Database(inspection.filePath);
    prepareSqliteDatabase(this.database, inspection.filePath);
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
    this.lastAccessedAt = this.readLatestAccessedAt();
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
      .run(
        sessionId,
        JSON.stringify(stored),
        stored.startedAt,
        this.nextAccessedAt(),
      );
    this.evictIfNeeded();
  }

  private touch(sessionId: string): void {
    this.database
      .prepare('UPDATE sessions SET last_accessed_at = ? WHERE session_id = ?')
      .run(this.nextAccessedAt(), sessionId);
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

  private nextAccessedAt(): number {
    const now = Date.now();
    this.lastAccessedAt = Math.max(this.lastAccessedAt + 1, now);
    return this.lastAccessedAt;
  }

  private readLatestAccessedAt(): number {
    const row = this.database
      .prepare('SELECT MAX(last_accessed_at) AS last_accessed_at FROM sessions')
      .get() as { last_accessed_at: number | null } | undefined;

    return row?.last_accessed_at ?? 0;
  }
}
