import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock3, FolderOpen, Globe2, Layers, MoreHorizontal, PanelTop, Server } from 'lucide-react';
import { CodexIcon } from '../icons/CodexIcon';
import { ManualHelpIconButton } from '../ManualHelpIconButton';
import { PlatformId } from '../../types/platform';
import {
  findGroupByPlatform,
  resolveGroupChildName,
  usePlatformLayoutStore,
} from '../../stores/usePlatformLayoutStore';
import { getPlatformLabel } from '../../utils/platformMeta';
import { PlatformGroupSwitcher } from './PlatformGroupSwitcher';
import { useRemoteConfigStore } from '../../stores/useRemoteConfigStore';

export type PlatformOverviewTab =
  | 'overview'
  | 'wakeup'
  | 'instances'
  | 'sessions'
  | 'providers'
  | 'proxy'
  | 'top-layout';

export type PlatformOverviewHeaderId = 'codex';

interface PlatformOverviewTabsHeaderProps<T extends string> {
  platform: PlatformOverviewHeaderId;
  active: T;
  onTabChange?: (tab: T) => void;
  tabs?: T[];
  tabPlacement?: Partial<Record<T, 'top' | 'more'>>;
  pageRegistry?: { id: T; label: string; icon: ReactNode }[];
}

interface PlatformOverviewConfig {
  platformLabel: string;
  overviewIcon: ReactNode;
}

interface TabSpec {
  key: string;
  label: string;
  icon: ReactNode;
}

const CONFIGS: Record<PlatformOverviewHeaderId, PlatformOverviewConfig> = {
  codex: {
    platformLabel: 'Codex',
    overviewIcon: <CodexIcon className="tab-icon" />,
  },
};

export function PlatformOverviewTabsHeader<T extends string = PlatformOverviewTab>({
  platform,
  active,
  onTabChange,
  tabs,
  tabPlacement,
  pageRegistry,
}: PlatformOverviewTabsHeaderProps<T>) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const { platformGroups } = usePlatformLayoutStore();
  const remoteHiddenPlatformIds = useRemoteConfigStore((state) => state.hiddenPlatformIds);
  const config = CONFIGS[platform];
  const currentPlatformId = platform as PlatformId;
  const remoteHiddenPlatformSet = useMemo(
    () => new Set(remoteHiddenPlatformIds),
    [remoteHiddenPlatformIds],
  );
  const currentGroup = useMemo(
    () => findGroupByPlatform(platformGroups, currentPlatformId),
    [platformGroups, currentPlatformId],
  );
  const currentDisplayName = useMemo(() => {
    if (!currentGroup) return config?.platformLabel ?? getPlatformLabel(currentPlatformId, t);
    return (
      resolveGroupChildName(currentGroup, currentPlatformId, getPlatformLabel(currentPlatformId, t)) ||
      getPlatformLabel(currentPlatformId, t)
    );
  }, [currentGroup, currentPlatformId, config?.platformLabel, t]);

  const switchOptions = useMemo(() => {
    if (!currentGroup) return [];
    return currentGroup.platformIds
      .filter((id) => !remoteHiddenPlatformSet.has(id))
      .map((id) => ({
        platformId: id,
        label: resolveGroupChildName(currentGroup, id, getPlatformLabel(id, t)),
      }));
  }, [currentGroup, remoteHiddenPlatformSet, t]);

  const defaultTabs: T[] = ['overview', 'instances'] as T[];
  const tabOrder = tabs || defaultTabs;
  const tabLabels: Record<string, TabSpec> = {
    overview: {
      key: 'overview',
      label: t('navigation.overview', '总览'),
      icon: config?.overviewIcon ?? <CodexIcon className="tab-icon" />,
    },
    wakeup: {
      key: 'wakeup',
      label: t('codex.wakeup.tab', '唤醒任务'),
      icon: <Clock3 className="tab-icon" />,
    },
    instances: {
      key: 'instances',
      label: t('navigation.instances', '多开实例'),
      icon: <Layers className="tab-icon" />,
    },
    sessions: {
      key: 'sessions',
      label: t('codex.sessionManager.title', '会话管理'),
      icon: <FolderOpen className="tab-icon" />,
    },
    providers: {
      key: 'providers',
      label: t('codex.modelProviders.tab', '模型供应商'),
      icon: <Server className="tab-icon" />,
    },
    proxy: {
      key: 'proxy',
      label: t('codex.proxy.management'),
      icon: <Globe2 className="tab-icon" />,
    },
    'top-layout': {
      key: 'top-layout',
      label: t('codex.more.topLayoutTitle'),
      icon: <PanelTop className="tab-icon" />,
    },
  };
  const registry = pageRegistry ? Object.fromEntries(pageRegistry.map(page => [page.id, { key: page.id, label: page.label, icon: page.icon }])) : tabLabels;
  const tabSpecs: TabSpec[] = tabOrder.flatMap((tab) => registry[tab] ? [registry[tab]] : []);
  const visibleTabSpecs = tabSpecs.filter(
    (tab) => tabPlacement?.[tab.key as T] !== 'more',
  );
  const moreTabSpecs = tabSpecs.filter(
    (tab) => tabPlacement?.[tab.key as T] === 'more',
  );
  const hasMoreMenu = moreTabSpecs.length > 0 || platform === 'codex';

  useEffect(() => {
    if (!moreOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && !moreRef.current?.contains(target)) {
        setMoreOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  return (
    <>
      <div className="page-top-strip">
        <div className="page-top-strip-left">
          <span className="page-top-strip-label">
            {t('settings.general.accountManagement', 'Account')}
          </span>
          <ManualHelpIconButton className="platform-header-help" />
        </div>
        <div className="page-top-strip-right-placeholder" aria-hidden="true" />
      </div>
      <div className={`page-tabs-row page-tabs-center page-tabs-row-with-leading codex-page-navigation`}>
        <div className="page-tabs-leading">
          <PlatformGroupSwitcher
            currentPlatformId={currentPlatformId}
            currentLabel={currentDisplayName}
            options={switchOptions}
            currentGroupId={currentGroup?.id ?? null}
          />
        </div>
        {visibleTabSpecs.length > 0 ? (
          <div className="page-tabs filter-tabs">
            {visibleTabSpecs.map((tab) => (
              <button
                key={tab.key}
                className={`filter-tab${active === tab.key ? ' active' : ''}${tab.key.startsWith('plugin:') ? ' plugin-nav-tab' : ''}`}
                title={tab.label}
                onClick={() => onTabChange?.(tab.key as T)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        {hasMoreMenu ? (
          <div className="page-tabs-trailing" ref={moreRef}>
            <button
              type="button"
              className={`page-more-trigger${moreOpen ? ' is-open' : ''}${moreTabSpecs.some((tab) => tab.key === active) ? ' is-active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              disabled={moreTabSpecs.length === 0}
              onClick={() => setMoreOpen((previous) => !previous)}
            >
              <MoreHorizontal size={18} />
              <span>{t('codex.more.title', '更多')}</span>
            </button>
            {moreOpen ? (
              <div className="page-more-menu" role="menu">
                {moreTabSpecs.map((tab) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={tab.key}
                    className={`page-more-menu-item${active === tab.key ? ' active' : ''}${tab.key.startsWith('plugin:') ? ' plugin-nav-tab' : ''}`}
                    title={tab.label}
                    onClick={() => {
                      onTabChange?.(tab.key as T);
                      setMoreOpen(false);
                    }}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="page-tabs-trailing-placeholder" aria-hidden="true" />
        )}
      </div>
    </>
  );
}
