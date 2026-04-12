import type { SessionStore } from '@llmscope/core';
import {
  generateReplay,
  type ReplayFormat,
  type ReplayRequest,
} from '@llmscope/replay';
import type { Session } from '@llmscope/shared-types';

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

export const isReplayFormat = (value: unknown): value is ReplayFormat => {
  return (
    value === 'curl' ||
    value === 'fetch' ||
    value === 'openai' ||
    value === 'anthropic'
  );
};

export const renderReplay = async (
  store: SessionStore,
  sessionId: string,
  request: ReplayRequest,
): Promise<string> => {
  return generateReplay(await getSessionOrThrow(store, sessionId), request);
};

export const getReplayContentType = (): string => {
  return 'text/plain; charset=utf-8';
};
