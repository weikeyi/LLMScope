import { describe, expect, it } from 'vitest';

import {
  genericOpenAiChatCompletionsPlugin,
  genericOpenAiResponsesPlugin,
} from '../src/index.js';

describe('generic OpenAI-compatible provider plugins', () => {
  it('matches chat-completions relays outside the exact OpenAI path', () => {
    const result = genericOpenAiChatCompletionsPlugin.match({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/chat/completions',
        host: 'localhost',
        path: '/chat/completions',
        headers: {},
      },
      requestBody: {
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(result).toMatchObject({
      provider: 'openai-compatible',
      apiStyle: 'chat.completions',
    });
    expect(result?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('normalizes responses-style relay requests with a warning', () => {
    const result = genericOpenAiResponsesPlugin.parseRequest({
      request: {
        protocol: 'http',
        method: 'POST',
        url: 'http://localhost/relay/responses',
        host: 'localhost',
        path: '/relay/responses',
        headers: {},
      },
      rawRequest: {
        headers: {},
        bodyJson: {
          model: 'gpt-test',
          input: 'hello',
          stream: true,
        },
        sizeBytes: 10,
        truncated: false,
      },
    });

    expect(result.exchange).toMatchObject({
      provider: 'openai-compatible',
      apiStyle: 'responses',
      model: 'gpt-test',
      stream: true,
    });
    expect(result.warnings).toContain(
      'Generic OpenAI-compatible normalization applied; provider-specific behavior may differ.',
    );
  });
});
