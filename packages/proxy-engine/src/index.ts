import { createHash, randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { TLSSocket } from 'node:tls';
import { Readable } from 'node:stream';

import type {
  IncomingRequestMeta,
  ParsedRequestResult,
  ParsedResponseResult,
  ParsedStreamEventResult,
  ProviderPlugin,
  ProxyEngine,
  ResolvedRoute,
  RouteResolver,
  SessionStore,
} from '@llmscope/core';
import type { ResolvedPrivacyConfig } from '@llmscope/config';
import { SseAccumulator, type SseMessage } from '@llmscope/parser-sse';
import {
  createProviderRegistry,
  type MatchedProvider,
} from '@llmscope/provider-registry';
import {
  redactMessage,
  redactStreamEvent,
  toPrivacyPolicy,
  type PrivacyPolicy,
} from '@llmscope/redaction';

import type {
  CanonicalExchange,
  CanonicalStreamEvent,
  InspectorError,
  RawHttpMessage,
  Session,
} from '@llmscope/shared-types';

export {
  anthropicMessagesPlugin,
  genericOpenAiChatCompletionsPlugin,
  genericOpenAiResponsesPlugin,
  openAiChatCompletionsPlugin,
  openAiResponsesPlugin,
} from './providers/index.js';

export interface ProxyEngineOptions {
  host?: string;
  port?: number;
  mode?: 'gateway' | 'proxy' | 'mitm';
  maxConcurrentSessions?: number;
  requestTimeoutMs?: number;
  captureBodyBytes?: number;
  routeResolver: RouteResolver;
  store: SessionStore;
  privacy?: ResolvedPrivacyConfig;
  providerPlugins?: ProviderPlugin[];
}

export interface ProxyEngineAddress {
  host: string;
  port: number;
}

interface StreamEventParseContext {
  request: IncomingRequestMeta;
  sessionId: string;
  sequence: number;
}

const TEXT_CONTENT_TYPES = [
  'application/json',
  'application/problem+json',
  'text/',
  'application/xml',
];

const DEFAULT_CAPTURE_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_SESSIONS = 100;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

const isTextContentType = (contentType?: string): boolean => {
  if (contentType === undefined) {
    return false;
  }

  return TEXT_CONTENT_TYPES.some((value) => contentType.includes(value));
};

const toHeaderRecord = (
  headers: IncomingMessage['headers'] | Record<string, string | string[]>,
): Record<string, string | string[]> => {
  const normalized: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    normalized[key] = Array.isArray(value) ? [...value] : value;
  }

  return normalized;
};

const toIncomingRequestMeta = (
  request: IncomingMessage,
): IncomingRequestMeta => {
  const host = request.headers.host ?? '127.0.0.1';
  const url = request.url ?? '/';
  const protocol =
    (request.socket as TLSSocket).encrypted === true ? 'https' : 'http';
  const absoluteUrl = new URL(url, `${protocol}://${host}`);

  const meta: IncomingRequestMeta = {
    protocol,
    method: request.method ?? 'GET',
    url: absoluteUrl.toString(),
    host,
    path: absoluteUrl.pathname + absoluteUrl.search,
    headers: toHeaderRecord(request.headers),
  };

  const queryEntries = Array.from(
    new Set(Array.from(absoluteUrl.searchParams.keys())),
  ).map((key) => [key, absoluteUrl.searchParams.getAll(key)] as const);

  if (queryEntries.length > 0) {
    meta.query = Object.fromEntries(queryEntries);
  }

  if (request.headers['content-type'] !== undefined) {
    meta.contentType = request.headers['content-type'];
  }

  if (request.headers['content-length'] !== undefined) {
    meta.contentLength = Number(request.headers['content-length']);
  }

  if (request.socket.remoteAddress !== undefined) {
    meta.remoteAddress = request.socket.remoteAddress;
  }

  return meta;
};

const readRequestBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

const captureBody = (
  body: Buffer,
  contentType?: string,
  limit = DEFAULT_CAPTURE_BODY_BYTES,
): Omit<RawHttpMessage, 'headers'> => {
  const sizeBytes = body.byteLength;
  const truncated = sizeBytes > limit;
  const capturedBody = truncated ? body.subarray(0, limit) : body;

  const base: Omit<RawHttpMessage, 'headers'> = {
    sizeBytes,
    truncated,
  };

  if (contentType !== undefined) {
    base.contentType = contentType;
  }

  if (body.byteLength === 0) {
    return base;
  }

  if (!isTextContentType(contentType)) {
    return {
      ...base,
      isBinary: true,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
  }

  const bodyText = capturedBody.toString('utf8');
  const result: Omit<RawHttpMessage, 'headers'> = {
    ...base,
    bodyText,
    isBinary: false,
    sha256: createHash('sha256').update(body).digest('hex'),
  };

  if (contentType?.includes('json')) {
    try {
      result.bodyJson = JSON.parse(bodyText) as unknown;
    } catch {
      return result;
    }
  }

  return result;
};

const mergeWarnings = (
  existing: string[] | undefined,
  warnings: string[] | undefined,
): string[] | undefined => {
  if (warnings === undefined || warnings.length === 0) {
    return existing;
  }

  return [...(existing ?? []), ...warnings];
};

const mergeExchange = (
  existing: CanonicalExchange | undefined,
  incoming: Partial<CanonicalExchange> | undefined,
): CanonicalExchange | undefined => {
  if (incoming === undefined) {
    return existing;
  }

  const next: Partial<CanonicalExchange> = {
    ...existing,
    ...incoming,
  };
  const mergedWarnings = mergeWarnings(existing?.warnings, incoming.warnings);

  if (mergedWarnings !== undefined) {
    next.warnings = mergedWarnings;
  }

  if (existing?.output !== undefined || incoming.output !== undefined) {
    next.output = {
      ...existing?.output,
      ...incoming.output,
    };
  }

  if (existing?.usage !== undefined || incoming.usage !== undefined) {
    next.usage = {
      ...existing?.usage,
      ...incoming.usage,
    };
  }

  if (existing?.latency !== undefined || incoming.latency !== undefined) {
    next.latency = {
      ...existing?.latency,
      ...incoming.latency,
    };
  }

  return next as CanonicalExchange;
};

const assignNormalized = (
  session: Session,
  exchange: CanonicalExchange | undefined,
): void => {
  if (exchange === undefined) {
    delete session.normalized;
    return;
  }

  session.normalized = exchange;
};

const assignWarnings = (
  session: Session,
  warnings: string[] | undefined,
): void => {
  if (warnings === undefined) {
    delete session.warnings;
    return;
  }

  session.warnings = warnings;
};

const applyRequestParsing = (
  session: Session,
  result: ParsedRequestResult,
  fallback: { provider: string; apiStyle: string },
): void => {
  assignNormalized(
    session,
    mergeExchange(session.normalized, {
      provider: fallback.provider,
      apiStyle: fallback.apiStyle,
      ...result.exchange,
    }),
  );
  assignWarnings(session, mergeWarnings(session.warnings, result.warnings));
};

const applyResponseParsing = (
  session: Session,
  result: ParsedResponseResult,
): void => {
  assignNormalized(session, mergeExchange(session.normalized, result.exchange));
  assignWarnings(session, mergeWarnings(session.warnings, result.warnings));

  if (result.error !== undefined) {
    session.error = result.error;
  }
};

const parseJsonIfPossible = (dataText: string): unknown => {
  if (dataText.length === 0 || dataText === '[DONE]') {
    return undefined;
  }

  try {
    return JSON.parse(dataText) as unknown;
  } catch {
    return undefined;
  }
};

const toGenericStreamEvent = (
  sessionId: string,
  message: SseMessage,
): CanonicalStreamEvent => {
  const dataText = message.data.join('\n');
  const normalized = dataText === '[DONE]' ? { done: true } : undefined;

  return {
    id: randomUUID(),
    sessionId,
    ts: Date.now(),
    eventType: dataText === '[DONE]' ? 'message_stop' : 'unknown',
    rawLine: dataText,
    rawJson: parseJsonIfPossible(dataText),
    normalized,
  };
};

const toStreamEvent = (
  message: SseMessage,
  context: StreamEventParseContext,
  matchedProvider?: MatchedProvider,
): ParsedStreamEventResult => {
  const dataText = message.data.join('\n');
  const rawJson = parseJsonIfPossible(dataText);

  if (matchedProvider?.plugin.parseStreamEvent !== undefined) {
    const parsed = matchedProvider.plugin.parseStreamEvent({
      request: context.request,
      sessionId: context.sessionId,
      eventId: randomUUID(),
      sequence: context.sequence,
      ...(message.event !== undefined ? { eventName: message.event } : {}),
      ...(dataText.length > 0 ? { rawLine: dataText } : {}),
      ...(rawJson !== undefined ? { rawJson } : {}),
    });

    if (parsed !== null) {
      return parsed;
    }
  }

  return {
    event: toGenericStreamEvent(context.sessionId, message),
  };
};

const writeHeaders = (
  response: ServerResponse,
  headers: Record<string, string | string[]>,
): void => {
  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
};

const omitHeaders = (
  headers: Record<string, string | string[]>,
  keys: string[] = [],
): Record<string, string | string[]> => {
  const blocked = new Set(keys.map((value) => value.toLowerCase()));
  const nextHeaders: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (blocked.has(key.toLowerCase())) {
      continue;
    }

    nextHeaders[key] = value;
  }

  return nextHeaders;
};

export class StaticRouteResolver implements RouteResolver {
  private readonly route: ResolvedRoute;

  public constructor(route: ResolvedRoute) {
    this.route = route;
  }

  public resolve(_request: IncomingRequestMeta): ResolvedRoute {
    void _request;
    return { ...this.route };
  }
}

export class NodeProxyEngine implements ProxyEngine {
  private readonly host: string;

  private readonly port: number;

  private readonly mode: 'gateway' | 'proxy' | 'mitm';

  private readonly maxConcurrentSessions: number;

  private readonly requestTimeoutMs: number;

  private readonly captureBodyBytes: number;

  private readonly privacyPolicy: PrivacyPolicy;

  private readonly listeners = new Set<(session: Session) => void>();

  private readonly routeResolver: RouteResolver;

  private readonly store: SessionStore;

  private readonly providerRegistry: ReturnType<typeof createProviderRegistry>;

  private server: Server | null = null;

  private activeSessions = 0;

  public constructor(options: ProxyEngineOptions) {
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? 8787;
    this.mode = options.mode ?? 'gateway';
    this.maxConcurrentSessions =
      options.maxConcurrentSessions ?? DEFAULT_MAX_CONCURRENT_SESSIONS;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.captureBodyBytes =
      options.captureBodyBytes ?? DEFAULT_CAPTURE_BODY_BYTES;
    this.privacyPolicy = toPrivacyPolicy(options.privacy);
    this.routeResolver = options.routeResolver;
    this.store = options.store;
    this.providerRegistry = createProviderRegistry({
      plugins: options.providerPlugins ?? [],
    });
  }

  public async start(): Promise<void> {
    if (this.server !== null) {
      return;
    }

    this.server = createServer(async (request, response) => {
      await this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.port, this.host, () => {
        this.server?.off('error', reject);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.server === null) {
      return;
    }

    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined && error !== null) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  public onSession(listener: (session: Session) => void): void {
    this.listeners.add(listener);
  }

  public getAddress(): ProxyEngineAddress {
    const address = this.server?.address();

    if (
      address === null ||
      address === undefined ||
      typeof address === 'string'
    ) {
      return {
        host: this.host,
        port: this.port,
      };
    }

    return {
      host: address.address,
      port: address.port,
    };
  }

  private emitSession(session: Session): void {
    const snapshot = structuredClone(session);

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (this.activeSessions >= this.maxConcurrentSessions) {
      response.statusCode = 429;
      response.end('Too many concurrent sessions');
      return;
    }

    this.activeSessions += 1;

    const startedAt = new Date();
    const requestMeta = toIncomingRequestMeta(request);
    const sessionId = randomUUID();
    let requestBodyBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

    const session: Session = {
      id: sessionId,
      status: 'pending',
      startedAt: startedAt.toISOString(),
      transport: {
        mode: this.mode,
        protocol: requestMeta.protocol,
        method: requestMeta.method,
        url: requestMeta.url,
        host: requestMeta.host,
        path: requestMeta.path,
      },
      routing: {},
      request: {
        headers: toHeaderRecord(request.headers),
      },
    };

    try {
      requestBodyBuffer = await readRequestBody(request);
      session.request = {
        headers: toHeaderRecord(request.headers),
        ...captureBody(
          requestBodyBuffer,
          requestMeta.contentType,
          this.captureBodyBytes,
        ),
      };
      const redactedRequest = redactMessage(
        session.request,
        'request',
        this.privacyPolicy,
      );
      session.request = redactedRequest.message;
      assignWarnings(
        session,
        mergeWarnings(session.warnings, redactedRequest.warnings),
      );

      const matchedProvider = this.providerRegistry.match({
        request: requestMeta,
        requestBody: session.request.bodyJson,
      });

      if (matchedProvider !== undefined) {
        session.routing = {
          ...session.routing,
          matchedProvider: matchedProvider.provider,
          matchedEndpoint: matchedProvider.apiStyle,
          confidence: matchedProvider.confidence,
        };

        if (matchedProvider.confidence < 1.0) {
          session.warnings = [
            ...(session.warnings ?? []),
            `Provider plugin '${matchedProvider.plugin.id}' matched with low confidence (${matchedProvider.confidence}): ${matchedProvider.reasons.join(', ')}`,
          ];
        }

        applyRequestParsing(
          session,
          matchedProvider.plugin.parseRequest({
            request: requestMeta,
            rawRequest: session.request,
          }),
          {
            provider: matchedProvider.provider,
            apiStyle: matchedProvider.apiStyle,
          },
        );
      } else {
        session.warnings = [
          ...(session.warnings ?? []),
          'No known provider plugin matched this request; raw traffic recorded without provider-specific normalization.',
        ];
      }

      await this.store.saveSession(session);
      this.emitSession(session);

      const resolvedRoute = this.routeResolver.resolve(requestMeta);
      session.routing = {
        ...session.routing,
        routeId: resolvedRoute.routeId,
        upstreamBaseUrl: resolvedRoute.targetBaseUrl,
      };

      const upstreamUrl = new URL(
        request.url ?? '/',
        resolvedRoute.targetBaseUrl,
      );
      const upstreamUrlString = upstreamUrl.toString();
      const upstreamHeaders = omitHeaders(
        toHeaderRecord(request.headers),
        resolvedRoute.removeHeaders,
      );

      if (resolvedRoute.rewriteHost === true) {
        delete upstreamHeaders.host;
      }

      if (resolvedRoute.injectHeaders !== undefined) {
        Object.assign(upstreamHeaders, resolvedRoute.injectHeaders);
      }

      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        abortController.abort();
      }, this.requestTimeoutMs);

      const upstreamMethod = request.method ?? 'GET';
      const upstreamRequestBody =
        requestBodyBuffer.byteLength === 0 || request.method === 'GET'
          ? null
          : requestBodyBuffer;

      const upstreamResponse = await fetch(upstreamUrlString, {
        method: upstreamMethod,
        headers: upstreamHeaders,
        signal: abortController.signal,
        body: upstreamRequestBody,
        duplex: 'half',
      });

      clearTimeout(timeout);

      const responseHeaders = Object.fromEntries(
        Array.from(upstreamResponse.headers.entries()).map(([key, value]) => [
          key,
          value,
        ]),
      );
      const responseContentType =
        upstreamResponse.headers.get('content-type') ?? undefined;
      const isSse = responseContentType?.includes('text/event-stream') ?? false;
      const firstByteAt = Date.now() - startedAt.getTime();

      response.statusCode = upstreamResponse.status;
      writeHeaders(response, responseHeaders);

      session.transport.statusCode = upstreamResponse.status;
      session.transport.firstByteAtMs = firstByteAt;
      session.transport.protocol = isSse ? 'sse' : session.transport.protocol;
      session.status = isSse ? 'streaming' : 'pending';

      const responseChunks: Uint8Array[] = [];
      const sseAccumulator = new SseAccumulator();
      let streamSequence = 0;

      const upstreamBody = upstreamResponse.body;

      if (upstreamBody === null) {
        response.end();
      } else {
        for await (const chunk of Readable.fromWeb(
          upstreamBody as globalThis.ReadableStream<Uint8Array>,
        )) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          responseChunks.push(buffer);
          response.write(buffer);

          if (isSse) {
            for (const message of sseAccumulator.push(buffer)) {
              const parsedEvent = toStreamEvent(
                message,
                {
                  request: requestMeta,
                  sessionId,
                  sequence: streamSequence,
                },
                matchedProvider,
              );
              const redactedEvent = redactStreamEvent(
                parsedEvent.event,
                this.privacyPolicy,
              );
              streamSequence += 1;
              session.streamEvents = [
                ...(session.streamEvents ?? []),
                redactedEvent.event,
              ];
              assignWarnings(
                session,
                mergeWarnings(session.warnings, parsedEvent.warnings),
              );
              assignWarnings(
                session,
                mergeWarnings(session.warnings, redactedEvent.warnings),
              );
              assignNormalized(
                session,
                mergeExchange(
                  session.normalized,
                  parsedEvent.warnings === undefined &&
                    redactedEvent.warnings === undefined
                    ? undefined
                    : {
                        warnings: [
                          ...(parsedEvent.warnings ?? []),
                          ...(redactedEvent.warnings ?? []),
                        ],
                      },
                ),
              );
              await this.store.appendStreamEvent(
                sessionId,
                redactedEvent.event,
              );
            }
          }
        }

        response.end();
      }

      const endedAt = new Date();
      const responseBody = Buffer.concat(responseChunks);
      session.response = {
        headers: responseHeaders,
        ...captureBody(
          responseBody,
          responseContentType,
          this.captureBodyBytes,
        ),
      };
      const redactedResponse = redactMessage(
        session.response,
        'response',
        this.privacyPolicy,
      );
      session.response = redactedResponse.message;
      assignWarnings(
        session,
        mergeWarnings(session.warnings, redactedResponse.warnings),
      );
      session.status = 'completed';
      session.endedAt = endedAt.toISOString();
      session.transport.durationMs = endedAt.getTime() - startedAt.getTime();

      if (matchedProvider !== undefined && session.response !== undefined) {
        applyResponseParsing(
          session,
          matchedProvider.plugin.parseResponse({
            request: requestMeta,
            rawRequest: session.request,
            rawResponse: session.response,
            statusCode: upstreamResponse.status,
          }),
        );
      }

      await this.store.updateSession(session);
      this.emitSession(session);
    } catch (error) {
      const inspectorError = this.toInspectorError(error);
      session.status = 'error';
      session.error = inspectorError;
      session.endedAt = new Date().toISOString();
      session.transport.durationMs = Date.now() - startedAt.getTime();

      await this.store.updateSession(session);
      this.emitSession(session);

      if (response.headersSent === false) {
        response.statusCode =
          inspectorError.code === 'TOO_MANY_CONCURRENT_SESSIONS' ? 429 : 502;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            error: inspectorError.message,
            code: inspectorError.code,
          }),
        );
      } else {
        response.end();
      }
    } finally {
      this.activeSessions -= 1;
    }
  }

  private toInspectorError(error: unknown): InspectorError {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        code: 'UPSTREAM_TIMEOUT',
        phase: 'upstream',
        message: 'Upstream request timed out.',
        details: { name: error.name, message: error.message },
      };
    }

    if (error instanceof Error) {
      return {
        code: 'UPSTREAM_REQUEST_FAILED',
        phase: 'upstream',
        message: error.message,
        details: {
          name: error.name,
          message: error.message,
          cause: error.cause,
        },
      };
    }

    return {
      code: 'UPSTREAM_REQUEST_FAILED',
      phase: 'upstream',
      message: 'Unknown upstream proxy failure.',
      details: error,
    };
  }
}
