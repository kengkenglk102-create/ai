import type { Account } from '../types/account';
import type { CodexAccount } from '../types/codex';

type TimestampedAccount = {
  id: string;
  last_used?: number | null;
  created_at?: number | null;
};

export function resolveCurrentOrMostRecentAccount<T extends TimestampedAccount>(
  accounts: T[],
  currentId: string | null | undefined,
): T | null {
  if (accounts.length === 0) return null;
  if (currentId) {
    const current = accounts.find((account) => account.id === currentId);
    if (current) return current;
  }
  return accounts.reduce((prev, curr) => {
    const prevScore = prev.last_used || prev.created_at || 0;
    const currScore = curr.last_used || curr.created_at || 0;
    return currScore > prevScore ? curr : prev;
  });
}

export function getRecommendedAntigravityAccount(
  accounts: Account[],
  currentId: string | null | undefined,
): Account | null {
  if (accounts.length <= 1) return null;
  const others = accounts.filter((account) => {
    if (account.id === currentId) return false;
    if (account.disabled) return false;
    if (account.quota?.is_forbidden) return false;
    if (!account.quota?.models || account.quota.models.length === 0) return false;
    return true;
  });
  if (others.length === 0) return null;

  const getScore = (account: Account) => {
    if (!account.quota?.models) return -1;
    const total = account.quota.models.reduce((sum, model) => sum + model.percentage, 0);
    return total / account.quota.models.length;
  };

  return others.reduce((best, candidate) => (
    getScore(candidate) > getScore(best) ? candidate : best
  ));
}

export function getRecommendedCodexAccount(
  accounts: CodexAccount[],
  currentId: string | null | undefined,
): CodexAccount | null {
  if (accounts.length <= 1) return null;
  const others = accounts.filter((account) => account.id !== currentId && Boolean(account.quota));
  if (others.length === 0) return null;

  const getScore = (account: CodexAccount) => {
    if (!account.quota) return -1;
    return (account.quota.hourly_percentage + account.quota.weekly_percentage) / 2;
  };

  return others.reduce((best, candidate) => (
    getScore(candidate) > getScore(best) ? candidate : best
  ));
}
