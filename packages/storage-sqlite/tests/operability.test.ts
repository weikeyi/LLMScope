import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  inspectSqliteStorage,
  SQLITE_SCHEMA_VERSION,
} from '../src/index.js';

const tempDirectories: string[] = [];

const createTempDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'llmscope-sqlite-op-'));
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

describe('inspectSqliteStorage', () => {
  it('creates parent directories and reports normalized operability details', () => {
    const cwd = createTempDirectory();

    const result = inspectSqliteStorage({
      cwd,
      filePath: './nested/data/llmscope.db',
    });

    expect(result.filePath).toBe(resolvePath(cwd, './nested/data/llmscope.db'));
    expect(result.directoryPath).toBe(resolvePath(cwd, './nested/data'));
    expect(result.schemaVersion).toBe(SQLITE_SCHEMA_VERSION);
    expect(result.journalMode.toLowerCase()).toBe('wal');
    expect(result.busyTimeoutMs).toBe(5000);
  });

  it('fails clearly when the sqlite parent path is unusable', () => {
    const cwd = createTempDirectory();
    const parentFile = join(cwd, 'not-a-directory');
    writeFileSync(parentFile, 'x', 'utf8');

    expect(() =>
      inspectSqliteStorage({
        filePath: join(parentFile, 'llmscope.db'),
      }),
    ).toThrow(/sqlite storage path/i);
  });
});
