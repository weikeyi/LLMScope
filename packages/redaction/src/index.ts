import type { ResolvedPrivacyConfig } from '@llmscope/config';
import type { CanonicalStreamEvent, RawHttpMessage } from '@llmscope/shared-types';

export interface PrivacyPolicy {
  redactSensitiveText: boolean;
  redactImages: boolean;
}

export const REDACTED_TEXT = '[redacted]';
export const REDACTED_IMAGE_URL = 'data:,redacted';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

const STRICT_TEXT_PATH_SEGMENTS = new Set([
  'content',
  'text',
  'input',
  'instructions',
  'system',
  'prompt',
  'output_text',
  'delta',
  'arguments',
  'contenttext',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const cloneValue = <T>(value: T): T => structuredClone(value);

const isSensitivePath = (path: string[]): boolean => {
  const normalizedPath = path.map((segment) => segment.toLowerCase());

  if (normalizedPath.length === 0) {
    return false;
  }

  const last = normalizedPath.at(-1);
  if (last === undefined) {
    return false;
  }

  if (SENSITIVE_HEADERS.has(last) || last === 'authorization') {
    return true;
  }

  return normalizedPath.some((segment) => {
    return (
      segment.includes('authorization') ||
      segment.includes('api_key') ||
      segment.includes('apikey') ||
      segment.includes('token') ||
      segment.includes('secret') ||
      segment.includes('password')
    );
  });
};

const shouldRedactStrictText = (path: string[]): boolean => {
  return path.some((segment) =>
    STRICT_TEXT_PATH_SEGMENTS.has(segment.toLowerCase()),
  );
};

const applyRedactionReplacement = (
  value: unknown,
  replacement: unknown,
): unknown => {
  if (value === undefined) {
    return value;
  }

  return replacement;
};

const redactValue = (
  value: unknown,
  path: string[],
  policy: PrivacyPolicy,
  warnings: string[],
): unknown => {
  if (typeof value === 'string') {
    if (policy.redactSensitiveText && isSensitivePath(path)) {
      warnings.push(`Redacted sensitive field at ${path.join('.')}.`);
      return applyRedactionReplacement(value, REDACTED_TEXT);
    }

    if (policy.redactSensitiveText && shouldRedactStrictText(path)) {
      warnings.push(`Redacted text field at ${path.join('.')}.`);
      return applyRedactionReplacement(value, REDACTED_TEXT);
    }

    if (
      policy.redactImages &&
      path.at(-1)?.toLowerCase() === 'url' &&
      path.includes('image_url')
    ) {
      warnings.push(`Redacted image URL at ${path.join('.')}.`);
      return applyRedactionReplacement(value, REDACTED_IMAGE_URL);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      redactValue(entry, [...path, String(index)], policy, warnings),
    );
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactValue(entry, [...path, key], policy, warnings),
      ]),
    );
  }

  return value;
};

const redactHeaders = (
  headers: Record<string, string | string[]>,
  policy: PrivacyPolicy,
  warnings: string[],
): Record<string, string | string[]> => {
  if (!policy.redactSensitiveText) {
    return headers;
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      if (!isSensitivePath([key])) {
        return [key, value];
      }

      warnings.push(`Redacted sensitive header ${key}.`);
      return [
        key,
        Array.isArray(value) ? value.map(() => REDACTED_TEXT) : REDACTED_TEXT,
      ];
    }),
  );
};

export const toPrivacyPolicy = (
  privacy?: ResolvedPrivacyConfig,
): PrivacyPolicy => {
  switch (privacy?.mode) {
    case 'strict':
      return {
        redactSensitiveText: true,
        redactImages: true,
      };
    case 'off':
      return {
        redactSensitiveText: false,
        redactImages: false,
      };
    case 'balanced':
    default:
      return {
        redactSensitiveText: false,
        redactImages: false,
      };
  }
};

export const redactMessage = (
  message: RawHttpMessage,
  target: 'request' | 'response',
  policy: PrivacyPolicy,
): { message: RawHttpMessage; warnings?: string[] } => {
  const warnings: string[] = [];
  const nextMessage: RawHttpMessage = {
    ...message,
    headers: redactHeaders(message.headers, policy, warnings),
  };

  if (
    message.bodyText !== undefined &&
    policy.redactSensitiveText &&
    target === 'response'
  ) {
    nextMessage.bodyText = redactValue(
      message.bodyText,
      [target, 'bodyText'],
      policy,
      warnings,
    ) as string;
  }

  if (message.bodyJson !== undefined) {
    nextMessage.bodyJson = redactValue(
      cloneValue(message.bodyJson),
      [target, 'bodyJson'],
      policy,
      warnings,
    );
  }

  return warnings.length === 0
    ? { message: nextMessage }
    : { message: nextMessage, warnings };
};

export const redactStreamEvent = (
  event: CanonicalStreamEvent,
  policy: PrivacyPolicy,
): { event: CanonicalStreamEvent; warnings?: string[] } => {
  const warnings: string[] = [];
  const nextEvent: CanonicalStreamEvent = {
    ...event,
  };

  if (event.rawLine !== undefined && policy.redactSensitiveText) {
    nextEvent.rawLine = redactValue(
      event.rawLine,
      ['stream-event', 'rawLine'],
      policy,
      warnings,
    ) as string;
  }

  if (event.rawJson !== undefined) {
    nextEvent.rawJson = redactValue(
      cloneValue(event.rawJson),
      ['stream-event', 'rawJson'],
      policy,
      warnings,
    );
  }

  if (event.normalized !== undefined) {
    nextEvent.normalized = redactValue(
      cloneValue(event.normalized),
      ['stream-event', 'normalized'],
      policy,
      warnings,
    );
  }

  return warnings.length === 0
    ? { event: nextEvent }
    : { event: nextEvent, warnings };
};
