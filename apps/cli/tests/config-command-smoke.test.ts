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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCliRuntime } from '../src/index.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const tempDirectories: string[] = [];

const createTempDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'llmscope-cli-smoke-'));
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

const startDistCli = async (
  args: string[],
): Promise<{
  child: ReturnType<typeof spawn>;
  waitForLine: (pattern: string) => Promise<string>;
}> => {
  const child = spawn('node', ['apps/cli/dist/index.js', ...args], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdoutLines: string[] = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdoutLines.push(...chunk.split('\n').filter(Boolean));
  });

  const waitForLine = async (pattern: string): Promise<string> => {
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      const match = stdoutLines.find((line) => line.includes(pattern));
      if (match !== undefined) {
        return match;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`Timed out waiting for line: ${pattern}`);
  };

  return {
    child,
    waitForLine,
  };
};

describe.sequential('@llmscope/cli config command smoke', () => {
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
    'runs doctor from the built cli with config-driven defaults',
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

      const result = await runProcess(
        'node',
        ['apps/cli/dist/index.js', 'doctor', '--config', configFilePath],
        {
          cwd: repoRoot,
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Doctor overall status: ok');
      expect(result.stdout).toContain('data directory writable');
    },
    30_000,
  );

  it(
    'smokes start, list, show, clear, and export from the built cli',
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

      const exportPath = join(
        createTempDirectory(),
        'exports',
        'session-export.md',
      );
      const startConfigPath = join(createTempDirectory(), 'start-config.yaml');
      const startProxyPort = 38987;
      const startUiPort = 38988;

      writeFileSync(
        startConfigPath,
        [
          'proxy:',
          '  host: 127.0.0.1',
          `  port: ${startProxyPort}`,
          'ui:',
          '  enabled: true',
          `  port: ${startUiPort}`,
          'storage:',
          '  mode: memory',
          'privacy:',
          '  mode: balanced',
          'routes:',
          '  - id: default',
          `    targetBaseUrl: http://${upstreamAddress.host}:${upstreamAddress.port}`,
          '    rewriteHost: true',
        ].join('\n'),
        'utf8',
      );

      try {
        const started = await startDistCli(['start', '--config', startConfigPath]);
        const proxyLine = await started.waitForLine('LLMScope proxy listening');
        const uiLine = await started.waitForLine('LLMScope observation API listening');

        expect(proxyLine).toContain(String(startProxyPort));
        expect(uiLine).toContain(String(startUiPort));
        started.child.kill('SIGTERM');
        await once(started.child, 'close');

        await fetch(
          `http://${proxyAddress.host}:${proxyAddress.port}/v1/chat/completions`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-smoke',
              messages: [{ role: 'user', content: 'hi' }],
            }),
          },
        );

        const sessionsResponse = await fetch(
          `http://${observationAddress.host}:${observationAddress.port}/api/sessions`,
        );
        const sessions = (await sessionsResponse.json()) as Array<{ id: string }>;
        const session = sessions[0];

        if (session === undefined) {
          throw new Error('Expected a captured session.');
        }

        const listResult = await runProcess(
          'node',
          [
            'apps/cli/dist/index.js',
            'list',
            '--host',
            observationAddress.host,
            '--ui-port',
            String(observationAddress.port),
            '--status',
            'completed',
          ],
          { cwd: repoRoot },
        );
        expect(listResult.code).toBe(0);
        expect(listResult.stdout).toContain(session.id);

        const showResult = await runProcess(
          'node',
          [
            'apps/cli/dist/index.js',
            'show',
            '--host',
            observationAddress.host,
            '--ui-port',
            String(observationAddress.port),
            '--session-id',
            session.id,
          ],
          { cwd: repoRoot },
        );
        expect(showResult.code).toBe(0);
        expect(showResult.stdout).toContain('"id"');
        expect(showResult.stdout).toContain(session.id);

        const exportResult = await runProcess(
          'node',
          [
            'apps/cli/dist/index.js',
            'export',
            '--host',
            observationAddress.host,
            '--ui-port',
            String(observationAddress.port),
            '--format',
            'markdown',
            '--output',
            exportPath,
            '--status',
            'completed',
          ],
          { cwd: repoRoot },
        );
        expect(exportResult.code).toBe(0);
        expect(readFileSync(exportPath, 'utf8')).toContain('# LLMScope Export');

        const clearResult = await runProcess(
          'node',
          [
            'apps/cli/dist/index.js',
            'clear',
            '--host',
            observationAddress.host,
            '--ui-port',
            String(observationAddress.port),
          ],
          { cwd: repoRoot },
        );
        expect(clearResult.code).toBe(0);
        expect(clearResult.stdout).toContain('Cleared all sessions.');
      } finally {
        await runtime.stop();
        await upstreamAddress.close();
      }
    },
    60_000,
  );
});
