import {
  diffSessions,
  generateReplay,
  type ReplayFormat,
} from '@llmscope/replay';
import type { Session, SessionSummary } from '@llmscope/shared-types';

import type {
  ObservationFilters,
  ObservationPageData,
  ObservationUiOptions,
} from '../types.js';
import type { ObservationExportRequest } from '../ui/actions.js';

const DEFAULT_LIMIT = 25;

const toPositiveInteger = (value: number | undefined): number => {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    return DEFAULT_LIMIT;
  }

  return value;
};

export const toObservationFilters = (
  options: ObservationUiOptions,
): ObservationFilters => {
  const filters: ObservationFilters = {
    limit: toPositiveInteger(options.limit),
  };

  if (options.status !== undefined) {
    filters.status = options.status;
  }

  const provider = options.provider?.trim();
  if (provider !== undefined && provider.length > 0) {
    filters.provider = provider;
  }

  const model = options.model?.trim();
  if (model !== undefined && model.length > 0) {
    filters.model = model;
  }

  const search = options.search?.trim();
  if (search !== undefined && search.length > 0) {
    filters.search = search;
  }

  return filters;
};

const toSessionsUrl = (
  filters: ObservationFilters,
  apiBaseUrl: string,
): string => {
  const url = new URL('/api/sessions', apiBaseUrl);

  if (filters.status !== undefined) {
    url.searchParams.set('status', filters.status);
  }

  if (filters.provider !== undefined) {
    url.searchParams.set('provider', filters.provider);
  }

  if (filters.model !== undefined) {
    url.searchParams.set('model', filters.model);
  }

  if (filters.search !== undefined) {
    url.searchParams.set('search', filters.search);
  }

  url.searchParams.set('limit', String(filters.limit));
  return url.toString();
};

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  return (await response.json()) as T;
};

const toResponseErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? fallback;
};

const loadSessionDetail = async (
  apiBaseUrl: string,
  sessionId: string,
): Promise<Session | null> => {
  const response = await fetch(
    new URL(`/api/sessions/${sessionId}`, apiBaseUrl),
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Observation API returned ${response.status} while loading session ${sessionId}.`,
    );
  }

  return parseJsonResponse<Session>(response);
};

const getReplayFormats = (session: Session): ReplayFormat[] => {
  const provider = session.normalized?.provider;

  if (provider === 'anthropic') {
    return ['curl', 'fetch', 'anthropic'];
  }

  if (provider === 'openai') {
    return ['curl', 'fetch', 'openai'];
  }

  return ['curl', 'fetch'];
};

const getReplayLabel = (format: ReplayFormat): string => {
  if (format === 'curl') {
    return 'curl';
  }

  if (format === 'fetch') {
    return 'fetch';
  }

  if (format === 'openai') {
    return 'OpenAI SDK';
  }

  return 'Anthropic SDK';
};

const resolvePreviousSessionId = (
  sessions: SessionSummary[],
  selectedSessionId: string,
): string | null => {
  const selectedIndex = sessions.findIndex(
    (session) => session.id === selectedSessionId,
  );

  if (selectedIndex <= 0) {
    return null;
  }

  return sessions[selectedIndex - 1]?.id ?? null;
};

export const loadObservationPageData = async (
  options: ObservationUiOptions,
): Promise<ObservationPageData> => {
  const filters = toObservationFilters(options);
  let sessions: SessionSummary[] = [];
  let selectedSession: Session | null = null;
  let comparison: ObservationPageData['comparison'] = null;
  let error: string | undefined;

  try {
    const sessionsResponse = await fetch(
      toSessionsUrl(filters, options.apiBaseUrl),
    );

    if (!sessionsResponse.ok) {
      error = await toResponseErrorMessage(
        sessionsResponse,
        `Observation API returned ${sessionsResponse.status} while loading sessions.`,
      );
    } else {
      sessions = await parseJsonResponse<SessionSummary[]>(sessionsResponse);
    }
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? `Could not load sessions from the observation API: ${fetchError.message}`
        : 'Could not load sessions from the observation API.';
  }

  const selectedSessionId =
    options.selectedSessionId ?? sessions[0]?.id ?? null;

  if (selectedSessionId !== null && error === undefined) {
    try {
      selectedSession = await loadSessionDetail(
        options.apiBaseUrl,
        selectedSessionId,
      );

      if (selectedSession === null) {
        error = `Session ${selectedSessionId} was not found in the observation API.`;
      }
    } catch (detailError) {
      error =
        detailError instanceof Error
          ? detailError.message
          : `Could not load session ${selectedSessionId} from the observation API.`;
    }
  }

  const data: ObservationPageData = {
    apiBaseUrl: options.apiBaseUrl,
    filters,
    selectedSessionId,
    sessions,
    selectedSession,
    replayArtifacts:
      selectedSession === null
        ? []
        : getReplayFormats(selectedSession).map((format) => ({
            format,
            label: getReplayLabel(format),
            content: generateReplay(selectedSession, { format }),
          })),
  };

  let compareSessionId: string | null = null;
  let comparisonMode: 'previous' | 'selected' | null = null;

  if (selectedSessionId !== null) {
    if (
      options.compareToSessionId !== undefined &&
      options.compareToSessionId !== selectedSessionId
    ) {
      compareSessionId = options.compareToSessionId;
      comparisonMode = 'selected';
    } else if (options.compareMode === 'previous') {
      compareSessionId = resolvePreviousSessionId(sessions, selectedSessionId);
      comparisonMode = compareSessionId === null ? null : 'previous';
    }
  }

  if (
    selectedSession !== null &&
    compareSessionId !== null &&
    comparisonMode !== null &&
    error === undefined
  ) {
    try {
      const compareSession = await loadSessionDetail(
        options.apiBaseUrl,
        compareSessionId,
      );

      if (compareSession !== null) {
        comparison = {
          mode: comparisonMode,
          compareSessionId,
          compareSession,
          diff: diffSessions(compareSession, selectedSession),
        };
      }
    } catch (comparisonError) {
      error =
        comparisonError instanceof Error
          ? comparisonError.message
          : `Could not load comparison session ${compareSessionId}.`;
    }
  }

  data.comparison = comparison;

  if (error !== undefined) {
    data.error = error;
  }

  return data;
};

const expectNoContent = async (
  response: Response,
  fallback: string,
): Promise<void> => {
  if (response.ok) {
    return;
  }

  throw new Error(await toResponseErrorMessage(response, fallback));
};

export const deleteSession = async (
  apiBaseUrl: string,
  sessionId: string,
): Promise<void> => {
  const response = await fetch(
    new URL(`/api/sessions/${encodeURIComponent(sessionId)}`, apiBaseUrl),
    { method: 'DELETE' },
  );

  await expectNoContent(
    response,
    `Observation API returned ${response.status} while deleting session ${sessionId}.`,
  );
};

export const clearSessions = async (apiBaseUrl: string): Promise<void> => {
  const url = new URL('/api/sessions', apiBaseUrl);
  url.searchParams.set('confirm', 'true');

  const response = await fetch(url, { method: 'DELETE' });
  await expectNoContent(
    response,
    `Observation API returned ${response.status} while clearing sessions.`,
  );
};

export const exportSessions = async (
  apiBaseUrl: string,
  request: ObservationExportRequest,
): Promise<{ contentType: string; body: string }> => {
  const response = await fetch(new URL('/api/sessions/export', apiBaseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      await toResponseErrorMessage(
        response,
        `Observation API returned ${response.status} while exporting sessions.`,
      ),
    );
  }

  return {
    contentType: response.headers.get('content-type') ?? 'text/plain',
    body: await response.text(),
  };
};
