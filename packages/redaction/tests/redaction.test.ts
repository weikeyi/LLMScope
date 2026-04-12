import { describe, expect, it } from 'vitest';

import type { CanonicalStreamEvent, RawHttpMessage } from '@llmscope/shared-types';

import {
  REDACTED_TEXT,
  redactMessage,
  redactStreamEvent,
  toPrivacyPolicy,
} from '../src/index.js';

const baseMessage: RawHttpMessage = {
  headers: {
    authorization: 'Bearer top-secret',
    'content-type': 'application/json',
  },
  bodyJson: {
    input: 'private prompt',
    instructions: 'keep this secret',
  },
  sizeBytes: 42,
  truncated: false,
};

const baseEvent: CanonicalStreamEvent = {
  id: 'event-1',
  sessionId: 'session-1',
  ts: Date.now(),
  eventType: 'delta',
  rawLine: '{"delta":"secret reply"}',
  normalized: {
    text: 'secret reply',
  },
};

describe('redaction', () => {
  it('redacts strict request and stream payloads', () => {
    const policy = toPrivacyPolicy({ mode: 'strict' });
    const redactedRequest = redactMessage(baseMessage, 'request', policy);
    const redactedResponse = redactMessage(
      {
        ...baseMessage,
        headers: {
          'set-cookie': 'session=secret',
        },
      },
      'response',
      policy,
    );
    const redactedEvent = redactStreamEvent(baseEvent, policy);

    expect(redactedRequest.message.headers.authorization).toBe(REDACTED_TEXT);
    expect(redactedRequest.message.bodyJson).toEqual({
      input: REDACTED_TEXT,
      instructions: REDACTED_TEXT,
    });
    expect(redactedResponse.message.headers['set-cookie']).toBe(REDACTED_TEXT);
    expect(redactedEvent.event.normalized).toEqual({ text: REDACTED_TEXT });
    expect(redactedRequest.warnings?.length).toBeGreaterThan(0);
  });

  it('preserves content when privacy mode is off', () => {
    const policy = toPrivacyPolicy({ mode: 'off' });
    const redactedRequest = redactMessage(baseMessage, 'request', policy);

    expect(redactedRequest.message).toEqual(baseMessage);
    expect(redactedRequest.warnings).toBeUndefined();
  });
});
