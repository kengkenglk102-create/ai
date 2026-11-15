import { Page } from './navigation';

export type PlatformId =
  | 'antigravity'
  | 'antigravity_ide'
  | 'codex'
  | 'codex_api_service';

export const ALL_PLATFORM_IDS: PlatformId[] = [
  'codex',
  'codex_api_service',
  'antigravity',
  'antigravity_ide',
];

/** Platforms that do not own account lists (service / feature pages). */
export const ACCOUNTLESS_PLATFORM_IDS: readonly PlatformId[] = ['codex_api_service'];

export function isAccountPlatform(platformId: PlatformId): boolean {
  return !ACCOUNTLESS_PLATFORM_IDS.includes(platformId);
}

export const MENU_HIDDEN_PLATFORM_IDS: PlatformId[] = [];

export const MENU_VISIBLE_PLATFORM_IDS: PlatformId[] = ALL_PLATFORM_IDS.filter(
  (platformId) => !MENU_HIDDEN_PLATFORM_IDS.includes(platformId),
);

export function isMenuVisiblePlatform(platformId: PlatformId): boolean {
  return ALL_PLATFORM_IDS.includes(platformId) && !MENU_HIDDEN_PLATFORM_IDS.includes(platformId);
}

export const PLATFORM_PAGE_MAP: Record<PlatformId, Page> = {
  antigravity: 'overview',
  antigravity_ide: 'overview',
  codex: 'codex',
  codex_api_service: 'codex-api-service',
};
