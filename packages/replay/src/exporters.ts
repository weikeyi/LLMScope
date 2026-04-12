import type {
  ListSessionsQuery,
  Session,
  SessionExportFormat,
} from '@llmscope/shared-types';

export type ExportFormat = SessionExportFormat;

export interface ExportRequest {
  format: ExportFormat;
  includeSecrets?: boolean;
  sessionId?: string;
  sessionIds?: string[];
  query?: ListSessionsQuery;
}

const SECRET_HEADER_NAMES = new Set([
  'api-key',
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-api-key',
]);

const sanitizeHeaders = (
  headers: Record<string, string | string[]>,
  includeSecrets: boolean,
): Record<string, string | string[]> => {
  if (includeSecrets) {
    return { ...headers };
  }

  const sanitized: Record<string, string | string[]> = {};

  for (const [name, value] of Object.entries(headers)) {
    sanitized[name] = SECRET_HEADER_NAMES.has(name.toLowerCase())
      ? '[redacted]'
      : value;
  }

  return sanitized;
};

const sanitizeSession = (
  session: Session,
  includeSecrets: boolean,
): Session => {
  return {
    ...session,
    request: {
      ...session.request,
      headers: sanitizeHeaders(session.request.headers, includeSecrets),
    },
    ...(session.response === undefined
      ? {}
      : {
          response: {
            ...session.response,
            headers: sanitizeHeaders(session.response.headers, includeSecrets),
          },
        }),
  };
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
  const includeSecrets = request.includeSecrets === true;
  const sanitizedSessions = sessions.map((session) =>
    sanitizeSession(session, includeSecrets),
  );

  if (request.format === 'json') {
    return request.sessionId !== undefined
      ? JSON.stringify(sanitizedSessions[0] ?? null, null, 2)
      : JSON.stringify(sanitizedSessions, null, 2);
  }

  if (request.format === 'ndjson') {
    return sanitizedSessions.map((session) => JSON.stringify(session)).join('\n');
  }

  return ['# LLMScope Export', '', ...sanitizedSessions.map(renderMarkdownSession)].join(
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
