import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { beforeAll, afterAll, describe, expect, it } from 'vitest';

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
});
