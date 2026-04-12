import type { SessionSummary } from '@llmscope/shared-types';

import type { ObservationFilters } from '../types.js';
import { renderSidebarActions } from './actions.js';
import { escapeHtml } from './shared.js';

const STATUS_OPTIONS = ['pending', 'streaming', 'completed', 'error'];

const renderFilterSelect = (
  name: string,
  options: string[],
  selectedValue: string | undefined,
  placeholder: string,
): string => {
  const optionMarkup = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...options.map((option) => {
      const selected = option === selectedValue ? ' selected' : '';
      return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(option)}</option>`;
    }),
  ].join('');

  return `<label class="filter-field"><span>${escapeHtml(name)}</span><select data-filter-name="${escapeHtml(
    name,
  )}" name="${escapeHtml(name)}">${optionMarkup}</select></label>`;
};

const renderTextFilter = (
  name: string,
  value: string | undefined,
  placeholder: string,
): string => {
  return `<label class="filter-field"><span>${escapeHtml(name)}</span><input data-filter-name="${escapeHtml(
    name,
  )}" name="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}" type="text" value="${escapeHtml(
    value ?? '',
  )}" /></label>`;
};

export const renderFilterBar = (
  filters: ObservationFilters,
  sessions: SessionSummary[],
  selectedSessionId: string | null,
): string => {
  const providerOptions = [
    ...new Set(
      sessions
        .map((session) => session.provider)
        .filter((provider): provider is string => provider !== undefined),
    ),
  ].sort();
  const modelOptions = [
    ...new Set(
      sessions
        .map((session) => session.model)
        .filter((model): model is string => model !== undefined),
    ),
  ].sort();

  return `<section class="panel filters-panel">
    <div class="section-heading">
      <h2>Filters</h2>
      <p>Keep query state in the URL so refreshes and shared links stay stable.</p>
    </div>
    <form class="filters-form" data-filter-form="true" method="GET" action="/">
      <div class="filters-grid">
        ${renderFilterSelect('status', STATUS_OPTIONS, filters.status, 'All statuses')}
        ${renderFilterSelect('provider', providerOptions, filters.provider, 'All providers')}
        ${renderFilterSelect('model', modelOptions, filters.model, 'All models')}
        ${renderTextFilter('search', filters.search, 'session id, path, model')}
        <label class="filter-field"><span>limit</span><input data-filter-name="limit" min="1" name="limit" type="number" value="${filters.limit}" /></label>
      </div>
      <div class="filter-actions">
        <button class="primary-action" type="submit">Apply filters</button>
        <a class="secondary-action" href="/">Reset</a>
      </div>
    </form>
  </section>
  ${renderSidebarActions(filters, selectedSessionId)}`;
};

