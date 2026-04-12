import type {
  CanonicalMessage,
  CanonicalPart,
  CanonicalStreamEvent,
  RawHttpMessage,
  Session,
} from '@llmscope/shared-types';

import { renderDetailActions } from './actions.js';
import {
  escapeHtml,
  formatDateTime,
  formatDuration,
  formatJson,
  formatStatusCode,
  getStatusTone,
  renderBadge,
  renderDefinitionList,
  renderErrorPanel,
} from './shared.js';

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
        formatJson({
          toolCallId: part.toolCallId,
          name: part.name,
          content: part.content,
        }),
      )}</pre></div>`;
    default:
      return `<div class="message-part"><span class="part-label">unknown</span><pre>${escapeHtml(
        formatJson(part.value),
      )}</pre></div>`;
  }
};

const renderCanonicalMessage = (
  message: CanonicalMessage,
  index: number,
): string => {
  return `<article class="message-card">
    <header>
      <strong>${escapeHtml(`message ${index + 1}`)}</strong>
      <span>${escapeHtml(message.role)}</span>
    </header>
    <div class="message-parts">${message.parts.map(renderMessagePart).join('')}</div>
  </article>`;
};

const renderRawHttpMessage = (
  title: string,
  message: RawHttpMessage | undefined,
): string => {
  if (message === undefined) {
    return `<section class="panel"><h3>${escapeHtml(title)}</h3><p class="empty-state">Not captured.</p></section>`;
  }

  const sections: string[] = [
    renderDefinitionList([
      ['content type', message.contentType ?? '-'],
      [
        'size',
        message.sizeBytes === undefined ? '-' : `${message.sizeBytes} bytes`,
      ],
      ['binary', message.isBinary === true ? 'yes' : 'no'],
      ['truncated', message.truncated === true ? 'yes' : 'no'],
      ['sha256', message.sha256 ?? '-'],
    ]),
  ];

  if (message.bodyJson !== undefined) {
    sections.push(
      `<div><h4>Body JSON</h4><pre>${escapeHtml(formatJson(message.bodyJson))}</pre></div>`,
    );
  } else if (message.bodyText !== undefined) {
    sections.push(
      `<div><h4>Body text</h4><pre>${escapeHtml(message.bodyText)}</pre></div>`,
    );
  }

  sections.push(
    `<div><h4>Headers</h4><pre>${escapeHtml(formatJson(message.headers))}</pre></div>`,
  );

  return `<section class="panel"><h3>${escapeHtml(title)}</h3>${sections.join('')}</section>`;
};

const renderStreamEvents = (
  events: CanonicalStreamEvent[] | undefined,
): string => {
  if (events === undefined || events.length === 0) {
    return `<section class="panel"><h3>Stream events</h3><p class="empty-state">No stream events captured.</p></section>`;
  }

  return `<section class="panel"><h3>Stream events</h3><div class="table-wrapper"><table>
    <thead><tr><th>time</th><th>type</th><th>payload</th></tr></thead>
    <tbody>${events
      .map((event) => {
        const payload =
          event.normalized ?? event.rawJson ?? event.rawLine ?? '-';
        return `<tr><td>${escapeHtml(formatDateTime(new Date(event.ts).toISOString()))}</td><td>${escapeHtml(
          event.eventType,
        )}</td><td><pre>${escapeHtml(typeof payload === 'string' ? payload : formatJson(payload))}</pre></td></tr>`;
      })
      .join('')}</tbody>
  </table></div></section>`;
};

export const renderSelectedSession = (session: Session | null): string => {
  if (session === null) {
    return `<section class="panel detail-empty"><h2>Session detail</h2><p class="empty-state">Select a session to inspect transport, normalized data, and raw payloads.</p></section>`;
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

    if (
      session.normalized.warnings !== undefined &&
      session.normalized.warnings.length > 0
    ) {
      normalizedSections.push(
        `<div><h4>Normalization warnings</h4><ul>${session.normalized.warnings
          .map((warning) => `<li>${escapeHtml(warning)}</li>`)
          .join('')}</ul></div>`,
      );
    }
  }

  return `<section class="detail-column">
    <section class="panel detail-header">
      <div class="detail-header-topline">
        <div>
          <h2>${escapeHtml(`${session.transport.method} ${session.transport.path}`)}</h2>
          <p class="session-id">${escapeHtml(session.id)}</p>
        </div>
        ${renderDetailActions(session.id)}
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
    ${renderErrorPanel(session.error)}
    <section class="panel"><h3>Normalized exchange</h3>${normalizedSections.length > 0 ? normalizedSections.join('') : '<p class="empty-state">No normalized exchange available.</p>'}</section>
    ${renderRawHttpMessage('Request', session.request)}
    ${renderRawHttpMessage('Response', session.response)}
    ${renderStreamEvents(session.streamEvents)}
  </section>`;
};

