import type {
  CanonicalMessage,
  CanonicalPart,
  CanonicalStreamEvent,
  InspectorError,
  RawHttpMessage,
  Session,
  SessionStatus,
  SessionSummary,
} from '@llmscope/shared-types';

export interface ObservationUiOptions {
  apiBaseUrl: string;
  selectedSessionId?: string;
  status?: SessionStatus;
  provider?: string;
  model?: string;
  search?: string;
  limit?: number;
}

export interface ObservationPageData {
  apiBaseUrl: string;
  filters: ObservationFilters;
  selectedSessionId: string | null;
  sessions: SessionSummary[];
  selectedSession: Session | null;
  error?: string;
}

export interface ObservationFilters {
  status?: SessionStatus;
  provider?: string;
  model?: string;
  search?: string;
  limit: number;
}

const DEFAULT_LIMIT = 25;
const STATUS_OPTIONS: SessionStatus[] = ['pending', 'streaming', 'completed', 'error'];

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

const formatDateTime = (value: string | undefined): string => {
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

const formatDuration = (durationMs: number | undefined): string => {
  if (durationMs === undefined) {
    return '-';
  }

  return `${durationMs} ms`;
};

const formatStatusCode = (statusCode: number | undefined, errorCode: string | undefined): string => {
  if (statusCode !== undefined) {
    return String(statusCode);
  }

  if (errorCode !== undefined) {
    return errorCode;
  }

  return '-';
};

const formatJson = (value: unknown): string => {
  return JSON.stringify(value, null, 2) ?? '';
};

const renderDefinitionList = (entries: Array<[label: string, value: string]>): string => {
  return `<dl class="meta-list">${entries
    .map(
      ([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('')}</dl>`;
};

const renderBadge = (label: string, tone: 'neutral' | 'success' | 'warning' | 'danger'): string => {
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
};

const getStatusTone = (status: SessionStatus): 'neutral' | 'success' | 'warning' | 'danger' => {
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

const renderSessionRow = (session: SessionSummary, selectedSessionId: string | undefined): string => {
  const isSelected = session.id === selectedSessionId;
  const rowClassName = isSelected ? 'session-row session-row-selected' : 'session-row';
  const title = `${session.method} ${session.path}`;
  const model = session.model ?? '-';
  const provider = session.provider ?? '-';
  const statusCode = formatStatusCode(session.statusCode, session.errorCode);

  return `<li><button class="${rowClassName}" data-session-id="${escapeHtml(session.id)}" type="button">
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
  </button></li>`;
};

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

const renderTextFilter = (name: string, value: string | undefined, placeholder: string): string => {
  return `<label class="filter-field"><span>${escapeHtml(name)}</span><input data-filter-name="${escapeHtml(
    name,
  )}" name="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}" type="text" value="${escapeHtml(
    value ?? '',
  )}" /></label>`;
};

const renderFilterBar = (filters: ObservationFilters, sessions: SessionSummary[]): string => {
  const providerOptions = [
    ...new Set(
      sessions
        .map((session) => session.provider)
        .filter((provider): provider is string => provider !== undefined),
    ),
  ].sort();
  const modelOptions = [
    ...new Set(
      sessions.map((session) => session.model).filter((model): model is string => model !== undefined),
    ),
  ].sort();

  return `<section class="panel filters-panel">
    <h2>Filters</h2>
    <div class="filters-grid">
      ${renderFilterSelect('status', STATUS_OPTIONS, filters.status, 'All statuses')}
      ${renderFilterSelect('provider', providerOptions, filters.provider, 'All providers')}
      ${renderFilterSelect('model', modelOptions, filters.model, 'All models')}
      ${renderTextFilter('search', filters.search, 'session id, path, model')}
      <label class="filter-field"><span>limit</span><input data-filter-name="limit" min="1" name="limit" type="number" value="${filters.limit}" /></label>
    </div>
  </section>`;
};

const renderMessagePart = (part: CanonicalPart): string => {
  switch (part.type) {
    case 'text':
      return `<div class="message-part"><span class="part-label">text</span><pre>${escapeHtml(part.text)}</pre></div>`;
    case 'json':
      return `<div class="message-part"><span class="part-label">json</span><pre>${escapeHtml(formatJson(part.value))}</pre></div>`;
    case 'image_url':
      return `<div class="message-part"><span class="part-label">image</span><pre>${escapeHtml(part.url ?? '-')}</pre></div>`;
    case 'tool_call':
      return `<div class="message-part"><span class="part-label">tool call</span><pre>${escapeHtml(
        formatJson({ id: part.id, name: part.name, arguments: part.arguments }),
      )}</pre></div>`;
    case 'tool_result':
      return `<div class="message-part"><span class="part-label">tool result</span><pre>${escapeHtml(
        formatJson({ toolCallId: part.toolCallId, name: part.name, content: part.content }),
      )}</pre></div>`;
    default:
      return `<div class="message-part"><span class="part-label">unknown</span><pre>${escapeHtml(
        formatJson(part.value),
      )}</pre></div>`;
  }
};

const renderCanonicalMessage = (message: CanonicalMessage, index: number): string => {
  return `<article class="message-card">
    <header>
      <strong>${escapeHtml(`message ${index + 1}`)}</strong>
      <span>${escapeHtml(message.role)}</span>
    </header>
    <div class="message-parts">${message.parts.map(renderMessagePart).join('')}</div>
  </article>`;
};

const renderRawHttpMessage = (title: string, message: RawHttpMessage | undefined): string => {
  if (message === undefined) {
    return `<section class="panel"><h3>${escapeHtml(title)}</h3><p class="empty-state">Not captured.</p></section>`;
  }

  const sections: string[] = [
    renderDefinitionList([
      ['content type', message.contentType ?? '-'],
      ['size', message.sizeBytes === undefined ? '-' : `${message.sizeBytes} bytes`],
      ['binary', message.isBinary === true ? 'yes' : 'no'],
      ['truncated', message.truncated === true ? 'yes' : 'no'],
      ['sha256', message.sha256 ?? '-'],
    ]),
  ];

  if (message.bodyJson !== undefined) {
    sections.push(`<div><h4>Body JSON</h4><pre>${escapeHtml(formatJson(message.bodyJson))}</pre></div>`);
  } else if (message.bodyText !== undefined) {
    sections.push(`<div><h4>Body text</h4><pre>${escapeHtml(message.bodyText)}</pre></div>`);
  }

  sections.push(`<div><h4>Headers</h4><pre>${escapeHtml(formatJson(message.headers))}</pre></div>`);

  return `<section class="panel"><h3>${escapeHtml(title)}</h3>${sections.join('')}</section>`;
};

const renderStreamEvents = (events: CanonicalStreamEvent[] | undefined): string => {
  if (events === undefined || events.length === 0) {
    return `<section class="panel"><h3>Stream events</h3><p class="empty-state">No stream events captured.</p></section>`;
  }

  return `<section class="panel"><h3>Stream events</h3><div class="table-wrapper"><table>
    <thead><tr><th>time</th><th>type</th><th>payload</th></tr></thead>
    <tbody>${events
      .map((event) => {
        const payload = event.normalized ?? event.rawJson ?? event.rawLine ?? '-';
        return `<tr><td>${escapeHtml(formatDateTime(new Date(event.ts).toISOString()))}</td><td>${escapeHtml(
          event.eventType,
        )}</td><td><pre>${escapeHtml(typeof payload === 'string' ? payload : formatJson(payload))}</pre></td></tr>`;
      })
      .join('')}</tbody>
  </table></div></section>`;
};

const renderError = (error: InspectorError | undefined): string => {
  if (error === undefined) {
    return '';
  }

  return `<section class="panel"><h3>Error</h3>${renderDefinitionList([
    ['code', error.code],
    ['phase', error.phase],
    ['message', error.message],
  ])}${error.details === undefined ? '' : `<div><h4>Details</h4><pre>${escapeHtml(formatJson(error.details))}</pre></div>`}</section>`;
};

const renderSelectedSession = (session: Session | null): string => {
  if (session === null) {
    return `<section class="panel detail-empty"><h2>Session detail</h2><p class="empty-state">Select a session to inspect transport, normalized data, and payload details.</p></section>`;
  }

  const normalizedSections: string[] = [];
  if (session.normalized !== undefined) {
    normalizedSections.push(
      renderDefinitionList([
        ['provider', session.normalized.provider],
        ['api style', session.normalized.apiStyle],
        ['model', session.normalized.model ?? '-'],
        ['stream', session.normalized.stream === true ? 'yes' : 'no'],
        ['temperature', session.normalized.temperature?.toString() ?? '-'],
        ['topP', session.normalized.topP?.toString() ?? '-'],
        ['max tokens', session.normalized.maxTokens?.toString() ?? '-'],
      ]),
    );

    if ((session.normalized.instructions?.length ?? 0) > 0) {
      normalizedSections.push(
        `<div><h4>Instructions</h4>${session.normalized.instructions?.map(renderCanonicalMessage).join('')}</div>`,
      );
    }

    if ((session.normalized.inputMessages?.length ?? 0) > 0) {
      normalizedSections.push(
        `<div><h4>Input messages</h4>${session.normalized.inputMessages?.map(renderCanonicalMessage).join('')}</div>`,
      );
    }

    if (session.normalized.output !== undefined) {
      normalizedSections.push(
        `<div><h4>Output</h4><pre>${escapeHtml(formatJson(session.normalized.output))}</pre></div>`,
      );
    }

    if (session.normalized.usage !== undefined) {
      normalizedSections.push(
        `<div><h4>Usage</h4><pre>${escapeHtml(formatJson(session.normalized.usage))}</pre></div>`,
      );
    }

    if (session.normalized.warnings !== undefined && session.normalized.warnings.length > 0) {
      normalizedSections.push(
        `<div><h4>Normalization warnings</h4><ul>${session.normalized.warnings
          .map((warning) => `<li>${escapeHtml(warning)}</li>`)
          .join('')}</ul></div>`,
      );
    }
  }

  return `<section class="detail-column">
    <section class="panel detail-header">
      <div>
        <h2>${escapeHtml(`${session.transport.method} ${session.transport.path}`)}</h2>
        <p class="session-id">${escapeHtml(session.id)}</p>
      </div>
      <div class="detail-header-badges">
        ${renderBadge(session.status, getStatusTone(session.status))}
        ${renderBadge(formatStatusCode(session.transport.statusCode, session.error?.code), 'neutral')}
      </div>
      ${renderDefinitionList([
        ['started', formatDateTime(session.startedAt)],
        ['ended', formatDateTime(session.endedAt)],
        ['duration', formatDuration(session.transport.durationMs)],
        ['provider', session.normalized?.provider ?? '-'],
        ['model', session.normalized?.model ?? '-'],
        ['route', session.routing.routeId ?? '-'],
        ['matched endpoint', session.routing.matchedEndpoint ?? '-'],
        ['host', session.transport.host],
        ['url', session.transport.url],
      ])}
    </section>
    ${renderError(session.error)}
    <section class="panel"><h3>Normalized exchange</h3>${normalizedSections.length > 0 ? normalizedSections.join('') : '<p class="empty-state">No normalized exchange available.</p>'}</section>
    ${renderRawHttpMessage('Request', session.request)}
    ${renderRawHttpMessage('Response', session.response)}
    ${renderStreamEvents(session.streamEvents)}
  </section>`;
};

export const renderObservationPage = (data: ObservationPageData): string => {
  const sessionItems =
    data.sessions.length > 0
      ? `<ul class="session-list">${data.sessions
          .map((session) => renderSessionRow(session, data.selectedSessionId ?? undefined))
          .join('')}</ul>`
      : '<p class="empty-state">No sessions match the current filters.</p>';

  const state = JSON.stringify({
    apiBaseUrl: data.apiBaseUrl,
    filters: data.filters,
    selectedSessionId: data.selectedSessionId,
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LLMScope Observation UI</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, system-ui, sans-serif;
        background: #f4f7fb;
        color: #102033;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: #f4f7fb;
        color: #102033;
      }
      main {
        max-width: 1600px;
        margin: 0 auto;
        padding: 24px;
      }
      h1, h2, h3, h4, p {
        margin-top: 0;
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 24px;
      }
      .page-header p {
        max-width: 720px;
        color: #42536b;
      }
      .layout {
        display: grid;
        grid-template-columns: 380px minmax(0, 1fr);
        gap: 24px;
        align-items: start;
      }
      .panel {
        background: #ffffff;
        border: 1px solid #d6e1ee;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 10px 30px rgba(16, 32, 51, 0.06);
      }
      .filters-panel {
        margin-bottom: 16px;
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
        color: #42536b;
      }
      .filter-field input,
      .filter-field select {
        border: 1px solid #c5d3e3;
        border-radius: 10px;
        padding: 10px 12px;
        font: inherit;
        color: inherit;
        background: #fff;
      }
      .sidebar {
        position: sticky;
        top: 24px;
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
        width: 100%;
        border: 1px solid #d6e1ee;
        background: #f8fbff;
        border-radius: 14px;
        padding: 14px;
        text-align: left;
        cursor: pointer;
        transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
      }
      .session-row:hover {
        border-color: #8bb4f7;
        box-shadow: 0 6px 16px rgba(35, 94, 181, 0.12);
        transform: translateY(-1px);
      }
      .session-row-selected {
        border-color: #235eb5;
        background: #edf4ff;
      }
      .session-row-header,
      .session-row-meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .session-row-header {
        align-items: center;
        margin-bottom: 8px;
      }
      .session-row-meta,
      .session-row-timestamp,
      .session-id,
      .empty-state,
      .page-error,
      .page-meta {
        color: #5a6f88;
        font-size: 14px;
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
        border-radius: 12px;
        background: #f8fbff;
      }
      .meta-list dt {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #5a6f88;
        margin-bottom: 4px;
      }
      .meta-list dd {
        margin: 0;
        word-break: break-word;
      }
      .message-card {
        border: 1px solid #d6e1ee;
        border-radius: 14px;
        padding: 14px;
        background: #f8fbff;
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
        color: #5a6f88;
      }
      pre {
        overflow-x: auto;
        padding: 12px;
        border-radius: 12px;
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
        border-bottom: 1px solid #d6e1ee;
        text-align: left;
        vertical-align: top;
      }
      thead th {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #5a6f88;
      }
      .page-error {
        margin-bottom: 16px;
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid #f0b9b9;
        background: #fff3f3;
        color: #8a1d1d;
      }
      @media (max-width: 1080px) {
        .layout {
          grid-template-columns: 1fr;
        }
        .sidebar {
          position: static;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="page-header">
        <div>
          <h1>LLMScope observation UI</h1>
          <p>Read-only observation surface for captured sessions. Browse normalized exchanges, transport metadata, warnings, and raw payloads without reaching into the storage layer directly.</p>
        </div>
        <div class="page-meta">API base: ${escapeHtml(data.apiBaseUrl)}</div>
      </header>
      ${data.error === undefined ? '' : `<div class="page-error">${escapeHtml(data.error)}</div>`}
      <section class="layout">
        <aside class="sidebar">
          ${renderFilterBar(data.filters, data.sessions)}
          <section class="panel">
            <h2>Sessions</h2>
            ${sessionItems}
          </section>
        </aside>
        ${renderSelectedSession(data.selectedSession)}
      </section>
    </main>
    <script type="application/json" id="llmscope-observation-state">${escapeHtml(state)}</script>
  </body>
</html>`;
};

const toPositiveInteger = (value: number | undefined): number => {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    return DEFAULT_LIMIT;
  }

  return value;
};

export const toObservationFilters = (options: ObservationUiOptions): ObservationFilters => {
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

const toSessionsUrl = (filters: ObservationFilters, apiBaseUrl: string): string => {
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

const loadSessionDetail = async (apiBaseUrl: string, sessionId: string): Promise<Session | null> => {
  const response = await fetch(new URL(`/api/sessions/${sessionId}`, apiBaseUrl));

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Observation API returned ${response.status} while loading session ${sessionId}.`);
  }

  return parseJsonResponse<Session>(response);
};

export const loadObservationPageData = async (
  options: ObservationUiOptions,
): Promise<ObservationPageData> => {
  const filters = toObservationFilters(options);
  const sessionsResponse = await fetch(toSessionsUrl(filters, options.apiBaseUrl));

  if (!sessionsResponse.ok) {
    throw new Error(`Observation API returned ${sessionsResponse.status} while loading sessions.`);
  }

  const sessions = await parseJsonResponse<SessionSummary[]>(sessionsResponse);
  const selectedSessionId = options.selectedSessionId ?? sessions[0]?.id ?? null;
  const selectedSession =
    selectedSessionId === null ? null : await loadSessionDetail(options.apiBaseUrl, selectedSessionId);

  const error =
    selectedSessionId !== null && selectedSession === null
      ? `Session ${selectedSessionId} was not found in the observation API.`
      : undefined;

  const data: ObservationPageData = {
    apiBaseUrl: options.apiBaseUrl,
    filters,
    selectedSessionId,
    sessions,
    selectedSession,
  };

  if (error !== undefined) {
    data.error = error;
  }

  return data;
};
