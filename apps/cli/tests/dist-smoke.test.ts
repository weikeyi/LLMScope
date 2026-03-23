import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import type { Session } from '@llmscope/shared-types';

import { createCliRuntime } from '../src/index.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const tempDirectories: string[] = [];

const createTempDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'llmscope-cli-dist-'));
  tempDirectories.push(directory);
  return directory;
};

const runProcess = async (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    timeoutMs?: number;
  },
): Promise<{ code: number | null; stdout: string; stderr: string }> => {
  const child = spawn(command, args, {
    cwd: options?.cwd ?? repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout.on('data', (chunk) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  child.stderr.on('data', (chunk) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const timeoutMs = options?.timeoutMs ?? 300_000;

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Process timed out: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
};

const runDistCli = async (
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> => {
  return await runProcess('node', ['apps/cli/dist/index.js', ...args], {
    cwd: repoRoot,
  });
};

const listen = async (
  server: Server,
): Promise<{ host: string; port: number; close: () => Promise<void> }> => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('Server address unavailable.');
  }

  return {
    host: address.address,
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined && error !== null) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};

describe.sequential('@llmscope/cli dist smoke', () => {
  beforeAll(async () => {
    const build = await runProcess(
      'pnpm',
      ['exec', 'turbo', 'run', 'build', '--force'],
      {
        cwd: repoRoot,
        timeoutMs: 300_000,
      },
    );

    if (build.code !== 0) {
      throw new Error(
        `Workspace build failed.\nSTDOUT:\n${build.stdout}\nSTDERR:\n${build.stderr}`,
      );
    }
  }, 320_000);

  afterAll(() => {
    while (tempDirectories.length > 0) {
      const directory = tempDirectories.pop();

      if (directory !== undefined) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it(
    'prints general help from the built dist entrypoint',
    async () => {
      const result = await runDistCli(['--help']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Usage:');
      expect(result.stderr).toContain('llmscope-cli export');
    },
    30_000,
  );

  it(
    'runs doctor from the built dist entrypoint with a temp config file',
    async () => {
      const cwd = createTempDirectory();
      const configFilePath = join(cwd, 'llmscope.yaml');

      writeFileSync(
        configFilePath,
        [
          'proxy:',
          '  host: 127.0.0.1',
          '  port: 0',
          'ui:',
          '  enabled: true',
          '  port: 0',
          'storage:',
          '  mode: memory',
          'privacy:',
          '  mode: balanced',
          'routes: []',
        ].join('\n'),
        'utf8',
      );

      const result = await runDistCli(['doctor', '--config', configFilePath]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Doctor overall status: ok');
      expect(result.stdout).toContain('node version');
    },
    30_000,
  );

  it(
    'runs list, show, export, and clear from the built dist entrypoint',
    async () => {
      const upstream = createServer(
        async (_request: IncomingMessage, response: ServerResponse) => {
          response.statusCode = 200;
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ ok: true }));
        },
      );
      const upstreamAddress = await listen(upstream);
      const runtime = createCliRuntime({
        upstreamUrl: `http://${upstreamAddress.host}:${upstreamAddress.port}`,
        host: '127.0.0.1',
        port: 0,
        maxSessions: 10,
        observationPort: 0,
      });

      await runtime.start();
      const proxyAddress = runtime.getProxyAddress();
      const observationAddress = runtime.getObservationAddress();

      if (observationAddress === null) {
        throw new Error('Expected observation server address.');
      }

      const outputPath = join(createTempDirectory(), 'export', 'session.json');

      try {
        await fetch(
          `http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-dist-smoke',
              messages: [{ role: 'user', content: 'hi' }],
            }),
          },
        );

        const sessionsResponse = await fetch(
          `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
        );
        const sessions = (await sessionsResponse.json()) as Array<{
          id: string;
        }>;
        const session = sessions[0];

        if (session === undefined) {
          throw new Error('Expected a captured session.');
        }

        const listResult = await runDistCli([
          'list',
          '--host',
          observationAddress.host,
          '--ui-port',
          String(observationAddress.port),
          '--status',
          'completed',
        ]);
        expect(listResult.code).toBe(0);
        expect(listResult.stdout).toContain(session.id);
        expect(listResult.stdout).toContain('/v1/chat/completions');

        const showResult = await runDistCli([
          'show',
          '--host',
          observationAddress.host,
          '--ui-port',
          String(observationAddress.port),
          '--session-id',
          session.id,
        ]);
        expect(showResult.code).toBe(0);
        const detail = JSON.parse(showResult.stdout) as Session;
        expect(detail.id).toBe(session.id);
        expect(detail.normalized?.model).toBe('gpt-dist-smoke');

        const exportResult = await runDistCli([
          'export',
          '--host',
          observationAddress.host,
          '--ui-port',
          String(observationAddress.port),
          '--session-id',
          session.id,
          '--output',
          outputPath,
        ]);
        expect(exportResult.code).toBe(0);
        const exported = JSON.parse(readFileSync(outputPath, 'utf8')) as Session;
        expect(exported.id).toBe(session.id);

        const clearResult = await runDistCli([
          'clear',
          '--host',
          observationAddress.host,
          '--ui-port',
          String(observationAddress.port),
          '--session-id',
          session.id,
        ]);
        expect(clearResult.code).toBe(0);
        expect(clearResult.stdout).toContain(`Cleared session ${session.id}.`);

        const afterClearResponse = await fetch(
          `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
        );
        const afterClear = (await afterClearResponse.json()) as Array<{
          id: string;
        }>;
        expect(afterClear).toHaveLength(0);
      } finally {
        await runtime.stop();
        await upstreamAddress.close();
      }
    },
    30_000,
  );
});
