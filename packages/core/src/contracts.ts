import type {
  CanonicalExchange,
  CanonicalStreamEvent,
  InspectorError,
  ListSessionsQuery,
  RawHttpMessage,
  Session,
  SessionSummary,
} from '@llmscope/shared-types';

export interface IncomingRequestMeta {
  protocol: 'http' | 'https' | 'sse' | 'ws';
  method: string;
  url: string;
  host: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
  contentType?: string;
  contentLength?: number;
  remoteAddress?: string;
}

export interface MatchContext {
  request: IncomingRequestMeta;
  requestBody?: unknown;
}

export interface MatchResult {
  provider: string;
  apiStyle: string;
  confidence: number;
  reasons: string[];
}

export interface ParseRequestContext {
  request: IncomingRequestMeta;
  rawRequest: RawHttpMessage;
}

export interface ParsedRequestResult {
  exchange?: Partial<CanonicalExchange>;
  warnings?: string[];
}

export interface ParseResponseContext {
  request: IncomingRequestMeta;
  rawRequest: RawHttpMessage;
  rawResponse: RawHttpMessage;
  statusCode?: number;
}

export interface ParsedResponseResult {
  exchange?: Partial<CanonicalExchange>;
  warnings?: string[];
  error?: InspectorError;
}

export interface ParseStreamEventContext {
  request: IncomingRequestMeta;
  sessionId: string;
  eventId: string;
  sequence: number;
  rawLine?: string;
  rawJson?: unknown;
}

export interface ParsedStreamEventResult {
  event: CanonicalStreamEvent;
  warnings?: string[];
}

export interface RedactContext {
  target: 'request' | 'response' | 'url' | 'stream-event';
  path: string[];
  value: unknown;
}

export interface RedactPatch {
  op: 'replace' | 'remove';
  path: string[];
  value?: unknown;
}

export interface ProviderPlugin {
  id: string;
  displayName: string;
  match(ctx: MatchContext): MatchResult | null;
  parseRequest(ctx: ParseRequestContext): ParsedRequestResult;
  parseResponse(ctx: ParseResponseContext): ParsedResponseResult;
  parseStreamEvent?(ctx: ParseStreamEventContext): ParsedStreamEventResult | null;
  redact?(ctx: RedactContext): RedactPatch[];
}

export interface ProxyEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  onSession(listener: (session: Session) => void): void;
}

export interface RouteResolver {
  resolve(req: IncomingRequestMeta): ResolvedRoute;
}

export interface ResolvedRoute {
  routeId: string;
  targetBaseUrl: string;
  rewriteHost?: boolean;
  injectHeaders?: Record<string, string>;
  removeHeaders?: string[];
}

export interface SessionStore {
  saveSession(session: Session): Promise<void>;
  updateSession(session: Session): Promise<void>;
  appendStreamEvent(sessionId: string, event: CanonicalStreamEvent): Promise<void>;
  listSessions(query: ListSessionsQuery): Promise<SessionSummary[]>;
  getSession(sessionId: string): Promise<Session | null>;
  deleteSession(sessionId: string): Promise<void>;
  clearAll(): Promise<void>;
}

