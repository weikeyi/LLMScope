import {
  buildObservationBaseUrl,
  readErrorBody,
  resolveCommandConfig,
  resolveObservationTarget,
} from './shared.js';

export const runClearCommand = async (command: {
  configFilePath?: string;
  target: {
    host?: string;
    port?: number;
  };
  sessionId?: string;
}): Promise<void> => {
  const resolvedConfig = resolveCommandConfig({}, command.configFilePath);
  const target = resolveObservationTarget(command.target, resolvedConfig);
  const path =
    command.sessionId === undefined
      ? '/api/sessions?confirm=true'
      : `/api/sessions/${encodeURIComponent(command.sessionId)}`;

  const response = await fetch(
    `${buildObservationBaseUrl(target.host, target.port)}${path}`,
    {
      method: 'DELETE',
    },
  );

  if (!response.ok && response.status !== 204) {
    throw new Error(await readErrorBody(response));
  }

  console.log(
    command.sessionId === undefined
      ? 'Cleared all sessions.'
      : `Cleared session ${command.sessionId}.`,
  );
};
