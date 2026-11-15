import { useCallback, useEffect, useState } from 'react';

const ANTIGRAVITY_HIDDEN_QUOTA_KEYS_STORAGE_KEY = 'agtools.antigravity_hidden_quota_keys';

export const ANTIGRAVITY_QUOTA_VISIBILITY_CHANGED_EVENT =
  'agtools:antigravity-quota-visibility-changed';

export const ANTIGRAVITY_QUOTA_BUCKET_OPTIONS = [
  { key: 'claude:5h', label: 'Claude (5h)' },
  { key: 'claude:weekly', label: 'Claude (Weekly)' },
  { key: 'gemini:5h', label: 'Gemini (5h)' },
  { key: 'gemini:weekly', label: 'Gemini (Weekly)' },
  { key: 'argon:weekly', label: 'Gemini 4 Argon (Weekly)' },
] as const;

/** By default, hide Claude/GPT-OSS quota bars until the user explicitly enables them. */
export const DEFAULT_HIDDEN_ANTIGRAVITY_QUOTA_KEYS: readonly string[] = [
  'claude:5h',
  'claude:weekly',
];

const VALID_ANTIGRAVITY_QUOTA_KEYS = new Set<string>(
  ANTIGRAVITY_QUOTA_BUCKET_OPTIONS.map((option) => option.key),
);

function normalizeHiddenKeys(keys: Iterable<string>): string[] {
  const unique = new Set<string>();
  for (const key of keys) {
    if (VALID_ANTIGRAVITY_QUOTA_KEYS.has(key)) {
      unique.add(key);
    }
  }
  return ANTIGRAVITY_QUOTA_BUCKET_OPTIONS
    .map((option) => option.key)
    .filter((key) => unique.has(key));
}

export function getHiddenAntigravityQuotaKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(ANTIGRAVITY_HIDDEN_QUOTA_KEYS_STORAGE_KEY);
    if (raw === null) {
      return new Set(DEFAULT_HIDDEN_ANTIGRAVITY_QUOTA_KEYS);
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(normalizeHiddenKeys(parsed.filter((item): item is string => typeof item === 'string')));
    }
  } catch {
    // ignore storage / parse errors
  }
  return new Set(DEFAULT_HIDDEN_ANTIGRAVITY_QUOTA_KEYS);
}

export function persistHiddenAntigravityQuotaKeys(keys: Iterable<string>): Set<string> {
  const normalized = normalizeHiddenKeys(keys);
  try {
    localStorage.setItem(ANTIGRAVITY_HIDDEN_QUOTA_KEYS_STORAGE_KEY, JSON.stringify(normalized));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(ANTIGRAVITY_QUOTA_VISIBILITY_CHANGED_EVENT, { detail: normalized }),
      );
    }
  } catch {
    // ignore storage write errors
  }
  return new Set(normalized);
}

export function toggleAntigravityQuotaKeyVisibility(key: string): Set<string> {
  const next = getHiddenAntigravityQuotaKeys();
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return persistHiddenAntigravityQuotaKeys(next);
}

export function setAntigravityQuotaKeyVisible(key: string, visible: boolean): Set<string> {
  const next = getHiddenAntigravityQuotaKeys();
  if (visible) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return persistHiddenAntigravityQuotaKeys(next);
}

export function filterVisibleAntigravityQuotaItems<T extends { key: string }>(
  items: readonly T[],
  hiddenKeys: ReadonlySet<string>,
): T[] {
  if (hiddenKeys.size === 0) {
    return [...items];
  }
  return items.filter((item) => !hiddenKeys.has(item.key));
}

export function useHiddenAntigravityQuotaKeys(): [Set<string>, (key: string) => void] {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => getHiddenAntigravityQuotaKeys());

  useEffect(() => {
    const sync = () => {
      setHiddenKeys(getHiddenAntigravityQuotaKeys());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ANTIGRAVITY_HIDDEN_QUOTA_KEYS_STORAGE_KEY) {
        sync();
      }
    };
    window.addEventListener(ANTIGRAVITY_QUOTA_VISIBILITY_CHANGED_EVENT, sync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(ANTIGRAVITY_QUOTA_VISIBILITY_CHANGED_EVENT, sync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const toggleKey = useCallback((key: string) => {
    setHiddenKeys(toggleAntigravityQuotaKeyVisibility(key));
  }, []);

  return [hiddenKeys, toggleKey];
}
