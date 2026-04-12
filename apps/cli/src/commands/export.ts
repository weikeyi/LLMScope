import {
  buildObservationBaseUrl,
  readErrorBody,
  resolveCommandConfig,
  resolveObservationTarget,
  writeCommandOutput,
} from './shared.js';

export const runExportCommand = async (command: {
  configFilePath?: string;
  target: {
    host?: string;
    port?: number;
  };
  sessionId?: string;
  format: 'json' | 'ndjson' | 'markdown';
  outputPath?: string;
  query: {
    status?: string;
    provider?: string;
    model?: string;
    search?: string;
    limit?: number;
  };
}): Promise<void> => {
  const resolvedConfig = resolveCommandConfig({}, command.configFilePath);
  const target = resolveObservationTarget(command.target, resolvedConfig);
  const response = await fetch(
    `${buildObservationBaseUrl(target.host, target.port)}/api/sessions/export`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        format: command.format,
        sessionId: command.sessionId,
        query: command.query,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorBody(response));
  }

  writeCommandOutput(await response.text(), command.outputPath);
};
