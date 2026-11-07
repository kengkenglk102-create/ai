import { ReactNode } from 'react';
import { TFunction } from 'i18next';
import { PlatformId } from '../types/platform';
import { AntigravityIcon } from '../components/icons/AntigravityIcon';
import { AntigravityIdeIcon } from '../components/icons/AntigravityIdeIcon';
import { CodexIcon } from '../components/icons/CodexIcon';

export function getPlatformLabel(platformId: PlatformId, _t: TFunction): string {
  switch (platformId) {
    case 'antigravity':
      return 'Antigravity';
    case 'antigravity_ide':
      return 'Antigravity IDE';
    case 'codex':
      return 'Codex';
    case 'codex_api_service':
      return _t('codex.apiService.navTitle', 'Codex API Service');
    default:
      return platformId;
  }
}

export function renderPlatformIcon(platformId: PlatformId, size = 20): ReactNode {
  switch (platformId) {
    case 'antigravity':
      return <AntigravityIcon style={{ width: size, height: size }} />;
    case 'antigravity_ide':
      return <AntigravityIdeIcon style={{ width: size, height: size }} />;
    case 'codex':
      return <CodexIcon size={size} />;
    case 'codex_api_service':
      return <CodexIcon size={size} />;
    default:
      return null;
  }
}
