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

export const renderClientScript = (): string => {
  return `(() => {
  const stateNode = document.getElementById('llmscope-observation-state');

  if (!(stateNode instanceof HTMLScriptElement)) {
    return;
  }

  const state = JSON.parse(stateNode.textContent ?? '{}');
  const apiBaseUrl = typeof state.apiBaseUrl === 'string' ? state.apiBaseUrl : '';
  const filters = state.filters ?? {};
  const selectedSessionId =
    typeof state.selectedSessionId === 'string' ? state.selectedSessionId : null;

  const setLoading = (value) => {
    document.body.setAttribute('data-loading', value ? 'true' : 'false');
  };

  const navigateToFilters = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('sessionId');
    window.location.assign(url.pathname + url.search);
  };

  const downloadExport = async () => {
    const formatSelect = document.querySelector('[data-export-format="true"]');
    const format =
      formatSelect instanceof HTMLSelectElement ? formatSelect.value : 'markdown';

    const payload = selectedSessionId === null
      ? {
          format,
          query: filters,
        }
      : {
          format,
          sessionIds: [selectedSessionId],
        };

    const response = await fetch(new URL('/api/sessions/export', apiBaseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Export failed.');
    }

    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const download = document.createElement('a');
    const extension =
      format === 'json' ? 'json' : format === 'ndjson' ? 'ndjson' : 'md';

    download.href = href;
    download.download =
      selectedSessionId === null
        ? 'llmscope-sessions.' + extension
        : 'llmscope-session-' + selectedSessionId + '.' + extension;
    document.body.append(download);
    download.click();
    download.remove();
    URL.revokeObjectURL(href);
  };

  const runAction = async (button) => {
    const action = button.getAttribute('data-action');

    if (action === 'refresh') {
      setLoading(true);
      window.location.assign(window.location.pathname + window.location.search);
      return;
    }

    if (action === 'export') {
      setLoading(true);

      try {
        await downloadExport();
      } finally {
        setLoading(false);
      }

      return;
    }

    if (action === 'delete-session') {
      const confirmMessage = button.getAttribute('data-confirm-message') ?? '';

      if (!window.confirm(confirmMessage)) {
        return;
      }

      setLoading(true);
      const sessionId = button.getAttribute('data-session-id');
      const response = await fetch(
        new URL('/api/sessions/' + encodeURIComponent(sessionId ?? ''), apiBaseUrl),
        { method: 'DELETE' },
      );

      if (!response.ok) {
        setLoading(false);
        throw new Error('Delete failed.');
      }

      navigateToFilters();
      return;
    }

    if (action === 'clear-all') {
      const confirmMessage = button.getAttribute('data-confirm-message') ?? '';

      if (!window.confirm(confirmMessage)) {
        return;
      }

      setLoading(true);
      const url = new URL('/api/sessions', apiBaseUrl);
      url.searchParams.set('confirm', 'true');
      const response = await fetch(url, { method: 'DELETE' });

      if (!response.ok) {
        setLoading(false);
        throw new Error('Clear failed.');
      }

      navigateToFilters();
    }
  };

  const filterForm = document.querySelector('[data-filter-form="true"]');
  filterForm?.addEventListener('submit', () => {
    setLoading(true);
  });

  for (const link of document.querySelectorAll('[data-session-link="true"]')) {
    link.addEventListener('click', () => {
      setLoading(true);
    });
  }

  for (const button of document.querySelectorAll('[data-action]')) {
    button.addEventListener('click', () => {
      void runAction(button).catch((error) => {
        setLoading(false);
        const message = error instanceof Error ? error.message : 'Action failed.';
        window.alert(message);
      });
    });
  }
})();`;
};

