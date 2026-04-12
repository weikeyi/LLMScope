import type { Session, SessionReplayFormat } from '@llmscope/shared-types';

export type ReplayFormat = SessionReplayFormat;

export interface ReplayRequest {
  format: ReplayFormat;
}

type JsonRecord = Record<string, unknown>;

const getJsonBody = (session: Session): JsonRecord => {
  return session.request.bodyJson !== undefined &&
    session.request.bodyJson !== null &&
    typeof session.request.bodyJson === 'object' &&
    !Array.isArray(session.request.bodyJson)
    ? (session.request.bodyJson as JsonRecord)
    : {};
};

const getProvider = (session: Session): string => {
  return session.normalized?.provider ?? session.routing.matchedProvider ?? 'generic';
};

const toSecretVariable = (session: Session): string => {
  return getProvider(session) === 'anthropic'
    ? 'ANTHROPIC_API_KEY'
    : 'OPENAI_API_KEY';
};

const escapeJsString = (value: string): string => {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
};

const renderJsValue = (value: unknown, indent = 0): string => {
  const spacing = ' '.repeat(indent);
  const nextSpacing = ' '.repeat(indent + 2);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    return `[\n${value
      .map((item) => `${nextSpacing}${renderJsValue(item, indent + 2)},`)
      .join('\n')}\n${spacing}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return '{}';
    }

    return `{\n${entries
      .map(([key, item]) => `${nextSpacing}${key}: ${renderJsValue(item, indent + 2)},`)
      .join('\n')}\n${spacing}}`;
  }

  if (typeof value === 'string') {
    return `'${escapeJsString(value)}'`;
  }

  return String(value);
};

const renderCurlHeaders = (session: Session): string[] => {
  const headers: string[] = [];
  const provider = getProvider(session);
  const contentType = session.request.contentType ?? 'application/json';

  headers.push(`--header 'content-type: ${contentType}'`);

  if (provider === 'anthropic') {
    headers.push(`--header 'x-api-key: $${toSecretVariable(session)}'`);
    const version = session.request.headers['anthropic-version'];

    if (typeof version === 'string' && version.length > 0) {
      headers.push(`--header 'anthropic-version: ${version}'`);
    }
  } else {
    headers.push(`--header 'authorization: Bearer $${toSecretVariable(session)}'`);
  }

  return headers;
};

const renderFetchHeaders = (session: Session): string => {
  const provider = getProvider(session);
  const lines = [`'content-type': '${session.request.contentType ?? 'application/json'}',`];

  if (provider === 'anthropic') {
    lines.push(`'x-api-key': process.env.${toSecretVariable(session)},`);
    const version = session.request.headers['anthropic-version'];

    if (typeof version === 'string' && version.length > 0) {
      lines.push(`'anthropic-version': '${version}',`);
    }
  } else {
    lines.push(
      `authorization: 'Bearer ' + process.env.${toSecretVariable(session)},`,
    );
  }

  return lines.map((line) => `    ${line}`).join('\n');
};

const renderCurl = (session: Session): string => {
  const headers = renderCurlHeaders(session)
    .map((header) => `  ${header} \\`)
    .join('\n');
  const body = JSON.stringify(getJsonBody(session), null, 2);

  return `curl ${session.transport.url} \\
${headers}
  --data '${body}'`;
};

const renderFetch = (session: Session): string => {
  const body = renderJsValue(getJsonBody(session), 4);

  return `await fetch('${session.transport.url}', {
  method: '${session.transport.method}',
  headers: {
${renderFetchHeaders(session)}
  },
  body: JSON.stringify(${body}),
});`;
};

const renderOpenAiSdk = (session: Session): string => {
  const body = renderJsValue(getJsonBody(session), 2);

  return `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await client.chat.completions.create(${body});

console.log(response);`;
};

const renderAnthropicSdk = (session: Session): string => {
  const body = renderJsValue(getJsonBody(session), 2);

  return `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const response = await client.messages.create(${body});

console.log(response);`;
};

export const generateReplay = (
  session: Session,
  request: ReplayRequest,
): string => {
  if (request.format === 'curl') {
    return renderCurl(session);
  }

  if (request.format === 'fetch') {
    return renderFetch(session);
  }

  if (request.format === 'openai') {
    return renderOpenAiSdk(session);
  }

  return renderAnthropicSdk(session);
};
