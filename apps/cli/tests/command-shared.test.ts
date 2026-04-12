import { describe, expect, it } from 'vitest';

import { readErrorBody } from '../src/commands/shared.js';

describe('@llmscope/cli command shared', () => {
  it('formats typed observation api errors with their code', async () => {
    const response = new Response(
      JSON.stringify({
        error: 'Session missing.',
        code: 'SESSION_NOT_FOUND',
        phase: 'ui',
      }),
      {
        status: 404,
        headers: {
          'content-type': 'application/json',
        },
      },
    );

    await expect(readErrorBody(response)).resolves.toBe(
      '[SESSION_NOT_FOUND] Session missing.',
    );
  });
});
