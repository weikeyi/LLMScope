import type { Session } from '@llmscope/shared-types';

export interface SessionDiffChange {
  label: string;
  path: string;
  left: string;
  right: string;
}

export interface SessionDiffResult {
  leftSessionId: string;
  rightSessionId: string;
  changes: SessionDiffChange[];
}

const toDisplayValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '-';
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? '-' : value.join(', ');
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value.length === 0 ? '-' : value;
  }

  return JSON.stringify(value);
};

const pushIfChanged = (
  changes: SessionDiffChange[],
  definition: {
    label: string;
    path: string;
    left: unknown;
    right: unknown;
    format?: (value: unknown) => string;
  },
): void => {
  const formatter = definition.format ?? toDisplayValue;
  const left = formatter(definition.left);
  const right = formatter(definition.right);

  if (left === right) {
    return;
  }

  changes.push({
    label: definition.label,
    path: definition.path,
    left,
    right,
  });
};

export const diffSessions = (
  leftSession: Session,
  rightSession: Session,
): SessionDiffResult => {
  const changes: SessionDiffChange[] = [];

  pushIfChanged(changes, {
    label: 'HTTP status',
    path: 'transport.statusCode',
    left: leftSession.transport.statusCode,
    right: rightSession.transport.statusCode,
  });
  pushIfChanged(changes, {
    label: 'Duration',
    path: 'transport.durationMs',
    left: leftSession.transport.durationMs,
    right: rightSession.transport.durationMs,
    format: (value) =>
      typeof value === 'number' ? `${value}ms` : toDisplayValue(value),
  });
  pushIfChanged(changes, {
    label: 'Model',
    path: 'normalized.model',
    left: leftSession.normalized?.model,
    right: rightSession.normalized?.model,
  });
  pushIfChanged(changes, {
    label: 'Output text',
    path: 'normalized.output.text',
    left: leftSession.normalized?.output?.text,
    right: rightSession.normalized?.output?.text,
  });
  pushIfChanged(changes, {
    label: 'Warnings',
    path: 'warnings',
    left: leftSession.warnings,
    right: rightSession.warnings,
  });

  return {
    leftSessionId: leftSession.id,
    rightSessionId: rightSession.id,
    changes,
  };
};
