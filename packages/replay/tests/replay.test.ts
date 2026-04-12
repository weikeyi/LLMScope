import { describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import { generateReplay } from '../src/index.js';

const createOpenAiSession = (): Session => ({
  id: 'session-openai',
  status: 'completed',
  startedAt: '2026-03-20T10:00:00.000Z',
  endedAt: '2026-03-20T10:00:00.250Z',
  transport: {
    mode: 'proxy',
    protocol: 'http',
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions',
    host: 'api.openai.com',
    path: '/v1/chat/completions',
    statusCode: 200,
    durationMs: 250,
  },
  routing: {
    routeId: 'default',
    upstreamBaseUrl: 'https://api.openai.com',
    matchedProvider: 'openai',
    matchedEndpoint: 'chat.completions',
    confidence: 0.99,
  },
  request: {
    headers: {
      authorization: 'Bearer super-secret-token',
      'x-api-key': 'sk-top-secret',
      'content-type': 'application/json',
    },
    contentType: 'application/json',
    bodyJson: {
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
    },
  },
  normalized: {
    provider: 'openai',
    apiStyle: 'chat.completions',
    model: 'gpt-4.1-mini',
    stream: false,
    temperature: 0.2,
    inputMessages: [{ role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
    output: { text: 'hi' },
  },
});

const createAnthropicSession = (): Session => ({
  id: 'session-anthropic',
  status: 'completed',
  startedAt: '2026-03-20T10:05:00.000Z',
  endedAt: '2026-03-20T10:05:00.250Z',
  transport: {
    mode: 'proxy',
    protocol: 'http',
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    host: 'api.anthropic.com',
    path: '/v1/messages',
    statusCode: 200,
    durationMs: 250,
  },
  routing: {
    routeId: 'default',
    upstreamBaseUrl: 'https://api.anthropic.com',
    matchedProvider: 'anthropic',
    matchedEndpoint: 'messages',
    confidence: 0.99,
  },
  request: {
    headers: {
      'x-api-key': 'anthropic-secret',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    contentType: 'application/json',
    bodyJson: {
      model: 'claude-3-7-sonnet-latest',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 256,
    },
  },
  normalized: {
    provider: 'anthropic',
    apiStyle: 'messages',
    model: 'claude-3-7-sonnet-latest',
    stream: false,
    maxTokens: 256,
    inputMessages: [{ role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
    output: { text: 'hi' },
  },
});

describe('@llmscope/replay code generation', () => {
  it('generates curl, fetch, and openai snippets without leaking secrets', () => {
    const session = createOpenAiSession();
    const curlSnippet = generateReplay(session, { format: 'curl' });
    const fetchSnippet = generateReplay(session, { format: 'fetch' });
    const openAiSnippet = generateReplay(session, { format: 'openai' });

    expect(curlSnippet).toMatchInlineSnapshot(`
      "curl https://api.openai.com/v1/chat/completions \\
        --header 'content-type: application/json' \\
        --header 'authorization: Bearer $OPENAI_API_KEY' \\
        --data '{
        "model": "gpt-4.1-mini",
        "messages": [
          {
            "role": "user",
            "content": "hello"
          }
        ],
        "temperature": 0.2
      }'"
    `);
    expect(fetchSnippet).toMatchInlineSnapshot(`
      "await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
        },
        body: JSON.stringify({
            model: 'gpt-4.1-mini',
            messages: [
              {
                role: 'user',
                content: 'hello',
              },
            ],
            temperature: 0.2,
          }),
      });"
    `);
    expect(openAiSnippet).toMatchInlineSnapshot(`
      "import OpenAI from 'openai';

      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await client.chat.completions.create({
          model: 'gpt-4.1-mini',
          messages: [
            {
              role: 'user',
              content: 'hello',
            },
          ],
          temperature: 0.2,
        });

      console.log(response);"
    `);
    expect(curlSnippet).not.toContain('super-secret-token');
    expect(fetchSnippet).not.toContain('sk-top-secret');
    expect(openAiSnippet).not.toContain('super-secret-token');
  });

  it('generates anthropic sdk snippets without embedding captured keys', () => {
    const snippet = generateReplay(createAnthropicSession(), {
      format: 'anthropic',
    });

    expect(snippet).toMatchInlineSnapshot(`
      "import Anthropic from '@anthropic-ai/sdk';

      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await client.messages.create({
          model: 'claude-3-7-sonnet-latest',
          messages: [
            {
              role: 'user',
              content: 'hello',
            },
          ],
          max_tokens: 256,
        });

      console.log(response);"
    `);
    expect(snippet).not.toContain('anthropic-secret');
  });
});
