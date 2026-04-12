import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfigFile, resolveConfig } from '../src/index.js';

const tempDirectories: string[] = [];

const createTempDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'llmscope-config-'));
  tempDirectories.push(directory);
  return directory;
};

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('@llmscope/config loadConfigFile', () => {
  it('loads YAML config files', () => {
    const cwd = createTempDirectory();
    const filePath = join(cwd, 'llmscope.yaml');

    writeFileSync(
      filePath,
      [
        'proxy:',
        '  host: 0.0.0.0',
        '  port: 9999',
        'ui:',
        '  enabled: false',
        'storage:',
        '  mode: sqlite',
        '  sqlite:',
        '    filePath: ./tmp/data.db',
        'routes:',
        '  - id: default',
        '    targetBaseUrl: https://api.openai.com',
      ].join('\n'),
      'utf8',
    );

    expect(loadConfigFile(filePath)).toEqual({
      proxy: {
        host: '0.0.0.0',
        port: 9999,
      },
      ui: {
        enabled: false,
      },
      storage: {
        mode: 'sqlite',
        sqlite: {
          filePath: './tmp/data.db',
        },
      },
      routes: [
        {
          id: 'default',
          targetBaseUrl: 'https://api.openai.com',
        },
      ],
    });
  });
});

describe('@llmscope/config resolveConfig', () => {
  it('discovers llmscope.yaml from cwd when filePath is omitted', () => {
    const cwd = createTempDirectory();
    const discoveredFilePath = join(cwd, 'llmscope.yaml');

    writeFileSync(
      discoveredFilePath,
      [
        'proxy:',
        '  host: 0.0.0.0',
        'ui:',
        '  port: 9901',
        'storage:',
        '  mode: sqlite',
        '  sqlite:',
        '    filePath: ./discovered.db',
      ].join('\n'),
      'utf8',
    );

    expect(
      resolveConfig({
        cwd,
        env: {},
      }),
    ).toEqual({
      proxy: {
        host: '0.0.0.0',
        port: 8787,
        mode: 'gateway',
        maxConcurrentSessions: 100,
        requestTimeoutMs: 30_000,
      },
      ui: {
        enabled: true,
        port: 9901,
        corsOrigin: 'http://127.0.0.1:9901',
      },
      storage: {
        mode: 'sqlite',
        memory: {
          maxSessions: 500,
        },
        sqlite: {
          filePath: resolvePath(cwd, './discovered.db'),
        },
      },
      privacy: {
        mode: 'balanced',
      },
      routes: [],
    });
  });

  it('prefers an explicit filePath over discovered config files', () => {
    const cwd = createTempDirectory();
    const discoveredFilePath = join(cwd, 'llmscope.yaml');
    const explicitFilePath = join(cwd, 'custom-config.json');

    writeFileSync(
      discoveredFilePath,
      [
        'proxy:',
        '  host: 0.0.0.0',
        'ui:',
        '  port: 9901',
      ].join('\n'),
      'utf8',
    );

    writeFileSync(
      explicitFilePath,
      JSON.stringify({
        proxy: {
          host: '127.0.0.2',
        },
        ui: {
          port: 9902,
        },
      }),
      'utf8',
    );

    expect(
      resolveConfig({
        cwd,
        filePath: explicitFilePath,
        env: {},
      }),
    ).toEqual({
      proxy: {
        host: '127.0.0.2',
        port: 8787,
        mode: 'gateway',
        maxConcurrentSessions: 100,
        requestTimeoutMs: 30_000,
      },
      ui: {
        enabled: true,
        port: 9902,
        corsOrigin: 'http://127.0.0.1:9902',
      },
      storage: {
        mode: 'memory',
        memory: {
          maxSessions: 500,
        },
        sqlite: {
          filePath: resolvePath(cwd, './data/llmscope.db'),
        },
      },
      privacy: {
        mode: 'balanced',
      },
      routes: [],
    });
  });

  it('lets environment variables override a discovered config file', () => {
    const cwd = createTempDirectory();
    const discoveredFilePath = join(cwd, 'llmscope.yaml');

    writeFileSync(
      discoveredFilePath,
      [
        'proxy:',
        '  host: 0.0.0.0',
        'ui:',
        '  port: 9901',
        'storage:',
        '  mode: sqlite',
        '  sqlite:',
        '    filePath: ./discovered.db',
      ].join('\n'),
      'utf8',
    );

    expect(
      resolveConfig({
        cwd,
        env: {
          LLMSCOPE_PROXY_PORT: '7100',
          LLMSCOPE_UI_PORT: '9902',
        },
      }),
    ).toEqual({
      proxy: {
        host: '0.0.0.0',
        port: 7100,
        mode: 'gateway',
        maxConcurrentSessions: 100,
        requestTimeoutMs: 30_000,
      },
      ui: {
        enabled: true,
        port: 9902,
        corsOrigin: 'http://127.0.0.1:9902',
      },
      storage: {
        mode: 'sqlite',
        memory: {
          maxSessions: 500,
        },
        sqlite: {
          filePath: resolvePath(cwd, './discovered.db'),
        },
      },
      privacy: {
        mode: 'balanced',
      },
      routes: [],
    });
  });

  it('merges file, env, and overrides with expected precedence', () => {
    const cwd = createTempDirectory();
    const filePath = join(cwd, 'llmscope.json');

    writeFileSync(
      filePath,
      JSON.stringify({
        proxy: {
          host: '0.0.0.0',
          port: 7000,
        },
        ui: {
          port: 7001,
        },
        storage: {
          mode: 'sqlite',
          sqlite: {
            filePath: './from-file.db',
          },
        },
        privacy: {
          mode: 'strict',
        },
      }),
      'utf8',
    );

    const config = resolveConfig({
      cwd,
      filePath,
      env: {
        LLMSCOPE_PROXY_PORT: '7100',
        LLMSCOPE_UI_ENABLED: 'false',
        LLMSCOPE_STORAGE_MEMORY_MAX_SESSIONS: '321',
        LLMSCOPE_PRIVACY_MODE: 'off',
      },
      overrides: {
        proxy: {
          host: '127.0.0.1',
        },
        ui: {
          port: 7200,
        },
        routes: [
          {
            id: 'default',
            targetBaseUrl: 'https://example.com/v1',
            rewriteHost: true,
          },
        ],
      },
    });

    expect(config).toEqual({
      proxy: {
        host: '127.0.0.1',
        port: 7100,
        mode: 'gateway',
        maxConcurrentSessions: 100,
        requestTimeoutMs: 30_000,
      },
      ui: {
        enabled: false,
        port: 7200,
        corsOrigin: 'http://127.0.0.1:7200',
      },
      storage: {
        mode: 'sqlite',
        memory: {
          maxSessions: 321,
        },
        sqlite: {
          filePath: resolvePath(cwd, './from-file.db'),
        },
      },
      privacy: {
        mode: 'off',
      },
      routes: [
        {
          id: 'default',
          targetBaseUrl: 'https://example.com/v1',
          rewriteHost: true,
        },
      ],
    });
  });

  it('uses defaults when no file, env, or overrides are provided', () => {
    expect(resolveConfig({ env: {} })).toEqual({
      proxy: {
        host: '127.0.0.1',
        port: 8787,
        mode: 'gateway',
        maxConcurrentSessions: 100,
        requestTimeoutMs: 30_000,
      },
      ui: {
        enabled: true,
        port: 8788,
        corsOrigin: 'http://127.0.0.1:8788',
      },
      storage: {
        mode: 'memory',
        memory: {
          maxSessions: 500,
        },
        sqlite: {
          filePath: resolvePath(process.cwd(), './data/llmscope.db'),
        },
      },
      privacy: {
        mode: 'balanced',
      },
      routes: [],
    });
  });

  it('rejects invalid environment values', () => {
    expect(() =>
      resolveConfig({
        env: {
          LLMSCOPE_UI_ENABLED: 'maybe',
        },
      }),
    ).toThrow('Invalid boolean value for LLMSCOPE_UI_ENABLED: maybe.');
  });

  it('resolves sqlite file paths against cwd and carries runtime hardening settings', () => {
    const cwd = createTempDirectory();

    const config = resolveConfig({
      cwd,
      env: {
        LLMSCOPE_PROXY_MAX_CONCURRENT_SESSIONS: '12',
        LLMSCOPE_PROXY_REQUEST_TIMEOUT_MS: '4500',
      },
      overrides: {
        storage: {
          mode: 'sqlite',
          sqlite: {
            filePath: './daily-use/llmscope.db',
          },
        },
      },
    });

    expect(config.proxy).toMatchObject({
      maxConcurrentSessions: 12,
      requestTimeoutMs: 4500,
    });
    expect(config.storage.sqlite.filePath).toBe(
      resolvePath(cwd, './daily-use/llmscope.db'),
    );
  });
});
