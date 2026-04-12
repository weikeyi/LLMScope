import type { ReplayFormat, SessionDiffResult } from '@llmscope/replay';
import type {
  Session,
  SessionStatus,
  SessionSummary,
} from '@llmscope/shared-types';

export interface ObservationUiOptions {
  apiBaseUrl: string;
  selectedSessionId?: string;
  compareMode?: 'previous';
  compareToSessionId?: string;
  status?: SessionStatus;
  provider?: string;
  model?: string;
  search?: string;
  limit?: number;
}

export interface ObservationFilters {
  status?: SessionStatus;
  provider?: string;
  model?: string;
  search?: string;
  limit: number;
}

export interface ObservationPageData {
  apiBaseUrl: string;
  filters: ObservationFilters;
  selectedSessionId: string | null;
  sessions: SessionSummary[];
  selectedSession: Session | null;
  comparison?: {
    mode: 'previous' | 'selected';
    compareSessionId: string;
    compareSession: Session | null;
    diff: SessionDiffResult;
  } | null;
  replayArtifacts?: Array<{
    format: ReplayFormat;
    label: string;
    content: string;
  }>;
  error?: string;
}

export interface ObservationUiServerOptions {
  apiBaseUrl: string;
  host?: string;
  port?: number;
}

export interface ObservationUiServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getAddress(): { host: string; port: number };
}
