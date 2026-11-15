import { getCodexServiceAccountDisplay, getCodexServiceSourceId } from "../utils/chatgptPlanOverview";
import { resolveCodexAccountDisplayName } from "../utils/codexAccountDisplayName";
import type { Account } from "../types/account";
import type { CodexAccount } from "../types/codex";
import {
  formatResetTimeDisplay,
  getAntigravityTierBadge,
  getQuotaClass as getAntigravityQuotaClass,
  getSubscriptionTier,
  matchModelName,
} from "../utils/account";
import {
  formatCodexResetTime,
  getCodexAdditionalQuotaWindows,
  getCodexCodeReviewQuotaMetric,
  getCodexQuotaWindowLabel,
  getCodexEffectiveQuotaPercentages,
  getCodexMonthlyCreditUsage,
  getCodexPlanBadgePresentation,
  getCodexQuotaClass,
  getCodexQuotaWindows,
  isCodexApiKeyAccount,
  isCodexChatgptPlanAccount,
  isCodexChatCompletionsApiKeyAccount,
  isCodexNewApiAccount,
  isCodexPendingOAuthAccount,
} from "../types/codex";
import { withCodexPlanBadgeStyle } from "../utils/codexPreferences";
import { placeCodexMonthlyCreditsLast } from "../utils/codexQuotaItemOrder";
import type { DisplayGroup } from "../services/groupService";
import type { CodexWindowStats } from "../utils/codexWindowStats";

export type Translate = any;

export interface UnifiedQuotaMetric {
  key: string;
  label: string;
  percentage: number;
  quotaClass: string;
  valueText: string;
  hintText?: string;
  resetText?: string;
  resetAt?: string | number | null;
  progressPercent?: number;
  used?: number;
  total?: number;
  left?: number;
  showProgress?: boolean;
  windowStats?: CodexWindowStats | null;
}

export interface UnifiedAccountPresentation {
  id: string;
  displayName: string;
  planLabel: string;
  planClass: string;
  quotaItems: UnifiedQuotaMetric[];
  cycleText?: string;
  sublineText?: string;
  sublineClass?: string;
}



export interface QuotaPreviewLine {
  key: string;
  label: string;
  percentage: number;
  quotaClass: string;
  text: string;
  title: string;
}

export type AgQuotaDisplayItem = {
  key: string;
  label: string;
  percentage: number;
  resetTime: string;
  stale?: boolean;
};

export type CreditMetrics = {
  usedPercent: number;
  used: number;
  total: number;
  left: number;
};

function toFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toJsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(
  value: Record<string, unknown> | null,
  key: string,
): number | null {
  const raw = value?.[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function readString(
  value: Record<string, unknown> | null,
  key: string,
): string {
  const raw = value?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function readBoolean(
  value: Record<string, unknown> | null,
  key: string,
): boolean {
  return value?.[key] === true;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Math.round(value);
}

function normalizeUnixSeconds(
  value: number | null | undefined,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  if (value > 10_000_000_000) {
    return Math.floor(value / 1000);
  }
  return Math.floor(value);
}

function formatQuotaNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Math.max(0, value),
  );
}

function formatMetricResetText(
  resetTime: number | null | undefined,
  t: Translate,
): string {
  const normalized = normalizeUnixSeconds(resetTime);
  return normalized ? formatCodexResetTime(normalized, t) : "";
}

export function buildCreditMetrics(
  used: number | null | undefined,
  total: number | null | undefined,
  left: number | null | undefined,
): CreditMetrics {
  const safeUsed = toFiniteNumber(used);
  const safeTotal = toFiniteNumber(total);
  const safeLeft = toFiniteNumber(left);

  let usedPercent = 0;
  if (safeTotal != null && safeTotal > 0) {
    if (safeUsed != null) {
      usedPercent = clampPercent((safeUsed / safeTotal) * 100);
    } else if (safeLeft != null) {
      usedPercent = clampPercent(((safeTotal - safeLeft) / safeTotal) * 100);
    }
  }

  return {
    usedPercent,
    used: safeUsed ?? 0,
    total: safeTotal ?? 0,
    left: safeLeft ?? 0,
  };
}


export function getAntigravityGroupResetTimestamp(
  account: Account,
  group: DisplayGroup,
): number | null {
  if (!account.quota?.models?.length) {
    return null;
  }

  let earliest: number | null = null;
  for (const model of account.quota.models) {
    const belongsToGroup = group.models.some((groupModelId) =>
      matchModelName(model.name, groupModelId),
    );
    if (!belongsToGroup) {
      continue;
    }
    const parsed = new Date(model.reset_time);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    const timestamp = parsed.getTime();
    if (earliest === null || timestamp < earliest) {
      earliest = timestamp;
    }
  }
  return earliest;
}
export function isAccountNeedsReauth(
  account: Account,
  verificationStatusMap?: Record<string, string>,
): boolean {
  const reason = account.disabled_reason || (verificationStatusMap ? verificationStatusMap[account.id] : undefined);
  if (reason === 'verification_required' || reason?.startsWith('invalid_grant')) {
    return true;
  }
  const qErr = account.quota_error;
  if (qErr?.reason === 'VALIDATION_REQUIRED') {
    return true;
  }
  if (Boolean(qErr?.validation_url)) {
    return true;
  }
  if (
    qErr?.message &&
    (qErr.message.includes('Verify your account') ||
      qErr.message.includes('VALIDATION_REQUIRED') ||
      qErr.message.includes('invalid_grant'))
  ) {
    return true;
  }
  return false;
}

export function getAntigravityQuotaDisplayItems(
  account: Account,
  _displayGroups: DisplayGroup[],
): AgQuotaDisplayItem[] {
  const models = account.quota?.models || [];
  const tier = getSubscriptionTier(account.quota);
  const isFree = tier === 'FREE';
  const stale = !isFree && (account.quota?.quota_summary_stale || undefined);
  const result: AgQuotaDisplayItem[] = [];
  const isNonArgonGemini = (rawName: string) => {
    const name = rawName.toLowerCase();
    return name.includes('gemini') && !name.includes('argon');
  };

  let claude5h: (typeof models)[0] | undefined;
  let claudeWeekly: (typeof models)[0] | undefined;
  let gemini5h: (typeof models)[0] | undefined;
  let geminiWeekly: (typeof models)[0] | undefined;
  let argonWeekly: (typeof models)[0] | undefined;

  if (isFree) {
    // 免费账号仅有 Weekly 额度，不显示 5h 额度
    claudeWeekly =
      models.find((m) => m.name === '3p-weekly' || m.name === 'claude:weekly') ||
      models.find((m) => m.name.toLowerCase().includes('claude'));

    geminiWeekly =
      models.find((m) => m.name === 'gemini-weekly' || m.name === 'gemini:weekly') ||
      models.find((m) => isNonArgonGemini(m.name));

    argonWeekly =
      models.find(
        (m) =>
          m.name === 'gemini-argon-wtu-weekly' ||
          m.name === 'argon:weekly' ||
          (m.name.startsWith('gemini-argon-') && m.name.endsWith('-weekly')),
      ) || models.find((m) => m.name.toLowerCase().includes('argon'));
  } else {
    // Claude 5h
    claude5h = models.find((m) => m.name === '3p-5h' || m.name === 'claude:5h');
    if (!claude5h) {
      claude5h = models.find((m) => {
        const name = m.name.toLowerCase();
        return name.includes('claude') && (name.includes('high') || !name.includes('low'));
      });
    }
    if (!claude5h) {
      claude5h = models.find((m) => m.name.toLowerCase().includes('claude'));
    }

    // Claude Weekly
    claudeWeekly = models.find((m) => m.name === '3p-weekly' || m.name === 'claude:weekly');
    if (!claudeWeekly) {
      claudeWeekly = models.find((m) => {
        const name = m.name.toLowerCase();
        return name.includes('claude') && name.includes('low');
      });
    }

    // Gemini 5h
    gemini5h = models.find((m) => m.name === 'gemini-5h' || m.name === 'gemini:5h');
    if (!gemini5h) {
      gemini5h = models.find((m) => {
        const name = m.name.toLowerCase();
        return isNonArgonGemini(name) && name.includes('pro') && name.includes('high');
      });
    }
    if (!gemini5h) {
      gemini5h = models.find((m) => {
        const name = m.name.toLowerCase();
        return isNonArgonGemini(name) && name.includes('high');
      });
    }
    if (!gemini5h) {
      gemini5h = models.find((m) => {
        const name = m.name.toLowerCase();
        return isNonArgonGemini(name) && name.includes('flash');
      });
    }
    if (!gemini5h) {
      gemini5h = models.find((m) => {
        const name = m.name.toLowerCase();
        return isNonArgonGemini(name) && !name.includes('low');
      });
    }
    if (!gemini5h) {
      gemini5h = models.find((m) => isNonArgonGemini(m.name));
    }

    // Gemini Weekly
    geminiWeekly = models.find((m) => m.name === 'gemini-weekly' || m.name === 'gemini:weekly');
    if (!geminiWeekly) {
      geminiWeekly = models.find((m) => {
        const name = m.name.toLowerCase();
        return isNonArgonGemini(name) && name.includes('pro') && name.includes('low');
      });
    }
    if (!geminiWeekly) {
      geminiWeekly = models.find((m) => {
        const name = m.name.toLowerCase();
        return isNonArgonGemini(name) && name.includes('low');
      });
    }

    // Gemini 4 Argon Weekly
    argonWeekly =
      models.find(
        (m) =>
          m.name === 'gemini-argon-wtu-weekly' ||
          m.name === 'argon:weekly' ||
          (m.name.startsWith('gemini-argon-') && m.name.endsWith('-weekly')),
      ) || models.find((m) => m.name.toLowerCase().includes('argon'));
  }

  if (claude5h) {
    result.push({
      key: 'claude:5h',
      label: 'Claude (5h)',
      percentage: claude5h.percentage,
      resetTime: claude5h.reset_time,
      stale,
    });
  }
  if (claudeWeekly) {
    result.push({
      key: 'claude:weekly',
      label: 'Claude (Weekly)',
      percentage: claudeWeekly.percentage,
      resetTime: claudeWeekly.reset_time,
      stale,
    });
  }
  if (gemini5h) {
    result.push({
      key: 'gemini:5h',
      label: 'Gemini (5h)',
      percentage: gemini5h.percentage,
      resetTime: gemini5h.reset_time,
      stale,
    });
  }
  if (geminiWeekly) {
    result.push({
      key: 'gemini:weekly',
      label: 'Gemini (Weekly)',
      percentage: geminiWeekly.percentage,
      resetTime: geminiWeekly.reset_time,
      stale,
    });
  }
  if (argonWeekly) {
    result.push({
      key: 'argon:weekly',
      label: 'Gemini 4 Argon (Weekly)',
      percentage: argonWeekly.percentage,
      resetTime: argonWeekly.reset_time,
      stale,
    });
  }

  return result;
}

export function buildAntigravityAccountPresentation(
  account: Account,
  displayGroups: DisplayGroup[],
  t: Translate,
): UnifiedAccountPresentation {
  const tierBadge = getAntigravityTierBadge(account.quota);
  const quotaItems = getAntigravityQuotaDisplayItems(
    account,
    displayGroups,
  ).map((item) => ({
    key: item.key,
    label: item.label,
    percentage: item.percentage,
    quotaClass: getAntigravityQuotaClass(item.percentage),
    valueText: `${item.percentage}%`,
    hintText: item.stale ? t('common.shared.quota.cachedRefreshFailed') : undefined,
    resetText: [
      item.stale ? t('common.shared.quota.cachedRefreshFailed') : '',
      item.resetTime ? formatResetTimeDisplay(item.resetTime, t) : '',
    ].filter(Boolean).join(' · '),
    resetAt: item.resetTime,
  }));

  return {
    id: account.id,
    displayName: account.email,
    planLabel: tierBadge.label,
    planClass: tierBadge.className,
    quotaItems,
  };
}

function buildCodexNewApiQuotaItems(
  account: CodexAccount,
  t: Translate,
): UnifiedQuotaMetric[] {
  const raw = toJsonRecord(account.quota?.raw_data);
  const provider = readString(raw, "provider");
  if (provider !== "cockpit-api" && provider !== "new-api") {
    return [];
  }
  const profile = toJsonRecord(raw?.profile);
  const usage = toJsonRecord(raw?.usage) ?? toJsonRecord(profile?.usage);
  const total =
    readNumber(usage, "total_granted") ?? readNumber(raw, "total_granted") ?? 0;
  const used =
    readNumber(usage, "total_used") ?? readNumber(raw, "total_used") ?? 0;
  const available =
    readNumber(usage, "total_available") ??
    readNumber(raw, "total_available") ??
    0;
  const unlimited =
    readBoolean(usage, "unlimited_quota") ||
    readBoolean(raw, "unlimited_quota");
  const percentage =
    unlimited || total <= 0
      ? unlimited
        ? 100
        : 0
      : clampPercent((available / total) * 100);
  const expiresAt = readNumber(usage, "expires_at");
  const valueText = unlimited
    ? t("codex.newApi.quota.unlimited", "不限量")
    : readString(usage, "summary_display") ||
      `${formatQuotaNumber(available)} / ${formatQuotaNumber(total)}`;

  return [
    {
      key: "new_api_quota",
      label: t("codex.newApi.quota.available", "额度"),
      percentage,
      quotaClass: getCodexQuotaClass(percentage),
      valueText,
      resetText: formatMetricResetText(expiresAt, t),
      resetAt: expiresAt,
      used,
      total,
      left: available,
      hintText: t("codex.newApi.quota.usedHint", {
        used: formatQuotaNumber(used),
        defaultValue: "已用 {{used}}",
      }),
    },
  ];
}

function getCodexQuotaWindowTitle(
  windowMinutes: number | undefined,
  fallback: "hourly" | "weekly",
  t: Translate,
): string {
  const label = getCodexQuotaWindowLabel(windowMinutes, fallback);
  if (label === "5h") {
    return t("codex.quota.hourly", "5小时配额");
  }
  if (label === "7d" || label === "Weekly") {
    return t("codex.quota.weekly", "周配额");
  }
  const weeks = /^(\d+)\s*w(?:eek)?s?$/i.exec(label);
  if (weeks) {
    return t("codex.quota.windowWeeks", {
      count: Number(weeks[1]),
      defaultValue: "{{count}} 周配额",
    });
  }
  const days = /^(\d+)d$/.exec(label);
  if (days) {
    return t("codex.quota.windowDays", {
      count: Number(days[1]),
      defaultValue: "{{count}} 天配额",
    });
  }
  const hours = /^(\d+)h$/.exec(label);
  if (hours) {
    return t("codex.quota.windowHours", {
      count: Number(hours[1]),
      defaultValue: "{{count}} 小时配额",
    });
  }
  const minutes = /^(\d+)m$/.exec(label);
  if (minutes) {
    return t("codex.quota.windowMinutes", {
      count: Number(minutes[1]),
      defaultValue: "{{count}} 分钟配额",
    });
  }
  return label;
}

export function buildCodexAccountPresentation(
  account: CodexAccount,
  t: Translate,
): UnifiedAccountPresentation {
  if (isCodexChatgptPlanAccount(account) && getCodexServiceSourceId(account) === account.id) {
    const source = t('chatgptPlan.title');
    const planBadge = getCodexPlanBadgePresentation(account);
    return {
      id: account.id,
      displayName: account.account_name?.trim() || account.email || source,
      planLabel: account.plan_type?.trim() || account.service_source_plan_badge ? planBadge.label : source,
      planClass: withCodexPlanBadgeStyle(planBadge.className),
      // This authorization has no official remaining-quota endpoint.
      quotaItems: [],
    };
  }
  // Verified bindings borrow original account display data only. Endpoint
  // credentials, eligibility and runtime health never consume this copy.
  account = getCodexServiceAccountDisplay(account);
  const displayName = isCodexApiKeyAccount(account)
    ? resolveCodexAccountDisplayName(account, t("common.apiKeyAccount"))
    : account.email;
  const effectiveQuota = getCodexEffectiveQuotaPercentages(account.quota);
  const weeklyBlocksHourlyHint = effectiveQuota.weeklyBlocksHourly
    ? t("codex.quota.weeklyBlocksHourly", "周额度为 0，5小时额度已不可用")
    : "";
  const newApiQuotaItems = isCodexNewApiAccount(account)
    ? buildCodexNewApiQuotaItems(account, t)
    : [];
  const quotaItems: UnifiedQuotaMetric[] =
    isCodexChatCompletionsApiKeyAccount(account)
      ? []
      : newApiQuotaItems.length > 0
      ? newApiQuotaItems
      : getCodexQuotaWindows(account.quota).map((window) => {
          const windowTitle = getCodexQuotaWindowTitle(
            window.windowMinutes,
            window.id === "secondary" ? "weekly" : "hourly",
            t,
          );
          return {
            key: window.id,
            label: window.label,
            percentage: window.percentage,
            quotaClass: getCodexQuotaClass(window.percentage),
            valueText: `${window.percentage}%`,
            resetText: window.resetTime
              ? formatCodexResetTime(window.resetTime, t as any)
              : "",
            resetAt: window.resetTime,
            hintText: [
              windowTitle,
              window.id === "primary" ? weeklyBlocksHourlyHint : "",
            ]
              .filter(Boolean)
              .join("\n"),
          };
        });
  const monthlyCreditUsage = isCodexChatCompletionsApiKeyAccount(account)
    ? null
    : getCodexMonthlyCreditUsage(account.quota);
  const monthlyCreditAmount =
    monthlyCreditUsage?.remaining ??
    Number.parseFloat(monthlyCreditUsage?.balance ?? "");
  const hasMonthlyCredits =
    monthlyCreditUsage != null &&
    (monthlyCreditUsage.unlimited === true ||
      (typeof monthlyCreditAmount === "number" &&
        Number.isFinite(monthlyCreditAmount) &&
        monthlyCreditAmount > 0));
  if (hasMonthlyCredits) {
    const total = monthlyCreditUsage.total;
    const remaining = monthlyCreditUsage.remaining;
    const percentage = monthlyCreditUsage.unlimited
      ? 100
      : monthlyCreditUsage.remainingPercent != null
        ? monthlyCreditUsage.remainingPercent
        : total != null && total > 0 && remaining != null
          ? clampPercent((remaining / total) * 100)
          : 0;
    const amountText = monthlyCreditUsage.unlimited
      ? t("codex.quota.unlimitedCredits", "∞")
      : remaining != null
        ? formatQuotaNumber(remaining)
        : monthlyCreditUsage.balance
          ? t("codex.quota.creditBalance", {
              balance: monthlyCreditUsage.balance,
              defaultValue: "{{balance}}",
            })
          : t("common.shared.quota.noData", "暂无配额数据");
    quotaItems.push({
      key: "monthly_credits",
      label: t("codex.quota.monthlyCredits", "Credits"),
      percentage,
      quotaClass: "neutral",
      valueText: t("codex.quota.monthlyCreditsInline", {
        value: amountText,
        defaultValue: "Credits：{{value}}",
      }),
      resetText: monthlyCreditUsage.resetTime
        ? formatCodexResetTime(monthlyCreditUsage.resetTime, t as any)
        : "",
      resetAt: monthlyCreditUsage.resetTime,
      used: monthlyCreditUsage.used,
      total,
      left: remaining,
      hintText: t("codex.quota.monthlyCreditsHint", "本月 credits 剩余"),
      showProgress: false,
    });
  }
  const additionalQuotaItems =
    !isCodexChatCompletionsApiKeyAccount(account)
      ? getCodexAdditionalQuotaWindows(account.quota).map((window) => {
          const windowTitle = getCodexQuotaWindowTitle(
            window.windowMinutes,
            window.windowKind === "secondary" ? "weekly" : "hourly",
            t,
          );
          const limitLabel =
            window.limitLabel || t("codex.quota.additional", "额外额度");
          const hintText = [
            `${limitLabel} · ${windowTitle}`,
            [window.limitName, window.meteredFeature]
              .filter(Boolean)
              .join(" · "),
          ]
            .filter(Boolean)
            .join("\n");
          return {
            key: window.id,
            label: `${limitLabel} ${window.label}`,
            percentage: window.percentage,
            quotaClass: getCodexQuotaClass(window.percentage),
            valueText: `${window.percentage}%`,
            resetText: window.resetTime
              ? formatCodexResetTime(window.resetTime, t as any)
              : "",
            resetAt: window.resetTime,
            hintText,
          };
        })
      : [];
  quotaItems.push(...additionalQuotaItems);
  const codeReviewMetric = getCodexCodeReviewQuotaMetric(account.quota);
  if (codeReviewMetric) {
    quotaItems.push({
      key: "code_review",
      label: "Code Review",
      percentage: codeReviewMetric.percentage,
      quotaClass: getCodexQuotaClass(codeReviewMetric.percentage),
      valueText: `${codeReviewMetric.percentage}%`,
      resetText: codeReviewMetric.resetTime
        ? formatCodexResetTime(codeReviewMetric.resetTime, t as any)
        : "",
      resetAt: codeReviewMetric.resetTime,
      hintText: t("codex.quota.codeReview", "Code Review"),
    });
  }
  const planBadge = isCodexPendingOAuthAccount(account)
    ? {
        label: t("codex.pendingAuth.badge", "待授权"),
        className: "pending-auth",
      }
    : getCodexPlanBadgePresentation(account);

  return {
    id: account.id,
    displayName,
    planLabel: planBadge.label,
    planClass: withCodexPlanBadgeStyle(planBadge.className),
    quotaItems: placeCodexMonthlyCreditsLast(quotaItems),
  };
}


export function buildQuotaPreviewLines(
  quotaItems: UnifiedQuotaMetric[],
  limit = 3,
): QuotaPreviewLine[] {
  return quotaItems.slice(0, Math.max(0, limit)).map((item) => ({
    key: item.key,
    label: item.label,
    percentage: item.percentage,
    quotaClass: item.quotaClass,
    text: `${item.label} ${item.valueText}`,
    title: item.hintText
      ? `${item.label} ${item.valueText} · ${item.hintText}`
      : `${item.label} ${item.valueText}`,
  }));
}
