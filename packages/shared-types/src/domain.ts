export type SessionStatus = 'pending' | 'streaming' | 'completed' | 'error';
export type SessionExportFormat = 'json' | 'ndjson' | 'markdown';
export type SessionReplayFormat = 'curl' | 'fetch' | 'openai' | 'anthropic';

export type TransportMode = 'gateway' | 'proxy' | 'mitm';

export type TransportProtocol = 'http' | 'https' | 'sse' | 'ws';

export type CanonicalRole =
  | 'system'
  | 'developer'
  | 'user'
  | 'assistant'
  | 'tool'
  | 'unknown';

export type CanonicalPartType =
  | 'text'
  | 'json'
  | 'image_url'
  | 'tool_call'
  | 'tool_result'
  | 'unknown';

export type CanonicalStreamEventType =
  | 'message_start'
  | 'delta'
  | 'tool_call_start'
  | 'tool_call_delta'
  | 'tool_result'
  | 'message_stop'
  | 'usage'
  | 'error'
  | 'unknown';

export interface SessionTransport {
  mode: TransportMode;
  protocol: TransportProtocol;
  method: string;
  url: string;
  host: string;
  path: string;
  statusCode?: number;
  durationMs?: number;
  firstByteAtMs?: number;
}

export interface SessionRouting {
  upstreamBaseUrl?: string;
  routeId?: string;
  matchedProvider?: string;
  matchedEndpoint?: string;
  confidence?: number;
}

export interface RawHttpMessage {
  headers: Record<string, string | string[]>;
  contentType?: string;
  sizeBytes?: number;
  bodyText?: string;
  bodyJson?: unknown;
  bodyFilePath?: string;
  truncated?: boolean;
  isBinary?: boolean;
  sha256?: string;
}

export interface CanonicalMessage {
  role: CanonicalRole;
  parts: CanonicalPart[];
  raw?: unknown;
}

export type CanonicalPart =
  | { type: 'text'; text: string }
  | { type: 'json'; value: unknown }
  | { type: 'image_url'; url?: string }
  | {
      type: 'tool_call';
      id?: string;
      name?: string;
      arguments?: string | Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      toolCallId?: string;
      name?: string;
      content?: string;
    }
  | { type: 'unknown'; value: unknown };

export interface CanonicalTool {
  name?: string;
  description?: string;
  inputSchema?: unknown;
  raw?: unknown;
}

export interface CanonicalUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  currency?: string;
}

export interface CanonicalOutput {
  text?: string;
  messages?: CanonicalMessage[];
  finishReason?: string;
  raw?: unknown;
}

export interface CanonicalLatency {
  firstByteMs?: number;
  completedMs?: number;
}

export interface CanonicalExchange {
  provider: string;
  apiStyle: string;
  model?: string;
  stream?: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  instructions?: CanonicalMessage[];
  inputMessages?: CanonicalMessage[];
  tools?: CanonicalTool[];
  toolChoice?: unknown;
  responseFormat?: unknown;
  output?: CanonicalOutput;
  usage?: CanonicalUsage;
  latency?: CanonicalLatency;
  warnings?: string[];
}

export type InspectorErrorPhase =
  | 'request'
  | 'routing'
  | 'upstream'
  | 'stream'
  | 'storage'
  | 'ui';

export type InspectorErrorCode =
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'METHOD_NOT_ALLOWED'
  | 'SESSION_NOT_FOUND'
  | 'TOO_MANY_CONCURRENT_SESSIONS'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_SERVER_ERROR'
  | 'UPSTREAM_REQUEST_FAILED'
  | 'OBSERVATION_SERVER_ERROR'
  | 'STORAGE_OPEN_FAILED'
  | 'STORAGE_SCHEMA_UNSUPPORTED'
  | (string & {});

export interface InspectorError {
  code: InspectorErrorCode;
  phase: InspectorErrorPhase;
  message: string;
  statusCode?: number;
  retryable?: boolean;
  details?: unknown;
}

export interface InspectorErrorBody {
  error: string;
  code?: InspectorErrorCode;
  phase?: InspectorErrorPhase;
  statusCode?: number;
  retryable?: boolean;
  details?: unknown;
}

export const formatInspectorError = (error: {
  code: InspectorErrorCode;
  message: string;
}): string => {
  return `[${error.code}] ${error.message}`;
};

export interface CanonicalStreamEvent {
  id: string;
  sessionId: string;
  ts: number;
  eventType: CanonicalStreamEventType;
  rawLine?: string;
  rawJson?: unknown;
  normalized?: unknown;
}

export interface Session {
  id: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  transport: SessionTransport;
  routing: SessionRouting;
  request: RawHttpMessage;
  response?: RawHttpMessage;
  normalized?: CanonicalExchange;
  streamEvents?: CanonicalStreamEvent[];
  tags?: string[];
  warnings?: string[];
  error?: InspectorError;
}

export interface SessionSummary {
  id: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  provider?: string;
  model?: string;
  method: string;
  path: string;
  statusCode?: number;
  durationMs?: number;
  stream?: boolean;
  warningCount: number;
  errorCode?: string;
}

export interface ListSessionsQuery {
  search?: string;
  provider?: string;
  model?: string;
  status?: SessionStatus;
  limit?: number;
}

export type WsEvent =
  | { type: 'session:created'; session: SessionSummary }
  | { type: 'session:updated'; session: SessionSummary }
  | {
      type: 'session:stream-event';
      sessionId: string;
      event: CanonicalStreamEvent;
    }
  | { type: 'session:completed'; sessionId: string }
  | { type: 'session:error'; sessionId: string; error: InspectorError };
