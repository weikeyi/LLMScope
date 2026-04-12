import type { SessionSummary } from '@llmscope/shared-types';

import type { ObservationFilters } from '../types.js';
import {
  escapeHtml,
  formatDateTime,
  formatDuration,
  formatStatusCode,
  getStatusTone,
  renderBadge,
  toPageUrl,
} from './shared.js';

const renderSessionRow = (
  session: SessionSummary,
  selectedSessionId: string | null,
  filters: ObservationFilters,
): string => {
  const isSelected = session.id === selectedSessionId;
  const rowClassName = isSelected
    ? 'session-row session-row-selected'
    : 'session-row';
  const title = `${session.method} ${session.path}`;
  const model = session.model ?? '-';
  const provider = session.provider ?? '-';
  const statusCode = formatStatusCode(session.statusCode, session.errorCode);
  const compareLink =
    selectedSessionId !== null && !isSelected
      ? `<a class="secondary-action session-compare-link" href="${escapeHtml(
          toPageUrl(filters, selectedSessionId, {
            compareToSessionId: session.id,
          }),
        )}">Compare</a>`
      : '';

  return `<li class="session-list-item"><a class="${rowClassName}" data-session-link="true" href="${escapeHtml(
    toPageUrl(filters, session.id),
  )}">
    <div class="session-row-header">
      <strong>${escapeHtml(title)}</strong>
      ${renderBadge(session.status, getStatusTone(session.status))}
    </div>
    <div class="session-row-meta">
      <span>${escapeHtml(provider)}</span>
      <span>${escapeHtml(model)}</span>
      <span>${escapeHtml(statusCode)}</span>
      <span>${escapeHtml(formatDuration(session.durationMs))}</span>
    </div>
    <div class="session-row-timestamp">${escapeHtml(formatDateTime(session.startedAt))}</div>
  </a>${compareLink}</li>`;
};

export const renderSessionList = (
  sessions: SessionSummary[],
  filters: ObservationFilters,
  selectedSessionId: string | null,
  error?: string,
): string => {
  if (sessions.length > 0) {
    return `<ul class="session-list">${sessions
      .map((session) => renderSessionRow(session, selectedSessionId, filters))
      .join('')}</ul>`;
  }

  if (error !== undefined) {
    return `<div class="empty-state-card">
      <h3>Sessions are temporarily unavailable.</h3>
      <p>Refresh sessions after the observation API is back.</p>
    </div>`;
  }

  return `<div class="empty-state-card">
    <h3>No captured sessions match these filters yet.</h3>
    <p>Adjust the filters or refresh to look for new traffic.</p>
  </div>`;
};
