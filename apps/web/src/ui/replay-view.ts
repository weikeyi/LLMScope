import type { ObservationPageData } from '../types.js';
import { escapeHtml } from './shared.js';

export const renderReplayView = (
  replayArtifacts: ObservationPageData['replayArtifacts'],
): string => {
  if (replayArtifacts === undefined || replayArtifacts.length === 0) {
    return '';
  }

  return `<section class="panel">
    <div class="section-heading">
      <h3>Replay snippets</h3>
      <p>Generate safe code samples from the captured request without reusing captured secrets.</p>
    </div>
    <div class="replay-grid">${replayArtifacts
      .map(
        (artifact) => `<article class="replay-card">
          <header><strong>${escapeHtml(artifact.label)}</strong></header>
          <pre>${escapeHtml(artifact.content)}</pre>
        </article>`,
      )
      .join('')}</div>
  </section>`;
};
