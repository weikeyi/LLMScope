import type { SessionSummary } from '@llmscope/shared-types';

import {
  buildObservationBaseUrl,
  readErrorBody,
  resolveCommandConfig,
  resolveObservationTarget,
  setListQueryParams,
} from './shared.js';

const formatSummaryValue = (
  value: string | number | boolean | undefined,
): string => {
  if (value === undefined) {
    return '-';
  }

  return String(value);
};

const renderSessionSummaryRow = (session: SessionSummary): string => {
  return [
    `[session ${session.id}]`,
    session.method,
    session.path,
    `status=${session.status}`,
    `provider=${formatSummaryValue(session.provider)}`,
    `model=${formatSummaryValue(session.model)}`,
    `duration=${session.durationMs === undefined ? '-' : `${session.durationMs}ms`}`,
    `warnings=${session.warningCount}`,
    `error=${formatSummaryValue(session.errorCode)}`,
  ].join(' ');
};

export const runListCommand = async (command: {
  configFilePath?: string;
  target: {
    host?: string;
    port?: number;
  };
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
  const requestUrl = new URL(
    '/api/sessions',
    buildObservationBaseUrl(target.host, target.port),
  );

  setListQueryParams(requestUrl, command.query);

  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(await readErrorBody(response));
  }

  const sessions = (await response.json()) as SessionSummary[];

  if (sessions.length === 0) {
    console.log('No captured sessions found.');
    return;
  }

  for (const session of sessions) {
    console.log(renderSessionSummaryRow(session));
  }
};
