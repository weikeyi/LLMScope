import { describe, expect, it } from 'vitest';

import { SseAccumulator } from '../src/index.js';

describe('SseAccumulator', () => {
  it('parses event frames across chunk boundaries', () => {
    const accumulator = new SseAccumulator();

    expect(accumulator.push('event: response.output_text.delta\n')).toEqual([]);

    const messages = accumulator.push(
      'data: {"delta":"Hello"}\n\ndata: [DONE]\n\n',
    );

    expect(messages).toEqual([
      {
        event: 'response.output_text.delta',
        data: ['{"delta":"Hello"}'],
      },
      {
        data: ['[DONE]'],
      },
    ]);
  });

  it('ignores comments and supports multiline data payloads', () => {
    const accumulator = new SseAccumulator();

    const messages = accumulator.push(
      ': keep-alive\n' +
        'event: message\n' +
        'data: {"a":1}\n' +
        'data: {"b":2}\n\n',
    );

    expect(messages).toEqual([
      {
        event: 'message',
        data: ['{"a":1}', '{"b":2}'],
      },
    ]);
  });
});
