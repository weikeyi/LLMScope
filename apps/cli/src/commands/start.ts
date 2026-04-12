import type { ResolvedConfig, ResolvedPrivacyConfig } from '@llmscope/config';

export interface StartCommandRuntimeOptions {
  upstreamUrl?: string;
  host?: string;
  port?: number;
  maxSessions?: number;
  privacy?: ResolvedPrivacyConfig;
  observationPort?: number;
  config?: ResolvedConfig;
}

export interface StartRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const EXIT_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

export const runStartCommand = async (
  parsedArgs: {
    runtimeOptions: StartCommandRuntimeOptions;
  },
  resolvedConfig: ResolvedConfig,
  createRuntime: (options: StartCommandRuntimeOptions) => StartRuntime,
): Promise<void> => {
  const runtime = createRuntime({
    ...parsedArgs.runtimeOptions,
    config: resolvedConfig,
    maxSessions: resolvedConfig.storage.memory.maxSessions,
    privacy: resolvedConfig.privacy,
    observationPort: resolvedConfig.ui.port,
    host: resolvedConfig.proxy.host,
    port: resolvedConfig.proxy.port,
  });
  await runtime.start();

  let isStopping = false;

  const stop = async (): Promise<void> => {
    if (isStopping) {
      return;
    }

    isStopping = true;
    await runtime.stop();
  };

  for (const signal of EXIT_SIGNALS) {
    process.once(signal, () => {
      void stop().finally(() => {
        process.exit(0);
      });
    });
  }

  process.once('beforeExit', () => {
    void stop();
  });
};
