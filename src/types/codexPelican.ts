export const CODEX_PELICAN_DEFAULT_PROMPT = 'Tạo một file HTML chứa hoạt ảnh 2D vẽ một con bồ nông đang đi xe đạp bằng SVG, không cần kiểm thử, không giới hạn';
export const CODEX_PELICAN_DEFAULT_MODEL = 'gpt-6-astra';
export const CODEX_PELICAN_MAX_CONCURRENCY = 10;

export type CodexPelicanStatus = 'running' | 'cancelling' | 'completed' | 'cancelled' | 'interrupted';
export type CodexPelicanItemStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export interface CodexPelicanProviderTarget {
  providerId: string;
  apiKeyId: string;
  model: string;
}

export interface CodexPelicanProviderSource extends CodexPelicanProviderTarget {
  providerName: string;
  apiKeyName: string;
  baseUrl: string;
  wireApi: string;
}

export interface CodexPelicanItem {
  provider?: CodexPelicanProviderSource;
  id: string;
  accountId: string;
  accountEmail: string;
  status: CodexPelicanItemStatus;
  startedAt?: number;
  finishedAt?: number;
  replyPreview?: string;
  hasHtml: boolean;
  error?: string;
  usage?: unknown;
  quota?: CodexPelicanQuotaUsage;
  responseModel?: string;
  responseId?: string;
}

export interface CodexPelicanQuotaUsage {
  consumedPercent?: number;
  beforeRemainingPercent?: number;
  remainingPercent?: number;
  windowMinutes?: number;
  resetAt?: number;
}

export interface CodexPelicanBatch {
  id: string;
  revision: number;
  createdAt: number;
  finishedAt?: number;
  status: CodexPelicanStatus;
  prompt: string;
  model: string;
  effort: string;
  concurrency: number;
  transport?: string;
  deliveryInstructions?: string;
  items: CodexPelicanItem[];
  error?: string;
}

export interface CodexPelicanRequest {
  providerTargets?: CodexPelicanProviderTarget[];
  accountIds: string[];
  prompt: string;
  model: string;
  effort: string;
  concurrency: number;
}

export interface CodexPelicanArtifact {
  rawReply: string;
  html: string | null;
}

export const isPelicanRunning = (batch: CodexPelicanBatch | null) =>
  batch?.status === 'running' || batch?.status === 'cancelling';

export const pelicanCompletedCount = (batch: CodexPelicanBatch) =>
  batch.items.filter((item) => item.status !== 'queued' && item.status !== 'running').length;
