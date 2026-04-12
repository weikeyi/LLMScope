import type { ObservationPageData } from '../types.js';
import { renderFilterBar } from './filters.js';
import { renderClientScript } from './live-store.js';
import { renderSelectedSession } from './session-detail.js';
import { renderSessionList } from './session-list.js';
import { escapeHtml } from './shared.js';

export interface ObservationFragmentPayload {
  errorHtml: string;
  selectedSessionId: string | null;
  sessionDetailHtml: string;
  sessionListHtml: string;
  state: {
    apiBaseUrl: string;
    filters: ObservationPageData['filters'];
    selectedSessionId: string | null;
  };
}

export const renderObservationFragments = (
  data: ObservationPageData,
): ObservationFragmentPayload => {
  return {
    errorHtml:
      data.error === undefined
        ? ''
        : `<div class="page-error">${escapeHtml(data.error)}</div>`,
    selectedSessionId: data.selectedSessionId,
    sessionListHtml: renderSessionList(
      data.sessions,
      data.filters,
      data.selectedSessionId,
      data.error,
    ),
    sessionDetailHtml: renderSelectedSession(data.selectedSession),
    state: {
      apiBaseUrl: data.apiBaseUrl,
      filters: data.filters,
      selectedSessionId: data.selectedSessionId,
    },
  };
};

export const renderObservationPage = (data: ObservationPageData): string => {
  const fragments = renderObservationFragments(data);
  const state = JSON.stringify(fragments.state);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LLMScope Observation UI</title>
    <style>
      :root {
        color-scheme: light;
        --bg-canvas: #eef3f9;
        --bg-panel: #fbfdff;
        --bg-panel-strong: #f4f8fc;
        --bg-accent: #0f5ec9;
        --bg-accent-soft: #e7f0ff;
        --bg-danger-soft: #fff1f1;
        --text-strong: #162335;
        --text-muted: #5c6b80;
        --line-soft: #d4dfeb;
        --line-strong: #99b6d9;
        --shadow: 0 18px 40px rgba(22, 35, 53, 0.08);
        font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top right, rgba(15, 94, 201, 0.12), transparent 28%),
          linear-gradient(180deg, #f7fbff 0%, var(--bg-canvas) 100%);
        color: var(--text-strong);
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: transparent;
        color: var(--text-strong);
      }
      main {
        max-width: 1600px;
        margin: 0 auto;
        padding: 28px;
      }
      h1, h2, h3, h4, p {
        margin-top: 0;
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
        margin-bottom: 24px;
      }
      .page-header p,
      .section-heading p,
      .action-panel-header p,
      .page-meta,
      .empty-state,
      .inline-note,
      .page-error,
      .session-row-meta,
      .session-row-timestamp,
      .session-id {
        color: var(--text-muted);
      }
      .layout {
        display: grid;
        grid-template-columns: 400px minmax(0, 1fr);
        gap: 24px;
        align-items: start;
      }
      .panel {
        background: rgba(251, 253, 255, 0.92);
        border: 1px solid var(--line-soft);
        border-radius: 20px;
        padding: 20px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }
      .filters-panel,
      .action-panel {
        margin-bottom: 16px;
      }
      .section-heading,
      .action-panel-header {
        margin-bottom: 14px;
      }
      .sidebar {
        position: sticky;
        top: 24px;
      }
      .filters-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .filters-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .filter-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 14px;
      }
      .compact-field {
        flex: 1 1 180px;
      }
      .filter-field input,
      .filter-field select {
        border: 1px solid var(--line-soft);
        border-radius: 12px;
        padding: 10px 12px;
        font: inherit;
        color: inherit;
        background: #fff;
      }
      .filter-actions,
      .toolbar,
      .export-toolbar,
      .detail-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
      }
      .export-toolbar {
        margin-top: 16px;
      }
      .primary-action,
      .secondary-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 10px 16px;
        font: inherit;
        text-decoration: none;
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
      }
      .primary-action {
        border: 0;
        background: var(--bg-accent);
        color: #fff;
        cursor: pointer;
        box-shadow: 0 10px 18px rgba(15, 94, 201, 0.18);
      }
      .secondary-action {
        border: 1px solid var(--line-soft);
        color: var(--text-strong);
        background: #fff;
        cursor: pointer;
      }
      .danger-action {
        border-color: #efc5c5;
        background: var(--bg-danger-soft);
      }
      .primary-action:hover,
      .secondary-action:hover,
      .session-row:hover {
        transform: translateY(-1px);
      }
      .subtle-link {
        margin-top: 12px;
      }
      .session-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .session-row {
        display: block;
        width: 100%;
        border: 1px solid var(--line-soft);
        background: var(--bg-panel-strong);
        border-radius: 16px;
        padding: 14px;
        text-align: left;
        text-decoration: none;
        color: inherit;
        transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
      }
      .session-row-selected {
        border-color: var(--line-strong);
        background: var(--bg-accent-soft);
      }
      .session-row-header,
      .session-row-meta,
      .detail-header-topline {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .session-row-header {
        align-items: center;
        margin-bottom: 8px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
      }
      .badge-neutral {
        background: #e8eef8;
        color: #2f4b6c;
      }
      .badge-success {
        background: #e4f6ea;
        color: #146c2e;
      }
      .badge-warning {
        background: #fff1d6;
        color: #8f5a00;
      }
      .badge-danger {
        background: #fde7e7;
        color: #a12020;
      }
      .empty-state-card {
        padding: 18px;
        border-radius: 16px;
        background: linear-gradient(180deg, #fff 0%, #f4f8fc 100%);
        border: 1px dashed var(--line-strong);
      }
      .detail-column {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .detail-header {
        display: grid;
        gap: 16px;
      }
      .detail-header-badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .meta-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin: 0;
      }
      .meta-list div {
        padding: 12px;
        border-radius: 14px;
        background: var(--bg-panel-strong);
      }
      .meta-list dt {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
        margin-bottom: 4px;
      }
      .meta-list dd {
        margin: 0;
        word-break: break-word;
      }
      .message-card {
        border: 1px solid var(--line-soft);
        border-radius: 16px;
        padding: 14px;
        background: var(--bg-panel-strong);
      }
      .message-card header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .message-parts {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .message-part,
      pre {
        margin: 0;
      }
      .part-label {
        display: inline-block;
        margin-bottom: 6px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
      }
      pre {
        overflow-x: auto;
        padding: 12px;
        border-radius: 14px;
        background: #0f1724;
        color: #eef4ff;
        font-size: 13px;
        line-height: 1.5;
      }
      .table-wrapper {
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        padding: 12px;
        border-bottom: 1px solid var(--line-soft);
        text-align: left;
        vertical-align: top;
      }
      thead th {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
      }
      .page-error {
        margin-bottom: 16px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid #f0b9b9;
        background: #fff5f5;
      }
      .page-loading {
        display: none;
        margin-bottom: 16px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid #b7d0f3;
        background: #eef5ff;
        color: var(--bg-accent);
      }
      body[data-loading='true'] .page-loading {
        display: block;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      @media (max-width: 1080px) {
        main {
          padding: 18px;
        }
        .layout {
          grid-template-columns: 1fr;
        }
        .sidebar {
          position: static;
        }
        .detail-header-topline {
          flex-direction: column;
        }
      }
      @media (max-width: 720px) {
        .filters-grid {
          grid-template-columns: 1fr;
        }
        .page-header {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="page-header">
        <div>
          <h1>LLMScope observation UI</h1>
          <p>Inspect, filter, export, and trim captured sessions from one operator view.</p>
        </div>
        <div class="page-meta">API base: ${escapeHtml(data.apiBaseUrl)}</div>
      </header>
      <div class="page-loading" role="status">Loading observation UI...</div>
      <div data-page-error-root="true">${fragments.errorHtml}</div>
      <section class="layout">
        <aside class="sidebar">
          ${renderFilterBar(data.filters, data.sessions, data.selectedSessionId)}
          <section class="panel">
            <h2>Sessions</h2>
            <div data-session-list-root="true">${fragments.sessionListHtml}</div>
          </section>
        </aside>
        <div data-session-detail-root="true">${fragments.sessionDetailHtml}</div>
      </section>
    </main>
    <script type="application/json" id="llmscope-observation-state">${escapeHtml(state)}</script>
    <script>${renderClientScript()}</script>
  </body>
</html>`;
};
