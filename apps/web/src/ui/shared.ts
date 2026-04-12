import type {
  InspectorError,
  SessionStatus,
} from '@llmscope/shared-types';

import type { ObservationFilters } from '../types.js';

export const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

export const formatDateTime = (value: string | undefined): string => {
  if (value === undefined) {
    return '-';
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
};

export const formatDuration = (durationMs: number | undefined): string => {
  if (durationMs === undefined) {
    return '-';
  }

  return `${durationMs} ms`;
};

export const formatStatusCode = (
  statusCode: number | undefined,
  errorCode: string | undefined,
): string => {
  if (statusCode !== undefined) {
    return String(statusCode);
  }

  if (errorCode !== undefined) {
    return errorCode;
  }

  return '-';
};

export const formatJson = (value: unknown): string => {
  return JSON.stringify(value, null, 2) ?? '';
};

export const renderDefinitionList = (
  entries: Array<[label: string, value: string]>,
): string => {
  return `<dl class="meta-list">${entries
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('')}</dl>`;
};

export const renderBadge = (
  label: string,
  tone: 'neutral' | 'success' | 'warning' | 'danger',
): string => {
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
};

export const getStatusTone = (
  status: SessionStatus,
): 'neutral' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'danger';
    case 'streaming':
      return 'warning';
    default:
      return 'neutral';
  }
};

export const toPageUrl = (
  filters: ObservationFilters,
  selectedSessionId?: string,
  options?: {
    compareMode?: 'previous';
    compareToSessionId?: string;
  },
): string => {
  const url = new URL('http://llmscope.local/');

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

  if (selectedSessionId !== undefined) {
    url.searchParams.set('sessionId', selectedSessionId);
  }

  if (options?.compareMode === 'previous') {
    url.searchParams.set('compare', 'previous');
  }

  if (options?.compareToSessionId !== undefined) {
    url.searchParams.set('compareTo', options.compareToSessionId);
  }

  const search = url.searchParams.toString();
  return search.length > 0 ? `/?${search}` : '/';
};

export const renderErrorPanel = (error: InspectorError | undefined): string => {
  if (error === undefined) {
    return '';
  }

  return `<section class="panel"><h3>Error</h3>${renderDefinitionList([
    ['code', error.code],
    ['phase', error.phase],
    ['message', error.message],
  ])}${error.details === undefined ? '' : `<div><h4>Details</h4><pre>${escapeHtml(formatJson(error.details))}</pre></div>`}</section>`;
};
