import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  IncomingRequestMeta,
  MatchContext,
  MatchResult,
  ParseRequestContext,
  ParsedRequestResult,
  ParseResponseContext,
  ParsedResponseResult,
  ParseStreamEventContext,
  ParsedStreamEventResult,
  ProviderPlugin,
  SessionStore,
} from '../src/index.js';
import type {
  CanonicalStreamEvent,
  ListSessionsQuery,
  Session,
  SessionSummary,
} from '@llmscope/shared-types';

const request: IncomingRequestMeta = {
  protocol: 'sse',
  method: 'POST',
  url: 'http://127.0.0.1:8787/v1/chat/completions',
  host: '127.0.0.1:8787',
  path: '/v1/chat/completions',
  headers: {
    'content-type': 'application/json',
  },
  contentType: 'application/json',
};

const sessionStore: SessionStore = {
  async saveSession(session) {
    void session;
  },
  async updateSession(session) {
    void session;
  },
  async appendStreamEvent(sessionId, event) {
    void sessionId;
    void event;
  },
  async listSessions(query) {
    void query;
    return [];
  },
  async getSession(sessionId) {
    void sessionId;
    return null;
  },
  async deleteSession(sessionId) {
    void sessionId;
  },
  async clearAll() {
    return undefined;
  },
};

const plugin: ProviderPlugin = {
  id: 'openai',
  displayName: 'OpenAI',
  match(ctx) {
    void ctx;
    return {
      provider: 'openai',
      apiStyle: 'chat.completions',
      confidence: 1,
      reasons: ['matched path'],
    };
  },
  parseRequest(ctx) {
    void ctx;
    return {
      exchange: {
        provider: 'openai',
        apiStyle: 'chat.completions',
        stream: true,
      },
    };
  },
  parseResponse(ctx) {
    void ctx;
    return {
      exchange: {
        provider: 'openai',
        apiStyle: 'chat.completions',
      },
    };
  },
  parseStreamEvent(ctx) {
    return {
      event: {
        id: ctx.eventId,
        sessionId: ctx.sessionId,
        ts: Date.now(),
        eventType: 'delta',
      },
    };
  },
};

describe('@llmscope/core', () => {
  it('keeps the session store contract aligned with shared types', async () => {
    expectTypeOf(sessionStore.listSessions).toEqualTypeOf<
      (query: ListSessionsQuery) => Promise<SessionSummary[]>
    >();
    expectTypeOf(sessionStore.getSession).toEqualTypeOf<
      (sessionId: string) => Promise<Session | null>
    >();
    expectTypeOf(sessionStore.appendStreamEvent).toEqualTypeOf<
      (sessionId: string, event: CanonicalStreamEvent) => Promise<void>
    >();

    const list = await sessionStore.listSessions({ status: 'completed' });
    expect(list).toEqual([]);
  });

  it('keeps plugin interfaces thin and composable', () => {
    expectTypeOf(plugin.match).toEqualTypeOf<
      (ctx: MatchContext) => MatchResult | null
    >();
    expectTypeOf(plugin.parseRequest).toEqualTypeOf<
      (ctx: ParseRequestContext) => ParsedRequestResult
    >();
    expectTypeOf(plugin.parseResponse).toEqualTypeOf<
      (ctx: ParseResponseContext) => ParsedResponseResult
    >();
    expectTypeOf(plugin.parseStreamEvent).toEqualTypeOf<
      ((ctx: ParseStreamEventContext) => ParsedStreamEventResult | null) | undefined
    >();

    const match = plugin.match({ request });
    expect(match?.provider).toBe('openai');

    const streamEvent = plugin.parseStreamEvent?.({
      request,
      sessionId: 'session-1',
      eventId: 'event-1',
      sequence: 1,
      rawLine: 'data: {"delta":"hello"}',
    });

    expect(streamEvent?.event.eventType).toBe('delta');
  });
});
