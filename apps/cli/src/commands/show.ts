import type { Session } from '@llmscope/shared-types';

import {
  buildObservationBaseUrl,
  readErrorBody,
  resolveCommandConfig,
  resolveObservationTarget,
} from './shared.js';

export const runShowCommand = async (command: {
  configFilePath?: string;
  target: {
    host?: string;
    port?: number;
  };
  sessionId: string;
}): Promise<void> => {
  const resolvedConfig = resolveCommandConfig({}, command.configFilePath);
  const target = resolveObservationTarget(command.target, resolvedConfig);
  const response = await fetch(
    `${buildObservationBaseUrl(target.host, target.port)}/api/sessions/${encodeURIComponent(command.sessionId)}`,
  );

  if (!response.ok) {
    throw new Error(await readErrorBody(response));
  }

  const session = (await response.json()) as Session;
  console.log(JSON.stringify(session, null, 2));
};
