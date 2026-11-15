import { useAccountStore } from '../stores/useAccountStore';
import { useCodexAccountStore } from '../stores/useCodexAccountStore';

const ALL_STORES = [
  useAccountStore,
  useCodexAccountStore,
];

export const globalRenameTag = async (oldTag: string, newTag: string) => {
  for (const store of ALL_STORES) {
    const state = store.getState() as any;
    const accounts = state.accounts || [];
    for (const account of accounts) {
      if (account.tags?.includes(oldTag)) {
        const updatedTags = account.tags.map((t: string) => (t === oldTag ? newTag : t));
        const uniqueTags = Array.from(new Set(updatedTags));
        await state.updateAccountTags(account.id, uniqueTags);
      }
    }
  }
};

export const globalDeleteTag = async (targetTag: string) => {
  for (const store of ALL_STORES) {
    const state = store.getState() as any;
    const accounts = state.accounts || [];
    for (const account of accounts) {
      if (account.tags?.includes(targetTag)) {
        const updatedTags = account.tags.filter((t: string) => t !== targetTag);
        await state.updateAccountTags(account.id, updatedTags);
      }
    }
  }
};
