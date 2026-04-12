import type { SessionSummary } from '@llmscope/shared-types';

import type { ObservationFilters, ObservationPageData } from '../types.js';
import { escapeHtml, toPageUrl } from './shared.js';

const findPreviousSessionId = (
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

export const renderDiffView = (options: {
  comparison?: ObservationPageData['comparison'];
  filters: ObservationFilters;
  selectedSessionId: string | null;
  sessions: SessionSummary[];
}): string => {
  if (options.selectedSessionId === null) {
    return '';
  }

  const previousSessionId = findPreviousSessionId(
    options.sessions,
    options.selectedSessionId,
  );
  const actions = [
    previousSessionId === null
      ? ''
      : `<a class="secondary-action" href="${escapeHtml(
          toPageUrl(options.filters, options.selectedSessionId, {
            compareMode: 'previous',
          }),
        )}">Compare with previous session</a>`,
    options.comparison === null || options.comparison === undefined
      ? ''
      : `<a class="secondary-action" href="${escapeHtml(
          toPageUrl(options.filters, options.selectedSessionId),
        )}">Clear comparison</a>`,
  ]
    .filter((value) => value.length > 0)
    .join('');

  const body =
    options.comparison === null || options.comparison === undefined
      ? '<p class="empty-state">Choose a comparison target from the list or use the previous-session shortcut.</p>'
      : `<p class="inline-note">Comparing against ${escapeHtml(
          options.comparison.compareSessionId,
        )} (${escapeHtml(options.comparison.mode)} mode).</p>
      <div class="table-wrapper"><table>
        <thead><tr><th>field</th><th>current</th><th>comparison</th></tr></thead>
        <tbody>${options.comparison.diff.changes
          .map(
            (change) =>
              `<tr><td>${escapeHtml(change.label)}</td><td><pre>${escapeHtml(change.right)}</pre></td><td><pre>${escapeHtml(change.left)}</pre></td></tr>`,
          )
          .join('')}</tbody>
      </table></div>`;

  return `<section class="panel">
    <div class="section-heading">
      <h3>Session diff</h3>
      <p>Compare the current capture against the previous run or another selected session.</p>
    </div>
    <div class="detail-actions">${actions}</div>
    ${body}
  </section>`;
};
