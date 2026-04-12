import { describe, expect, it } from 'vitest';

import type {
  MatchContext,
  ParsedRequestResult,
  ParsedResponseResult,
  ProviderPlugin,
} from '@llmscope/core';

import { createProviderRegistry } from '../src/index.js';

const matchContext: MatchContext = {
  request: {
    protocol: 'http',
    method: 'POST',
    url: 'http://localhost/v1/chat/completions',
    host: 'localhost',
    path: '/v1/chat/completions',
    headers: {},
  },
  requestBody: {
    model: 'gpt-test',
    messages: [{ role: 'user', content: 'hello' }],
  },
};

const createPlugin = (
  id: string,
  match: ProviderPlugin['match'],
): ProviderPlugin => {
  const parseRequest = (): ParsedRequestResult => ({});
  const parseResponse = (): ParsedResponseResult => ({});

  return {
    id,
    displayName: id,
    match,
    parseRequest,
    parseResponse,
  };
};

describe('createProviderRegistry', () => {
  it('prefers the highest-confidence plugin match', () => {
    const registry = createProviderRegistry({
      plugins: [
        createPlugin('generic-openai', () => ({
          provider: 'openai-compatible',
          apiStyle: 'chat.completions',
          confidence: 0.72,
          reasons: ['generic path match'],
        })),
        createPlugin('openai-chat-completions', () => ({
          provider: 'openai',
          apiStyle: 'chat.completions',
          confidence: 1,
          reasons: ['exact path match'],
        })),
      ],
    });

    const matched = registry.match(matchContext);

    expect(matched?.plugin.id).toBe('openai-chat-completions');
    expect(matched?.provider).toBe('openai');
    expect(matched?.confidence).toBe(1);
  });

  it('drops matches below the configured confidence threshold', () => {
    const registry = createProviderRegistry({
      minimumConfidence: 0.7,
      plugins: [
        createPlugin('generic-openai', () => ({
          provider: 'openai-compatible',
          apiStyle: 'chat.completions',
          confidence: 0.6,
          reasons: ['weak heuristic'],
        })),
      ],
    });

    expect(registry.match(matchContext)).toBeUndefined();
  });
});
