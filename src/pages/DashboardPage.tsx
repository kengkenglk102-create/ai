import { resolveCodexAccountDisplayName } from "../utils/codexAccountDisplayName";
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccountStore } from '../stores/useAccountStore';
import { useCodexAccountStore } from '../stores/useCodexAccountStore';
import { useSponsorStore } from '../stores/useSponsorStore';
import { useRemoteConfigStore } from '../stores/useRemoteConfigStore';
import {
  API_RELAY_LAYOUT_ENTRY_ID,
  ApiRelayLayoutEntryId,
  parseGroupEntryId,
  PlatformLayoutEntryId,
  resolveEntryDefaultPlatformId,
  resolveEntryPlatformIds,
  resolveGroupChildName,
  usePlatformLayoutStore,
} from '../stores/usePlatformLayoutStore';
import { Page } from '../types/navigation';
import { Users, CheckCircle2, Sparkles, RotateCw, Play, Tag, EyeOff } from 'lucide-react';
import { TagEditModal } from '../components/TagEditModal';
import { Account } from '../types/account';
import {
  CodexAccount,
  getCodexQuotaWindows,
  isCodexApiKeyAccount,
  isCodexChatCompletionsApiKeyAccount,
  isCodexNewApiAccount,
} from '../types/codex';
import { isDeepSeekAccount } from '../utils/codexDeepSeekAccess';
import './DashboardPage.css';
import { RobotIcon } from '../components/icons/RobotIcon';
import { CodexIcon } from '../components/icons/CodexIcon';
import { CodexResetCreditExpiry } from '../components/CodexResetCreditExpiry';
import { isAccountPlatform, PlatformId, PLATFORM_PAGE_MAP } from '../types/platform';
import { getPlatformLabel, renderPlatformIcon } from '../utils/platformMeta';
import { setAntigravityRuntimeTargetFromPlatform } from '../utils/antigravityRuntimeTarget';
import { useAntigravityRuntimeTarget } from '../hooks/useAntigravityRuntimeTarget';
import { ManualHelpIconButton } from '../components/ManualHelpIconButton';
import { AnnouncementCenter } from '../components/AnnouncementCenter';
import { isPrivacyModeEnabledByDefault, maskSensitiveValue } from '../utils/privacy';
import { DisplayGroup, getDisplayGroups } from '../services/groupService';
import {
  buildAntigravityAccountPresentation,
  buildCodexAccountPresentation,
  UnifiedAccountPresentation,
} from '../presentation/platformAccountPresentation';
import {
  CODEX_API_KEY_USAGE_REFRESHED_EVENT,
  readCodexApiKeyUsageCache,
  refreshCodexApiKeyUsageForAccounts,
} from '../services/codexApiKeyUsageRefreshService';
import {
  isModelProviderUsageUnavailableError,
  resolveNewApiQuotaSnapshot,
  type ModelProviderUsageSummary,
} from '../services/modelProviderUsageService';

interface DashboardPageProps {
  onNavigate: (page: Page) => void;
  onOpenPlatformLayout: () => void;
  onEasterEggTriggerClick?: () => void;
}

const DASHBOARD_DEFERRED_PREFETCH_DELAY_MS = 6000;
const DASHBOARD_DEFERRED_PREFETCH_BATCH_SIZE = 1;
const DASHBOARD_DEFERRED_PREFETCH_BATCH_DELAY_MS = 1200;
let dashboardStartupPrefetched = false;

function normalizeDashboardCardPlatformId(platformId: PlatformId): PlatformId {
  return platformId === 'antigravity_ide' ? 'antigravity' : platformId;
}

function resolveDashboardCodexApiUsageMode(
  summary?: ModelProviderUsageSummary | null,
): 'new_api' | 'sub2api' | 'deepseek' | null {
  if (!summary) return null;
  if (
    summary.mode === 'new_api' ||
    summary.mode === 'sub2api' ||
    summary.mode === 'deepseek'
  ) {
    return summary.mode;
  }
  if (
    typeof summary.todayRequests === 'number' ||
    typeof summary.todayTotalTokens === 'number'
  ) {
    return 'sub2api';
  }
  const detailKeys = new Set((summary.details ?? []).map((item) => item.key));
  if (
    detailKeys.has('todayRequests') ||
    detailKeys.has('todayTokens') ||
    detailKeys.has('remaining')
  ) {
    return 'sub2api';
  }
  if (
    detailKeys.has('totalGranted') ||
    detailKeys.has('totalAvailable') ||
    detailKeys.has('expiresAt')
  ) {
    return 'new_api';
  }
  return null;
}

function resolveDashboardCurrentAccount<T extends { id: string }>(
  accounts: T[],
  currentId: string | null | undefined,
  currentAccount?: T | null,
): T | null {
  const normalizedCurrentId = currentId?.trim();
  if (normalizedCurrentId) {
    const matched = accounts.find((account) => account.id === normalizedCurrentId);
    if (matched) return matched;
    if (currentAccount?.id === normalizedCurrentId) return currentAccount;
  }
  return accounts[0] ?? null;
}

type DashboardEntryId = PlatformLayoutEntryId | ApiRelayLayoutEntryId;

export function DashboardPage({
  onNavigate,
  onOpenPlatformLayout,
}: DashboardPageProps) {
  const { t } = useTranslation();
  const antigravityRuntimeTarget = useAntigravityRuntimeTarget();

  const [tagModalState, setTagModalState] = React.useState<{ accountId: string; platform: PlatformId; tags: string[] } | null>(null);

  const handleSaveTags = async (newTags: string[]) => {
    if (!tagModalState) return;
    try {
      const accountId = tagModalState.accountId;
      switch (tagModalState.platform) {
        case 'antigravity':
        case 'antigravity_ide':
          await useAccountStore.getState().updateAccountTags(accountId, newTags);
          break;
        case 'codex':
        case 'codex_api_service':
          await useCodexAccountStore.getState().updateAccountTags(accountId, newTags);
          break;
      }
      setTagModalState(null);
    } catch (error) {
      console.error('Save tags failed:', error);
    }
  };

  const {
    orderedEntryIds,
    hiddenEntryIds,
    platformGroups,
    apiRelayDashboardVisible,
    apiRelayEntryOrder,
    setHiddenEntry,
  } = usePlatformLayoutStore();
  const apiRelayEntryEnabled = useSponsorStore((state) => Boolean(state.state.sponsorModule));
  const remoteHiddenPlatformIds = useRemoteConfigStore((state) => state.hiddenPlatformIds);
  const apiRelayDashboardEnabled = apiRelayEntryEnabled && apiRelayDashboardVisible;
  const hiddenEntrySet = useMemo(() => new Set(hiddenEntryIds), [hiddenEntryIds]);
  const remoteHiddenPlatformSet = useMemo(
    () => new Set(remoteHiddenPlatformIds),
    [remoteHiddenPlatformIds],
  );
  const visibleEntryOrder = useMemo(
    () =>
      orderedEntryIds.filter((entryId) => {
        if (hiddenEntrySet.has(entryId)) {
          return false;
        }
        return resolveEntryPlatformIds(entryId, platformGroups).some(
          (platformId) => !remoteHiddenPlatformSet.has(platformId),
        );
      }),
    [orderedEntryIds, hiddenEntrySet, platformGroups, remoteHiddenPlatformSet],
  );
  const visibleDashboardEntryOrder = useMemo<DashboardEntryId[]>(() => {
    const result: DashboardEntryId[] = [...visibleEntryOrder];
    if (!apiRelayDashboardEnabled) {
      return result;
    }
    const insertIndex = Math.max(0, Math.min(apiRelayEntryOrder, result.length));
    result.splice(insertIndex, 0, API_RELAY_LAYOUT_ENTRY_ID);
    return result;
  }, [apiRelayDashboardEnabled, apiRelayEntryOrder, visibleEntryOrder]);
  const [privacyModeEnabled, setPrivacyModeEnabled] = React.useState<boolean>(() =>
    isPrivacyModeEnabledByDefault()
  );
  const maskAccountText = React.useCallback(
    (value?: string | null) => maskSensitiveValue(value, privacyModeEnabled),
    [privacyModeEnabled],
  );
  const [agDisplayGroups, setAgDisplayGroups] = React.useState<DisplayGroup[]>([]);
  const navigateToPlatform = useCallback((platformId: PlatformId) => {
    setAntigravityRuntimeTargetFromPlatform(platformId);
    onNavigate(PLATFORM_PAGE_MAP[platformId]);
  }, [onNavigate]);

  React.useEffect(() => {
    const syncPrivacyMode = () => {
      setPrivacyModeEnabled(isPrivacyModeEnabledByDefault());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncPrivacyMode();
      }
    };

    window.addEventListener('focus', syncPrivacyMode);
    window.addEventListener('storage', syncPrivacyMode);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', syncPrivacyMode);
      window.removeEventListener('storage', syncPrivacyMode);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Antigravity Data
  const {
    accounts: agAccounts,
    currentAccountsByTarget: agCurrentAccountsByTarget,
    switchAccount: switchAgAccount,
    fetchAccounts: fetchAgAccounts,
    fetchCurrentAccount: fetchAgCurrent
  } = useAccountStore();
  const agCurrent = agCurrentAccountsByTarget[antigravityRuntimeTarget] ?? null;

  // Codex Data
  const {
    accounts: codexAccounts,
    currentAccount: codexCurrent,
    switchAccount: switchCodexAccount,
    fetchAccounts: fetchCodexAccounts,
    fetchCurrentAccount: fetchCodexCurrent
  } = useCodexAccountStore();

  const agCurrentId = agCurrent?.id;
  const codexCurrentId = codexCurrent?.id;

  const agCurrentAccount = useMemo(() => {
    return resolveDashboardCurrentAccount(agAccounts, agCurrentId, agCurrent);
  }, [agAccounts, agCurrent, agCurrentId]);

  const codexCurrentAccount = useMemo(() => {
    return resolveDashboardCurrentAccount(codexAccounts, codexCurrentId, codexCurrent);
  }, [codexAccounts, codexCurrent, codexCurrentId]);

  React.useEffect(() => {
    let disposed = false;
    let deferredTimer: number | null = null;
    let deferredBatchTimer: number | null = null;

    const loadDisplayGroups = () => {
      getDisplayGroups()
        .then((groups) => {
          if (!disposed) {
            setAgDisplayGroups(groups);
          }
        })
        .catch((error) => {
          console.error('Failed to load display groups:', error);
        });
    };

    // 首屏优先：先拉 Antigravity 数据，其它平台延后，避免启动期并发请求过多。
    void Promise.allSettled([fetchAgAccounts(), fetchAgCurrent(antigravityRuntimeTarget)]);
    loadDisplayGroups();

    const deferredTasks: Array<() => Promise<unknown>> = [
      fetchCodexAccounts,
      fetchCodexCurrent,
    ];

    const loadDeferredPlatforms = () => {
      if (disposed) {
        return;
      }

      let nextTaskIndex = 0;
      const runNextBatch = () => {
        if (disposed || nextTaskIndex >= deferredTasks.length) {
          return;
        }

        const batch = deferredTasks.slice(
          nextTaskIndex,
          nextTaskIndex + DASHBOARD_DEFERRED_PREFETCH_BATCH_SIZE,
        );
        nextTaskIndex += batch.length;

        void Promise.allSettled(batch.map((task) => task()));

        if (nextTaskIndex < deferredTasks.length) {
          deferredBatchTimer = window.setTimeout(runNextBatch, DASHBOARD_DEFERRED_PREFETCH_BATCH_DELAY_MS);
        }
      };

      runNextBatch();
    };

    if (!dashboardStartupPrefetched) {
      dashboardStartupPrefetched = true;
      deferredTimer = window.setTimeout(loadDeferredPlatforms, DASHBOARD_DEFERRED_PREFETCH_DELAY_MS);
    }

    return () => {
      disposed = true;
      if (deferredTimer !== null) {
        window.clearTimeout(deferredTimer);
      }
      if (deferredBatchTimer !== null) {
        window.clearTimeout(deferredBatchTimer);
      }
    };
  }, []);

  React.useEffect(() => {
    void fetchAgCurrent(antigravityRuntimeTarget);
  }, [antigravityRuntimeTarget, fetchAgCurrent]);

  const platformCounts = useMemo<Record<PlatformId, number>>(() => {
    return {
      antigravity: agAccounts.length,
      antigravity_ide: agAccounts.length,
      codex: codexAccounts.length,
      codex_api_service: 0,
    };
  }, [agAccounts.length, codexAccounts.length]);

  const stats = useMemo(() => {
    return {
      total: agAccounts.length + codexAccounts.length,
      antigravity: agAccounts.length,
      codex: codexAccounts.length,
    };
  }, [agAccounts.length, codexAccounts.length]);

  const dashboardAvailableTags = useMemo(() => {
    const tagSet = new Set<string>();
    const allAccounts = [
      ...agAccounts,
      ...codexAccounts,
    ];
    for (const acc of allAccounts) {
      if (acc.tags) {
        for (const tag of acc.tags) {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [agAccounts, codexAccounts]);

  // Refresh States
  const [refreshing, setRefreshing] = React.useState<Set<string>>(new Set());
  const [codexApiUsageMap, setCodexApiUsageMap] = React.useState<Record<string, {
    loading: boolean;
    summary?: ModelProviderUsageSummary;
    error?: string;
    unavailable?: boolean;
    updatedAt?: number;
  }>>(() => readCodexApiKeyUsageCache());
  const [cardRefreshing, setCardRefreshing] = React.useState<{
    ag: boolean;
    codex: boolean;
  }>({
    ag: false,
    codex: false,
  });

  // Refresh Handlers
  const handleRefreshAg = async (accountId: string) => {
    if (refreshing.has(accountId)) return;
    setRefreshing(prev => new Set(prev).add(accountId));
    try {
      await useAccountStore.getState().refreshQuota(accountId, antigravityRuntimeTarget);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(prev => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  };

  const handleRefreshCodex = async (accountId: string) => {
    if (refreshing.has(accountId)) return;
    setRefreshing(prev => new Set(prev).add(accountId));
    try {
      await useCodexAccountStore.getState().refreshQuota(accountId);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(prev => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  };

  const refreshCodexApiUsage = useCallback(async (
    account: CodexAccount,
    options?: { force?: boolean },
  ) => {
    if (
      isCodexChatCompletionsApiKeyAccount(account) &&
      !isDeepSeekAccount(account)
    ) {
      return;
    }
    const apiKey = (account.openai_api_key || '').trim();
    const baseUrl = (account.api_base_url || '').trim();
    if (!apiKey || !baseUrl) return;
    setCodexApiUsageMap((prev) => ({
      ...prev,
      [account.id]: {
        ...prev[account.id],
        loading: true,
        error: undefined,
        unavailable: false,
      },
    }));
    try {
      await refreshCodexApiKeyUsageForAccounts([account], {
        force: options?.force,
      });
      const usageState = readCodexApiKeyUsageCache()[account.id];
      setCodexApiUsageMap((prev) => ({
        ...prev,
        [account.id]: {
          ...usageState,
          loading: false,
        },
      }));
    } catch (error) {
      setCodexApiUsageMap((prev) => ({
        ...prev,
        [account.id]: {
          loading: false,
          summary: prev[account.id]?.summary,
          error: isModelProviderUsageUnavailableError(error)
            ? undefined
            : String(error).replace(/^Error:\s*/, ''),
          unavailable: isModelProviderUsageUnavailableError(error),
          updatedAt: Date.now(),
        },
      }));
    }
  }, []);

  React.useEffect(() => {
    const syncUsageCache = () => {
      const cache = readCodexApiKeyUsageCache();
      setCodexApiUsageMap((previous) => ({ ...previous, ...cache }));
    };
    window.addEventListener(CODEX_API_KEY_USAGE_REFRESHED_EVENT, syncUsageCache);
    return () =>
      window.removeEventListener(
        CODEX_API_KEY_USAGE_REFRESHED_EVENT,
        syncUsageCache,
      );
  }, []);

  const handleRefreshAgCard = async () => {
    if (cardRefreshing.ag) return;
    setCardRefreshing(prev => ({ ...prev, ag: true }));
    try {
      const targetAccounts = [agCurrentAccount, agRecommended].filter((a): a is Account => Boolean(a));
      for (const account of targetAccounts) {
        await useAccountStore.getState().refreshQuota(account.id, antigravityRuntimeTarget);
      }
    } catch (error) {
      console.error('Card refresh failed:', error);
    } finally {
      setCardRefreshing(prev => ({ ...prev, ag: false }));
    }
  };

  // Antigravity Recommendation Logic
  const agRecommended = useMemo(() => {
    if (agAccounts.length <= 1) return null;
    const currentId = agCurrentAccount?.id;

    const others = agAccounts.filter((a) => {
      if (a.id === currentId) return false;
      if (a.disabled) return false;
      if (a.quota?.is_forbidden) return false;
      if (!a.quota?.models || a.quota.models.length === 0) return false;
      return true;
    });
    if (others.length === 0) return null;

    return others.reduce((prev, curr) => {
      const getScore = (acc: Account) => {
        if (!acc.quota?.models) return -1;
        const total = acc.quota.models.reduce((sum, m) => sum + m.percentage, 0);
        return total / acc.quota.models.length;
      };

      return getScore(curr) > getScore(prev) ? curr : prev;
    });
  }, [agAccounts, agCurrentAccount?.id]);

  // Codex Recommendation Logic
  const codexRecommended = useMemo(() => {
    if (codexAccounts.length <= 1) return null;
    const currentId = codexCurrentAccount?.id;

    const others = codexAccounts.filter((a) => {
      if (a.id === currentId) return false;
      if (isCodexChatCompletionsApiKeyAccount(a) && !isDeepSeekAccount(a)) {
        return false;
      }
      if (!a.quota) return false;
      return true;
    });
    if (others.length === 0) return null;

    return others.reduce((prev, curr) => {
      const getScore = (acc: CodexAccount) => {
        if (!acc.quota) return -1;
        const windows = getCodexQuotaWindows(acc.quota);
        return windows.reduce((sum, window) => sum + window.percentage, 0) / windows.length;
      };
      return getScore(curr) > getScore(prev) ? curr : prev;
    });
  }, [codexAccounts, codexCurrentAccount?.id]);

  const codexCardRefreshTargets = useMemo(() => {
    const deduped = new Map<string, CodexAccount>();
    [codexCurrentAccount, codexRecommended].forEach((account) => {
      if (
        !account ||
        (isCodexChatCompletionsApiKeyAccount(account) &&
          !isDeepSeekAccount(account))
      ) {
        return;
      }
      deduped.set(account.id, account);
    });
    return Array.from(deduped.values());
  }, [codexCurrentAccount, codexRecommended]);

  const canRefreshCodexCard = codexCardRefreshTargets.length > 0;

  const handleRefreshCodexCard = async () => {
    if (cardRefreshing.codex || !canRefreshCodexCard) return;
    setCardRefreshing(prev => ({ ...prev, codex: true }));
    try {
      for (const account of codexCardRefreshTargets) {
        if (isCodexApiKeyAccount(account) && !isCodexNewApiAccount(account)) {
          await refreshCodexApiUsage(account);
        } else {
          await useCodexAccountStore.getState().refreshQuota(account.id);
        }
      }
    } catch (error) {
      console.error('Card refresh failed:', error);
    } finally {
      setCardRefreshing(prev => ({ ...prev, codex: false }));
    }
  };

  const renderPresentationQuotaItems = (
    presentation: UnifiedAccountPresentation,
    limit = 3,
  ) => {
    const quotaItems = presentation.quotaItems.slice(0, Math.max(0, limit));
    if (quotaItems.length === 0) {
      return <span className="no-data-text">{t('dashboard.noData', '暂无数据')}</span>;
    }

    return (
      <div className="account-mini-quotas">
        {quotaItems.map((item) => (
          <div key={item.key} className="mini-quota-row-stacked">
            <div className="mini-quota-header">
              <span className="model-name">{item.label}</span>
              <span className={`model-pct ${item.quotaClass}`}>{item.valueText}</span>
            </div>
            <div className="mini-progress-track">
              <div
                className={`mini-progress-bar ${item.quotaClass}`}
                style={{ width: `${item.percentage}%` }}
              />
            </div>
            {item.resetText && (
              <div className="mini-reset-time">
                {item.resetText}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderUnifiedAccountCard = ({
    presentation,
    onRefresh,
    onSwitch,
    isRefreshing,
    isSwitching,
    extraContent,
    onEditTags,
    maxMetrics = 3,
  }: {
    presentation: UnifiedAccountPresentation;
    onRefresh: () => void;
    onSwitch: () => void;
    isRefreshing: boolean;
    isSwitching: boolean;
    extraContent?: React.ReactNode;
    onEditTags?: () => void;
    maxMetrics?: number;
  }) => {
    return (
      <div className="account-mini-card">
        <div className="account-mini-header">
          <div className="account-info-row">
            <span className="account-email" title={maskAccountText(presentation.displayName)}>
              {maskAccountText(presentation.displayName)}
            </span>
            <span className={`tier-badge ${presentation.planClass}`}>{presentation.planLabel}</span>
          </div>
        </div>

        {renderPresentationQuotaItems(presentation, maxMetrics)}
        {extraContent}

        <div className="account-mini-actions icon-only-row">
          {onEditTags && (
            <button
              className="mini-icon-btn"
              onClick={onEditTags}
              title={t('accounts.editTags', '编辑标签')}
            >
              <Tag size={14} />
            </button>
          )}
          <button
            className="mini-icon-btn"
            onClick={onRefresh}
            title={t('common.refresh', '刷新')}
            disabled={isRefreshing}
          >
            <RotateCw size={14} className={isRefreshing ? 'loading-spinner' : ''} />
          </button>
          <button
            className="mini-icon-btn"
            onClick={onSwitch}
            title={t('dashboard.switch', '切换')}
            disabled={isSwitching}
          >
            <Play size={14} />
          </button>
        </div>
      </div>
    );
  };

  const renderAgAccountContent = (account: Account | null) => {
    if (!account) return <div className="empty-slot">{t('dashboard.noAccount', '无账号')}</div>;

    const presentation = buildAntigravityAccountPresentation(account, agDisplayGroups, t);
    const quotaDisplayItems = presentation.quotaItems.slice(0, 5);

    return (
      <div className="account-mini-card">
        <div className="account-mini-header">
          <div className="account-info-row">
            <span className="account-email" title={maskAccountText(presentation.displayName)}>
              {maskAccountText(presentation.displayName)}
            </span>
            <span className={`tier-badge ${presentation.planClass}`}>{presentation.planLabel}</span>
          </div>
        </div>

        <div className="account-mini-quotas">
          {quotaDisplayItems.map((item) => (
            <div key={item.key} className="mini-quota-row-stacked">
              <div className="mini-quota-header">
                <span className="model-name">{item.label}</span>
                <span className={`model-pct ${item.quotaClass}`}>{item.valueText}</span>
              </div>
              <div className="mini-progress-track">
                <div
                  className={`mini-progress-bar ${item.quotaClass}`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
              {item.resetText && (
                <div className="mini-reset-time">
                  {item.resetText}
                </div>
              )}
            </div>
          ))}
          {quotaDisplayItems.length === 0 && <span className="no-data-text">{t('dashboard.noData', '暂无数据')}</span>}
        </div>

        <div className="account-mini-actions icon-only-row">
          <button
            className="mini-icon-btn"
            onClick={() => setTagModalState({ accountId: account.id, platform: 'antigravity', tags: account.tags || [] })}
            title={t('accounts.editTags', '编辑标签')}
          >
            <Tag size={14} />
          </button>
          <button
            className="mini-icon-btn"
            onClick={() => handleRefreshAg(account.id)}
            title={t('common.refresh', '刷新')}
            disabled={refreshing.has(account.id)}
          >
            <RotateCw size={14} className={refreshing.has(account.id) ? 'loading-spinner' : ''} />
          </button>
          <button
            className="mini-icon-btn"
            onClick={() => switchAgAccount(account.id, antigravityRuntimeTarget)}
            title={t('dashboard.switch', '切换')}
          >
            <Play size={14} />
          </button>
        </div>
      </div>
    );
  };

  const renderCodexAccountContent = (account: CodexAccount | null) => {
    if (!account) return <div className="empty-slot">{t('dashboard.noAccount', '无账号')}</div>;

    if (isCodexApiKeyAccount(account) && !isCodexNewApiAccount(account)) {
      const isChatCompletionsApiKey =
        isCodexChatCompletionsApiKeyAccount(account);
      const usageState = codexApiUsageMap[account.id];
      const usageSummary = usageState?.summary;
      const usageMode = resolveDashboardCodexApiUsageMode(usageSummary);
      const formatMiniUsageMoney = (
        value?: number | null,
        unit?: string | null,
      ) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
        const normalized = (unit || 'CNY').trim();
        if (normalized === 'USD') return `$${value.toFixed(2)}`;
        if (normalized === 'CNY') return `¥${value.toFixed(2)}`;
        return `${value.toFixed(2)} ${normalized}`;
      };
      const deepSeekDetailValue = (key: string) => {
        const item = usageSummary?.details?.find((detail) => detail.key === key);
        return item?.value || '-';
      };
      const newApiQuota = resolveNewApiQuotaSnapshot(usageSummary);
      const newApiGranted = newApiQuota.granted;
      const newApiAvailable = newApiQuota.available;
      const newApiExpiresAt = newApiQuota.expiresAt;
      const isUnlimited = usageSummary?.quotaUnlimited === true;
      const progressPercent =
        usageMode === 'new_api' && newApiGranted != null && newApiAvailable != null && newApiGranted > 0
          ? Math.max(0, Math.min(100, Math.round(((newApiGranted - newApiAvailable) / newApiGranted) * 100)))
          : isUnlimited
            ? 100
            : 0;

      return (
        <div className={`account-mini-card codex-api-mini-card ${account.api_provider_id ? "sponsor-api-account" : ""}`}>
          <div className="account-mini-header">
            <div className="account-info-row">
              <span className="account-email" title={resolveCodexAccountDisplayName(account, t("common.apiKeyAccount"))}>
                {resolveCodexAccountDisplayName(account, t("common.apiKeyAccount"))}
              </span>
              <span className="tier-badge sponsor-api">
                {(account.api_provider_name || 'API_KEY').toUpperCase()}
              </span>
            </div>
          </div>

          {(!isChatCompletionsApiKey || isDeepSeekAccount(account)) && (
            <div className="account-mini-quotas codex-api-mini-quotas">
              {usageMode === 'new_api' ? (
                <div className="mini-quota-row-stacked">
                  <div className="mini-quota-header">
                    <span className="model-name">{t('codex.cockpitApi.balance', '额度')}</span>
                    <span className="model-pct high">
                      {isUnlimited
                        ? t('codex.newApi.quota.unlimited', '不限量')
                        : newApiAvailable != null && newApiGranted != null
                          ? `$${newApiAvailable.toFixed(2)} / $${newApiGranted.toFixed(2)}`
                          : '-'}
                    </span>
                  </div>
                  <div className="mini-progress-track">
                    <div
                      className="mini-progress-bar high"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="mini-reset-time">
                    {newApiExpiresAt != null && newApiExpiresAt > 0
                      ? `${t('codex.modelProviders.usage.fields.expiresAt', '过期时间')} ${new Date(newApiExpiresAt * 1000).toLocaleDateString()}`
                      : t('dashboard.noData', '暂无数据')}
                  </div>
                </div>
              ) : usageMode === 'sub2api' ? (
                <div className="codex-api-mini-stats">
                  <div className="codex-api-mini-stat">
                    <span>{t('codex.modelProviders.usage.accountBalance', '账户余额')}</span>
                    <strong>{typeof usageSummary?.balance === 'number' || typeof usageSummary?.remaining === 'number' ? `$${(usageSummary?.remaining ?? usageSummary?.balance ?? 0).toFixed(2)}` : '-'}</strong>
                  </div>
                  <div className="codex-api-mini-stat">
                    <span>{t('codex.modelProviders.usage.fields.todayRequests', '今日请求')}</span>
                    <strong>{usageSummary?.todayRequests ?? '-'}</strong>
                  </div>
                  <div className="codex-api-mini-stat">
                    <span>{t('codex.modelProviders.usage.fields.todayTokens', '今日 Token')}</span>
                    <strong>{typeof usageSummary?.todayTotalTokens === 'number' ? usageSummary.todayTotalTokens.toLocaleString('en-US') : '-'}</strong>
                  </div>
                </div>
              ) : usageMode === 'deepseek' ? (
                <div className="codex-api-mini-stats">
                  <div className="codex-api-mini-stat">
                    <span>{t('codex.modelProviders.usage.fields.totalBalance', '总余额')}</span>
                    <strong>{formatMiniUsageMoney(usageSummary?.balance, usageSummary?.unit)}</strong>
                  </div>
                  <div className="codex-api-mini-stat">
                    <span>{t('codex.modelProviders.usage.fields.grantedBalance', '赠金余额')}</span>
                    <strong>{deepSeekDetailValue('grantedBalance')}</strong>
                  </div>
                  <div className="codex-api-mini-stat">
                    <span>{t('codex.modelProviders.usage.fields.toppedUpBalance', '充值余额')}</span>
                    <strong>{deepSeekDetailValue('toppedUpBalance')}</strong>
                  </div>
                </div>
              ) : (
                <span className="no-data-text">{t('dashboard.noData', '暂无数据')}</span>
              )}
            </div>
          )}

          <div className="account-mini-actions icon-only-row">
            {(!isChatCompletionsApiKey || isDeepSeekAccount(account)) && (
              <button
                className="mini-icon-btn"
                onClick={() => void refreshCodexApiUsage(account, { force: true })}
                title={t('common.refresh', '刷新')}
                disabled={refreshing.has(account.id) || usageState?.loading}
              >
                <RotateCw size={14} className={refreshing.has(account.id) || usageState?.loading ? 'loading-spinner' : ''} />
              </button>
            )}
            <button
              className="mini-icon-btn"
              onClick={() => switchCodexAccount(account.id)}
              title={t('dashboard.switch', '切换')}
            >
              <Play size={14} />
            </button>
          </div>
        </div>
      );
    }

    const presentation = buildCodexAccountPresentation(account, t);
    return renderUnifiedAccountCard({
      presentation,
      onRefresh: () => handleRefreshCodex(account.id),
      onSwitch: () => switchCodexAccount(account.id),
      isRefreshing: refreshing.has(account.id),
      isSwitching: false,
      maxMetrics: 4,
      extraContent: !isCodexApiKeyAccount(account) && (account.quota?.reset_credits_available ?? 0) > 0 ? (
        <div className="account-mini-reset-credits">
          <CodexResetCreditExpiry key={account.id} accountId={account.id} quota={account.quota}
            disabled={refreshing.has(account.id)} onClick={() => onNavigate('codex')} />
        </div>
      ) : undefined,
      onEditTags: () => setTagModalState({ accountId: account.id, platform: 'codex', tags: account.tags || [] }),
    });
  };

  React.useEffect(() => {
    const targetAccounts = [codexCurrentAccount, codexRecommended].filter(
      (account): account is CodexAccount =>
        Boolean(account) &&
        isCodexApiKeyAccount(account!) &&
        !isCodexNewApiAccount(account!) &&
        (!isCodexChatCompletionsApiKeyAccount(account!) ||
          isDeepSeekAccount(account!)),
    );
    targetAccounts.forEach((account) => {
      const usageState = codexApiUsageMap[account.id];
      if (
        usageState?.loading ||
        usageState?.summary ||
        usageState?.unavailable ||
        usageState?.error ||
        usageState?.updatedAt !== undefined
      ) {
        return;
      }
      void refreshCodexApiUsage(account, { force: false });
    });
  }, [codexApiUsageMap, codexCurrentAccount, codexRecommended, refreshCodexApiUsage]);

  const entryCounts = useMemo(() => {
    const result = new Map<DashboardEntryId, number>();
    for (const entryId of visibleEntryOrder) {
      const entryPlatformIds = resolveEntryPlatformIds(entryId, platformGroups);
      const countedPlatformIds = new Set<PlatformId>();
      const count = entryPlatformIds.reduce((sum, rawPlatformId) => {
        const countPlatformId = normalizeDashboardCardPlatformId(rawPlatformId);
        if (countedPlatformIds.has(countPlatformId)) {
          return sum;
        }
        if (remoteHiddenPlatformSet.has(countPlatformId)) {
          return sum;
        }
        countedPlatformIds.add(countPlatformId);
        return sum + (platformCounts[countPlatformId] ?? 0);
      }, 0);
      result.set(entryId, count);
    }
    return result;
  }, [visibleEntryOrder, platformGroups, platformCounts, remoteHiddenPlatformSet]);

  const visibleDashboardCardIds = useMemo(() => {
    const seen = new Set<PlatformId>();
    const result: PlatformId[] = [];
    for (const entryId of visibleDashboardEntryOrder) {
      if (entryId === API_RELAY_LAYOUT_ENTRY_ID) {
        continue;
      }
      const entryPlatformIds = resolveEntryPlatformIds(entryId, platformGroups).filter(
        (candidate) => !remoteHiddenPlatformSet.has(candidate),
      );
      if (entryPlatformIds.length === 0) {
        continue;
      }
      const defaultPlatformId = resolveEntryDefaultPlatformId(entryId, platformGroups);
      const preferredPlatformId =
        defaultPlatformId && entryPlatformIds.includes(defaultPlatformId)
          ? defaultPlatformId
          : entryPlatformIds[0];
      const platformId =
        preferredPlatformId && isAccountPlatform(preferredPlatformId)
          ? preferredPlatformId
          : entryPlatformIds.find((candidate) => isAccountPlatform(candidate));
      if (!platformId) {
        continue;
      }
      const normalizedPlatformId = normalizeDashboardCardPlatformId(platformId);
      if (seen.has(normalizedPlatformId)) {
        continue;
      }
      seen.add(normalizedPlatformId);
      result.push(normalizedPlatformId);
    }
    return result;
  }, [platformGroups, remoteHiddenPlatformSet, visibleDashboardEntryOrder]);

  const isSinglePlatformMode = visibleDashboardCardIds.length === 1;
  const cardRows = useMemo(() => {
    const rows: PlatformId[][] = [];
    for (let i = 0; i < visibleDashboardCardIds.length; i += 2) {
      rows.push(visibleDashboardCardIds.slice(i, i + 2));
    }
    return rows;
  }, [visibleDashboardCardIds]);

  const handleHidePlatformCard = useCallback((platformId: PlatformId) => {
    const entryId = orderedEntryIds.find(
      (candidate) => resolveEntryPlatformIds(candidate, platformGroups).includes(platformId),
    );
    if (!entryId) {
      return;
    }
    setHiddenEntry(entryId, true);
  }, [orderedEntryIds, platformGroups, setHiddenEntry]);

  const renderHideCardButton = (platformId: PlatformId) => (
    <button
      className="header-action-btn header-icon-btn"
      onClick={() => handleHidePlatformCard(platformId)}
      title={t('accounts.compact.hide', '隐藏')}
      aria-label={t('accounts.compact.hide', '隐藏')}
    >
      <EyeOff size={14} />
    </button>
  );

  const renderPlatformCard = (platformId: PlatformId) => {
    if (!isAccountPlatform(platformId)) {
      return null;
    }
    if (platformId === 'antigravity' || platformId === 'antigravity_ide') {
      return (
        <div className="main-card antigravity-card" key={platformId}>
          <div className="main-card-header">
            <div className="header-title">
              <RobotIcon className="" style={{ width: 18, height: 18 }} />
              <h3>{getPlatformLabel(platformId, t)}</h3>
            </div>
            <div className="header-action-group">
              <button
                className="header-action-btn"
                onClick={handleRefreshAgCard}
                disabled={cardRefreshing.ag}
                title={t('common.refresh', '刷新')}
              >
                <RotateCw size={14} className={cardRefreshing.ag ? 'loading-spinner' : ''} />
                <span>{t('common.refresh', '刷新')}</span>
              </button>
              {renderHideCardButton(platformId)}
            </div>
          </div>

          <div className="split-content">
            <div className="split-half current-half">
              <span className="half-label"><CheckCircle2 size={12} /> {t('dashboard.current', '当前账户')}</span>
              {renderAgAccountContent(agCurrentAccount)}
            </div>

            <div className="split-divider"></div>

            <div className="split-half recommend-half">
              <span className="half-label"><Sparkles size={12} /> {t('dashboard.recommended', '推荐账号')}</span>
              {agRecommended ? (
                renderAgAccountContent(agRecommended)
              ) : (
                <div className="empty-slot-text">{t('dashboard.noRecommendation', '暂无更好推荐')}</div>
              )}
            </div>
          </div>

          <button className="card-footer-action" onClick={() => onNavigate('overview')}>
            {t('dashboard.viewAllAccounts', '查看所有账号')}
          </button>
        </div>
      );
    }

    if (platformId === 'codex' || platformId === 'codex_api_service') {
      return (
        <div className="main-card codex-card" key={platformId}>
          <div className="main-card-header">
            <div className="header-title">
              <CodexIcon size={18} />
              <h3>{getPlatformLabel(platformId, t)}</h3>
            </div>
            <div className="header-action-group">
              <button
                className="header-action-btn"
                onClick={handleRefreshCodexCard}
                disabled={cardRefreshing.codex || !canRefreshCodexCard}
                title={t('common.refresh', '刷新')}
              >
                <RotateCw size={14} className={cardRefreshing.codex ? 'loading-spinner' : ''} />
                <span>{t('common.refresh', '刷新')}</span>
              </button>
              {renderHideCardButton(platformId)}
            </div>
          </div>

          <div className="split-content">
            <div className="split-half current-half">
              <span className="half-label"><CheckCircle2 size={12} /> {t('dashboard.current', '当前账户')}</span>
              {renderCodexAccountContent(codexCurrentAccount)}
            </div>

            <div className="split-divider"></div>

            <div className="split-half recommend-half">
              <span className="half-label"><Sparkles size={12} /> {t('dashboard.recommended', '推荐账号')}</span>
              {codexRecommended ? (
                renderCodexAccountContent(codexRecommended)
              ) : (
                <div className="empty-slot-text">{t('dashboard.noRecommendation', '暂无更好推荐')}</div>
              )}
            </div>
          </div>

          <button className="card-footer-action" onClick={() => onNavigate('codex')}>
            {t('dashboard.viewAllAccounts', '查看所有账号')}
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <main className="main-content dashboard-page fade-in">
      <div className="page-tabs-row" style={{ minHeight: '60px' }}>
        <div className="page-tabs-label dashboard-title-label">
          <span>{t('nav.dashboard', '仪表盘')}</span>
          <ManualHelpIconButton className="header-action-btn dashboard-manual-btn dashboard-title-manual-btn" />
        </div>
        <div className="dashboard-top-actions">
          <button className="header-action-btn" onClick={onOpenPlatformLayout}>
            <span>{t('platformLayout.title', '平台布局')}</span>
          </button>
          <AnnouncementCenter onNavigate={onNavigate} variant="inline" trigger="button" />
        </div>
      </div>

      {/* Top Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon-bg primary"><Users size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">{t('dashboard.totalAccounts', '账号总数')}</span>
            <span className="stat-value">{stats.total}</span>
          </div>
        </div>

        {visibleDashboardEntryOrder.map((entryId) => {
          if (entryId === API_RELAY_LAYOUT_ENTRY_ID) {
            return null;
          }

          const entryPlatformIds = resolveEntryPlatformIds(entryId, platformGroups).filter(
            (candidate) => !remoteHiddenPlatformSet.has(candidate),
          );
          if (entryPlatformIds.length === 0) {
            return null;
          }
          const defaultPlatformId = resolveEntryDefaultPlatformId(entryId, platformGroups);
          const platformId =
            defaultPlatformId && entryPlatformIds.includes(defaultPlatformId)
              ? defaultPlatformId
              : entryPlatformIds[0];
          if (!platformId) {
            return null;
          }
          const groupId = parseGroupEntryId(entryId);
          const group = groupId ? platformGroups.find((item) => item.id === groupId) : null;
          const groupChildLabels = group
            ? group.platformIds.filter((childPlatformId) => !remoteHiddenPlatformSet.has(childPlatformId)).map((childPlatformId) =>
              resolveGroupChildName(group, childPlatformId, getPlatformLabel(childPlatformId, t)),
            )
            : [];
          const groupExtraCount = Math.max(groupChildLabels.length - 1, 0);
          const groupTooltip = groupChildLabels.join(', ');
          const label = group
            ? group.name
            : getPlatformLabel(platformId, t);
          const iconClass =
            platformId === 'antigravity' || platformId === 'antigravity_ide'
              ? 'success'
              : 'info';
          return (
            <button
              className="stat-card stat-card-button"
              key={entryId}
              onClick={() => navigateToPlatform(platformId)}
              title={
                groupExtraCount > 0
                  ? `${t('dashboard.switchTo', '切换到此账号')} · ${groupTooltip}`
                  : t('dashboard.switchTo', '切换到此账号')
              }
            >
              {groupExtraCount > 0 && (
                <span className="stat-group-more-badge stat-group-more-badge-corner" title={groupTooltip} aria-label={groupTooltip}>
                  +{groupExtraCount}
                </span>
              )}
              <div
                className={`stat-icon-bg ${iconClass}`}
              >
                {group?.iconKind === 'custom' && group.iconCustomDataUrl ? (
                  <img
                    src={group.iconCustomDataUrl}
                    alt={label}
                    className="dashboard-group-icon"
                    style={{ width: 24, height: 24 }}
                  />
                ) : (
                  renderPlatformIcon(group?.iconPlatformId ?? platformId, 24)
                )}
              </div>
              <div className="stat-info">
                <span className="stat-label">{label}</span>
                <span className="stat-value">{entryCounts.get(entryId) ?? 0}</span>
              </div>
            </button>
          );
        })}

      </div>

      {/* Main Comparison Section */}
      <div className="cards-section">
        {cardRows.map((row, rowIndex) => (
          <div
            className={`cards-split-row${isSinglePlatformMode ? ' single-platform-row' : ''}`}
            key={`row-${rowIndex}`}
          >
            {row.map((cardId) => (
              renderPlatformCard(cardId)
            ))}
            {!isSinglePlatformMode && row.length < 2 && <div className="main-card main-card-placeholder" />}
          </div>
        ))}
      </div>

      {tagModalState && (
        <TagEditModal
          isOpen={true}
          onClose={() => setTagModalState(null)}
          initialTags={tagModalState.tags}
          availableTags={dashboardAvailableTags}
          onSave={handleSaveTags}
        />
      )}

    </main>
  );
}
