import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_HIDDEN_ANTIGRAVITY_QUOTA_KEYS,
  filterVisibleAntigravityQuotaItems,
  getHiddenAntigravityQuotaKeys,
  persistHiddenAntigravityQuotaKeys,
  toggleAntigravityQuotaKeyVisibility,
} from './antigravityPreferences';

function installMockWindowAndStorage() {
  const store = new Map<string, string>();
  const dispatched: string[] = [];
  const prevStorage = (globalThis as Record<string, unknown>).localStorage;
  const prevWindow = (globalThis as Record<string, unknown>).window;

  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  (globalThis as Record<string, unknown>).window = {
    dispatchEvent: (event: Event) => {
      dispatched.push(event.type);
      return true;
    },
  };

  return {
    dispatched,
    restore: () => {
      (globalThis as Record<string, unknown>).localStorage = prevStorage;
      (globalThis as Record<string, unknown>).window = prevWindow;
    },
  };
}

test('antigravity quota visibility defaults to hiding claude:5h and claude:weekly', () => {
  const env = installMockWindowAndStorage();
  try {
    const hidden = getHiddenAntigravityQuotaKeys();
    assert.deepEqual([...hidden], [...DEFAULT_HIDDEN_ANTIGRAVITY_QUOTA_KEYS]);

    const filtered = filterVisibleAntigravityQuotaItems(
      [
        { key: 'claude:5h' },
        { key: 'claude:weekly' },
        { key: 'gemini:5h' },
        { key: 'gemini:weekly' },
        { key: 'argon:weekly' },
      ],
      hidden,
    );
    assert.deepEqual(
      filtered.map((item) => item.key),
      ['gemini:5h', 'gemini:weekly', 'argon:weekly'],
    );
  } finally {
    env.restore();
  }
});

test('toggling and persisting antigravity quota visibility updates storage and dispatches event', () => {
  const env = installMockWindowAndStorage();
  try {
    const afterShowClaude5h = toggleAntigravityQuotaKeyVisibility('claude:5h');
    assert.equal(afterShowClaude5h.has('claude:5h'), false);
    assert.equal(afterShowClaude5h.has('claude:weekly'), true);
    assert.equal(env.dispatched.length, 1);

    const afterHideGemini5h = toggleAntigravityQuotaKeyVisibility('gemini:5h');
    assert.equal(afterHideGemini5h.has('gemini:5h'), true);
    assert.deepEqual([...getHiddenAntigravityQuotaKeys()], ['claude:weekly', 'gemini:5h']);

    const afterShowAll = persistHiddenAntigravityQuotaKeys([]);
    assert.equal(afterShowAll.size, 0);
    assert.deepEqual([...getHiddenAntigravityQuotaKeys()], []);
  } finally {
    env.restore();
  }
});
