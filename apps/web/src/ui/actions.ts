import type { ObservationFilters } from '../types.js';
import { escapeHtml, toPageUrl } from './shared.js';

export const DELETE_CONFIRM_MESSAGE =
  'This permanently deletes the selected session.';
export const CLEAR_CONFIRM_MESSAGE =
  'This permanently deletes every captured session.';

export interface ObservationExportRequest {
  format: 'json' | 'ndjson' | 'markdown';
  sessionIds?: string[];
  query?: {
    status?: string;
    provider?: string;
    model?: string;
    search?: string;
    limit?: number;
  };
}

export const renderSidebarActions = (
  filters: ObservationFilters,
  selectedSessionId: string | null,
): string => {
  return `<section class="panel action-panel">
    <div class="action-panel-header">
      <h2>Operator actions</h2>
      <p>Refresh, export, or trim captured traffic without leaving this view.</p>
    </div>
    <div class="toolbar">
      <button class="secondary-action" type="button" data-action="refresh">Refresh sessions</button>
      <button class="secondary-action danger-action" type="button" data-action="clear-all" data-confirm-message="${escapeHtml(
        CLEAR_CONFIRM_MESSAGE,
      )}">Clear all</button>
    </div>
    <div class="export-toolbar">
      <label class="filter-field compact-field">
        <span>export format</span>
        <select data-export-format="true" name="exportFormat">
          <option value="markdown">markdown</option>
          <option value="json">json</option>
          <option value="ndjson">ndjson</option>
        </select>
      </label>
      <button class="primary-action" type="button" data-action="export" data-export-mode="${selectedSessionId === null ? 'query' : 'selected'}">
        ${selectedSessionId === null ? 'Export filtered' : 'Export selected'}
      </button>
    </div>
    <a class="secondary-action subtle-link" href="${escapeHtml(
      toPageUrl(filters),
    )}">Share current view</a>
  </section>`;
};

export const renderDetailActions = (selectedSessionId: string): string => {
  return `<div class="detail-actions">
    <button class="secondary-action danger-action" type="button" data-action="delete-session" data-session-id="${escapeHtml(
      selectedSessionId,
    )}" data-confirm-message="${escapeHtml(DELETE_CONFIRM_MESSAGE)}">Delete session</button>
    <span class="inline-note">${escapeHtml(DELETE_CONFIRM_MESSAGE)}</span>
  </div>`;
};
