import { invoke } from '@tauri-apps/api/core';
import { normalizeLanguage } from '../i18n';
import * as accountService from '../services/accountService';
import { AutoSwitchAccountScopeSelector } from '../components/AutoSwitchAccountScopeSelector';
import { UI_SCALE_OPTION_STRINGS as UI_SCALE_OPTIONS } from '../utils/uiScale';
import { SettingsAccountTransferSection } from '../components/SettingsAccountTransferSection';
import type { SideNavLayoutMode } from '../stores/useSideNavLayoutStore';
import './settings/Settings.css';
import { FolderOpen, AlertCircle, RefreshCw } from 'lucide-react';
import type { SettingsPageViewProps } from "./SettingsPageView";
import { FloatingCardSettings, FloatingCardShowSetting } from "./settings/FloatingCardSettings";
import { StartupPageSetting } from "./settings/StartupPageSetting";
import { ThemeColorSetting } from './settings/ThemeColorSetting';
import { AppBackgroundSettings } from './settings/AppBackgroundSettings';
import { SettingsCodexPlatformPanel } from "./SettingsCodexPlatformPanel";


/** 渲染 SettingsPageView 的 activeTab === 'general' 业务面板。 */
export function SettingsGeneralPanel(props: SettingsPageViewProps) {
  const {
    antigravityAccountGroups,
    antigravityAppPath,
    antigravityDualSwitchNoRestartEnabled,
    antigravityLaunchOnSwitch,
    antigravityScopeAccounts,
    antigravityScopeTypeOptions,
    antigravitySeamlessSwitchUnlocked,
    appAutoLaunchEnabled,
    autoImportFromLocalEnabled,
    autoImportScanBusy,
    autoImportScanSeqRef,
    autoImportScanStatus,
    autoInstall,
    autoInstallLoaded,
    autoInstallTouchedRef,
    autoRefresh,
    autoRefreshCustomMode,
    autoRefreshIsPreset,
    autoSwitchAccountScopeMode,
    autoSwitchCreditsEnabled,
    autoSwitchCreditsThreshold,
    autoSwitchCreditsThresholdCustomMode,
    autoSwitchCreditsThresholdIsPreset,
    autoSwitchEnabled,
    autoSwitchSelectedAccountIds,
    autoSwitchThreshold,
    autoSwitchThresholdCustomMode,
    autoSwitchThresholdIsPreset,
    closeBehavior,
    defaultTerminal,
    errorReportingEnabled,
    errorReportingSaving,
    externalNetworkEnabled,
    floatingCardAlwaysOnTop,
    floatingCardShowOnStartup,
    generalLoaded,
    generalLoadFailed,
    getResetLabelByTarget,
    handleErrorReportingEnabledChange,
    handlePickAppPath,
    handleResetAppPath,
    hasActiveResetTasks,
    hideDockIcon,
    isAppPathResetDetecting,
    isMacOS,
    language,
    languageOptions,
    loadGeneralConfig,
    loadUpdateSettings,
    menuBarQuotaEnabled,
    menuBarQuotaPlatform,
    menuBarQuotaPlatformOptions,
    normalizeNumberInput,
    openMenuBarQuotaModal,
    platformSettingsOrder,
    quotaAlertEnabled,
    quotaAlertThreshold,
    quotaAlertThresholdCustomMode,
    quotaAlertThresholdIsPreset,
    reducedMotionEnabled,
    rememberMainWindowState,
    renderAccountLevelRefreshConfig,
    renderCurrentAccountRefreshRow,
    sanitizeNumberInput,
    setAntigravityAppPath,
    setAntigravityDualSwitchNoRestartEnabled,
    setAntigravityLaunchOnSwitch,
    setAppAutoLaunchEnabled,
    setAutoImportFromLocalEnabled,
    setAutoImportScanBusy,
    setAutoImportScanStatus,
    setAutoInstall,
    setAutoRefresh,
    setAutoRefreshCustomMode,
    setAutoSwitchAccountScopeMode,
    setAutoSwitchCreditsEnabled,
    setAutoSwitchCreditsThreshold,
    setAutoSwitchCreditsThresholdCustomMode,
    setAutoSwitchEnabled,
    setAutoSwitchSelectedAccountIds,
    setAutoSwitchThreshold,
    setAutoSwitchThresholdCustomMode,
    setCloseBehavior,
    setDefaultTerminal,
    setExternalNetworkEnabled,
    setFloatingCardAlwaysOnTop,
    setFloatingCardShowOnStartup,
    setHideDockIcon,
    setLanguage,
    setMenuBarQuotaEnabled,
    setQuotaAlertEnabled,
    setQuotaAlertThreshold,
    setQuotaAlertThresholdCustomMode,
    setReducedMotionEnabled,
    setRememberMainWindowState,
    setSideNavLayoutMode,
    setStartupMinimized,
    setStartupPage,
    setTheme,
    setThemeColor,
    setTokenKeeperEnabled,
    setTopRightAdVisible,
    setTrayIconStyle,
    setUiScale,
    setUpdateRemindersEnabled,
    setWebdavAllowedDomains,
    sideNavLayoutMode,
    startupMinimized,
    startupPage,
    t,
    terminalOptions,
    theme,
    themeColor,
    tokenKeeperEnabled,
    topRightAdVisible,
    trayIconStyle,
    uiScale,
    updateRemindersEnabled,
    updateRemindersLoaded,
    updateRemindersTouchedRef,
    updateSettingsLoadFailed,
    webdavAllowedDomains,
  } = props;
  return (
          <>
          {(generalLoadFailed || updateSettingsLoadFailed) && (
            <div className="settings-load-error" role="alert">
              <AlertCircle size={16} />
              <span>{t('common.failed')}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (generalLoadFailed) void loadGeneralConfig();
                  if (updateSettingsLoadFailed) void loadUpdateSettings();
                }}
              >
                <RefreshCw size={14} />
                {t('common.refresh')}
              </button>
            </div>
          )}
          <SettingsAccountTransferSection directoryEntryOnly />
          <AppBackgroundSettings />
          <fieldset
            className="settings-general-fieldset"
            disabled={!generalLoaded}
            aria-busy={!generalLoaded}
          >
            <div className="group-title">{t('settings.general.commonTitle', '通用')}</div>
            <div className="settings-group">
              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.language')}</div>
                  <div className="row-desc">{t('settings.general.languageDesc')}</div>
                </div>
                <div className="row-control">
                  <select 
                    className="settings-select" 
                    value={language} 
                    onChange={(e) => setLanguage(normalizeLanguage(e.target.value))}
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.theme')}</div>
                  <div className="row-desc">{t('settings.general.themeDesc')}</div>
                </div>
                <div className="row-control">
                  <select 
                    className="settings-select" 
                    value={theme} 
                    onChange={(e) => setTheme(e.target.value)}
                  >
                    <option value="light">{t('settings.general.themeLight')}</option>
                    <option value="dark">{t('settings.general.themeDark')}</option>
                    <option value="system">{t('settings.general.themeSystem')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.reducedMotion', '减少动画')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.reducedMotionDesc',
                      '降低页面淡入、弹层过渡、阴影、模糊和平滑滚动，仅保留必要加载反馈'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={reducedMotionEnabled}
                      onChange={(event) => setReducedMotionEnabled(event.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.defaultTerminal', '默认终端')}</div>
                  <div className="row-desc">{t('settings.general.defaultTerminalDesc', 'CLI 打开时使用的终端')}</div>
                </div>
                <div className="row-control">
                  <select 
                    className="settings-select" 
                    value={defaultTerminal} 
                    onChange={(e) => setDefaultTerminal(e.target.value)}
                  >
                    {terminalOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.sideNavLayout', '侧边栏布局')}</div>
                  <div className="row-desc">{t('settings.general.sideNavLayoutDesc', '切换原始布局或经典布局')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={sideNavLayoutMode}
                    onChange={(e) => setSideNavLayoutMode(e.target.value as SideNavLayoutMode)}
                  >
                    <option value="original">{t('settings.general.sideNavLayoutOriginal', '原始布局')}</option>
                    <option value="classic">{t('settings.general.sideNavLayoutClassic', '经典布局')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.uiScale')}</div>
                  <div className="row-desc">{t('settings.general.uiScaleDesc')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={uiScale}
                    onChange={(e) => setUiScale(e.target.value)}
                  >
                    {UI_SCALE_OPTIONS.map((value) => (
                      <option key={value} value={value}>{`${Math.round(Number.parseFloat(value) * 100)}%`}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.closeBehavior')}</div>
                  <div className="row-desc">{t('settings.general.closeBehaviorDesc')}</div>
                </div>
                <div className="row-control">
                  <select 
                    className="settings-select" 
                    value={closeBehavior} 
                    onChange={(e) => setCloseBehavior(e.target.value as 'ask' | 'minimize' | 'quit')}
                  >
                    <option value="ask">{t('settings.general.closeBehaviorAsk')}</option>
                    <option value="minimize">{t('settings.general.closeBehaviorMinimize')}</option>
                    <option value="quit">{t('settings.general.closeBehaviorQuit')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.startupMinimized', '启动后自动最小化')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.startupMinimizedDesc',
                      '应用启动完成后自动最小化主窗口，可从 Dock、任务栏或托盘恢复'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={startupMinimized ? 'true' : 'false'}
                    onChange={(e) => setStartupMinimized(e.target.value === 'true')}
                  >
                    <option value="false">{t('common.disable', '停用')}</option>
                    <option value="true">{t('common.enable', '启用')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.rememberMainWindowState', '记住主窗口位置和大小')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.rememberMainWindowStateDesc',
                      '重启或从托盘重新打开时恢复主窗口位置和大小；默认关闭'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={rememberMainWindowState}
                      onChange={(event) => setRememberMainWindowState(event.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.autoUpdate')}</div>
                  <div className="row-desc">{t('settings.general.autoUpdateDesc')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={autoInstall ? 'true' : 'false'}
                    disabled={!autoInstallLoaded}
                    onChange={(e) => {
                      autoInstallTouchedRef.current = true;
                      setAutoInstall(e.target.value === 'true');
                    }}
                  >
                    <option value="false">{t('settings.general.autoUpdateOff')}</option>
                    <option value="true">{t('settings.general.autoUpdateOn')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.updateReminder')}</div>
                  <div className="row-desc">{t('settings.general.updateReminderDesc')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={updateRemindersEnabled ? 'true' : 'false'}
                    disabled={!updateRemindersLoaded}
                    onChange={(e) => {
                      updateRemindersTouchedRef.current = true;
                      setUpdateRemindersEnabled(e.target.value === 'true');
                    }}
                  >
                    <option value="true">{t('settings.general.updateReminderOn')}</option>
                    <option value="false">{t('settings.general.updateReminderOff')}</option>
                  </select>
                </div>
              </div>

              {isMacOS && (
                <>
                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">
                        {t('settings.general.hideDockIcon', '是否隐藏Dock图标（仅 macOS）')}
                      </div>
                      <div className="row-desc">
                        {t(
                          'settings.general.hideDockIconDesc',
                          '独立控制程序坞图标显示状态，不受窗口最小化行为影响'
                        )}
                      </div>
                    </div>
                    <div className="row-control">
                      <select
                        className="settings-select"
                        value={hideDockIcon ? 'true' : 'false'}
                        onChange={(e) => setHideDockIcon(e.target.value === 'true')}
                      >
                        <option value="false">
                          {t('settings.general.hideDockIconOff', '否（显示Dock图标）')}
                        </option>
                        <option value="true">
                          {t('settings.general.hideDockIconOn', '是（隐藏Dock图标）')}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">
                        {t('settings.general.trayIconStyle', '菜单栏图标样式（仅 macOS）')}
                      </div>
                      <div className="row-desc">
                        {t(
                          'settings.general.trayIconStyleDesc',
                          '选择系统单色图标或原彩色 App 图标'
                        )}
                      </div>
                    </div>
                    <div className="row-control">
                      <select
                        className="settings-select"
                        value={trayIconStyle}
                        onChange={(e) =>
                          setTrayIconStyle(e.target.value === 'color' ? 'color' : 'template')
                        }
                      >
                        <option value="template">
                          {t('settings.general.trayIconStyleTemplate', '单色图标')}
                        </option>
                        <option value="color">
                          {t('settings.general.trayIconStyleColor', '彩色图标')}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">
                        {t('settings.general.menuBarQuota', '菜单栏显示实时额度')}
                      </div>
                      <div className="row-desc">
                        {menuBarQuotaEnabled
                          ? t(
                              'settings.general.menuBarQuotaEnabledDesc',
                              '已启用 · {{platform}} · 显示该平台当前账号剩余额度（多条取最低）',
                              {
                                platform:
                                  menuBarQuotaPlatformOptions.find(
                                    (option) => option.value === menuBarQuotaPlatform
                                  )?.label ?? menuBarQuotaPlatform,
                              }
                            )
                          : t(
                              'settings.general.menuBarQuotaDesc',
                              '启用后在菜单栏图标旁显示所选平台当前账号的剩余额度；平台等专属选项在弹框中配置'
                            )}
                      </div>
                    </div>
                    <div className="row-control">
                      <select
                        className="settings-select"
                        value={menuBarQuotaEnabled ? 'true' : 'false'}
                        onChange={(e) => {
                          if (e.target.value === 'true') {
                            openMenuBarQuotaModal(menuBarQuotaEnabled ? 'edit' : 'enable');
                            return;
                          }
                          setMenuBarQuotaEnabled(false);
                        }}
                      >
                        <option value="false">{t('common.disable', '停用')}</option>
                        <option value="true">{t('common.enable', '启用')}</option>
                      </select>
                      {menuBarQuotaEnabled ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => openMenuBarQuotaModal('edit')}
                        >
                          {t('settings.general.menuBarQuotaConfigure', '配置')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </>
              )}

              <FloatingCardSettings
                startup={floatingCardShowOnStartup} onTop={floatingCardAlwaysOnTop}
                onStartupChange={setFloatingCardShowOnStartup} onTopChange={setFloatingCardAlwaysOnTop}
              />

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.appAutoLaunch')}</div>
                  <div className="row-desc">{t('settings.general.appAutoLaunchDesc')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={appAutoLaunchEnabled ? 'true' : 'false'}
                    onChange={(e) => setAppAutoLaunchEnabled(e.target.value === 'true')}
                  >
                    <option value="false">{t('common.disable', '停用')}</option>
                    <option value="true">{t('common.enable', '启用')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.tokenKeeper', '后台授权保活')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.tokenKeeperDesc',
                      '仅在授权快过期时分批刷新账号 Token，降低大量账号场景下的后台请求压力。',
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={tokenKeeperEnabled}
                      onChange={(e) => setTokenKeeperEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.autoImportFromLocal', '本机账号自动导入')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.autoImportFromLocalDesc',
                      '开启后会立即扫描本机客户端登录状态并导入当前账号；之后当官方客户端更换登录时自动导入。首次可能弹出系统钥匙串授权，请选择「始终允许」。',
                    )}
                    {autoImportScanStatus ? (
                      <div
                        className="row-desc-extra"
                        style={{
                          marginTop: 6,
                          opacity: autoImportScanBusy ? 0.9 : 1,
                        }}
                      >
                        {autoImportScanStatus}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={autoImportFromLocalEnabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setAutoImportFromLocalEnabled(enabled);
                        if (!enabled) {
                          // 作废进行中的扫描结果，避免关了之后又刷回完成文案
                          autoImportScanSeqRef.current += 1;
                          setAutoImportScanBusy(false);
                          setAutoImportScanStatus(
                            autoImportScanBusy
                              ? t(
                                  'settings.general.autoImportFromLocalScanCancelled',
                                  '已关闭，后台扫描将忽略结果',
                                )
                              : '',
                          );
                          return;
                        }
                        const scanSeq = ++autoImportScanSeqRef.current;
                        setAutoImportScanBusy(true);
                        setAutoImportScanStatus(
                          t(
                            'settings.general.autoImportFromLocalScanning',
                            '正在扫描本机账号，可随时关闭…',
                          ),
                        );
                        void (async () => {
                          try {
                            // 等 patch 自动保存生效后再扫（debounce 300ms）
                            await new Promise((resolve) => window.setTimeout(resolve, 450));
                            if (autoImportScanSeqRef.current !== scanSeq) {
                              return;
                            }
                            const result = await invoke<{
                              scanned: number;
                              imported: number;
                              failed: number;
                              platforms: string[];
                            }>('scan_auto_local_import');
                            if (autoImportScanSeqRef.current !== scanSeq) {
                              return;
                            }
                            if (result.imported > 0) {
                              setAutoImportScanStatus(
                                t('settings.general.autoImportFromLocalScanDone', {
                                  imported: result.imported,
                                  scanned: result.scanned,
                                  defaultValue:
                                    '扫描完成：发现 {{scanned}} 个本机登录，已导入 {{imported}} 个',
                                }),
                              );
                            } else if (result.failed > 0) {
                              setAutoImportScanStatus(
                                t(
                                  'settings.general.autoImportFromLocalScanPartial',
                                  '扫描完成：未成功导入，部分平台失败，可到账号页手动导入',
                                ),
                              );
                            } else {
                              setAutoImportScanStatus(
                                t(
                                  'settings.general.autoImportFromLocalScanEmpty',
                                  '扫描完成：未发现可导入的本机登录',
                                ),
                              );
                            }
                          } catch (err) {
                            if (autoImportScanSeqRef.current !== scanSeq) {
                              return;
                            }
                            console.error('本机账号自动导入扫描失败:', err);
                            setAutoImportScanStatus(
                              t('settings.general.autoImportFromLocalScanFailed', {
                                error: String(err),
                                defaultValue: '扫描失败：{{error}}',
                              }),
                            );
                          } finally {
                            if (autoImportScanSeqRef.current === scanSeq) {
                              setAutoImportScanBusy(false);
                            }
                          }
                        })();
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.errorReporting')}
                  </div>
                  <div className="row-desc">
                    {t('settings.general.errorReportingDesc')}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={errorReportingEnabled}
                      disabled={errorReportingSaving}
                      onChange={(e) => void handleErrorReportingEnabledChange(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <FloatingCardShowSetting />

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.dataDir')}</div>
                  <div className="row-desc">{t('settings.general.dataDirDesc')}</div>
                </div>
                <div className="row-control">
                  <button className="btn btn-secondary" onClick={() => accountService.openDataFolder()}>
                    <FolderOpen size={16} />{t('common.open')}
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.topRightAdVisible', '显示顶部推广')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.topRightAdVisibleDesc',
                      '关闭后隐藏应用顶部推广位。'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={topRightAdVisible}
                      onChange={(e) => setTopRightAdVisible(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <StartupPageSetting value={startupPage} onChange={setStartupPage} />

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.themeColor', '主题色套件')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.themeColorDesc',
                      '在浅色/深色之上叠加配色包（Nord、Tokyo Night 等）'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <ThemeColorSetting value={themeColor} onChange={setThemeColor} />
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.externalNetwork', '允许外连')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.externalNetworkDesc',
                      '关闭后阻断 WebDAV 同步与 OpenRouter 用量刷新（不影响应用更新等其他网络）'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={externalNetworkEnabled}
                      onChange={(e) => setExternalNetworkEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.webdavAllowedDomains', 'WebDAV 域名白名单')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.webdavAllowedDomainsDesc',
                      '逗号分隔；留空不限制。非空时同步 URL 主机必须匹配'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <input
                    className="settings-input"
                    value={webdavAllowedDomains}
                    onChange={(e) => setWebdavAllowedDomains(e.target.value)}
                    placeholder="example.com, dav.example.org"
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ order: platformSettingsOrder.antigravity }}>
                <div className="group-title">{t('settings.general.antigravitySettingsTitle', 'Antigravity IDE 设置')}</div>
                <div className="settings-group">
              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.autoRefresh')}</div>
                  <div className="row-desc">{t('settings.general.autoRefreshDesc')}</div>
                </div>
                <div className="row-control">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {autoRefreshCustomMode ? (
                      <div className="settings-inline-input" style={{ minWidth: '120px', width: 'auto' }}>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          className="settings-select settings-select--input-mode settings-select--with-unit"
                          value={autoRefresh}
                          placeholder={t('quickSettings.inputMinutes', '输入分钟数')}
                          onChange={(e) => setAutoRefresh(sanitizeNumberInput(e.target.value))}
                        onBlur={() => {
                          const normalized = normalizeNumberInput(autoRefresh, 1, 999);
                          setAutoRefresh(normalized);
                          setAutoRefreshCustomMode(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const normalized = normalizeNumberInput(autoRefresh, 1, 999);
                            setAutoRefresh(normalized);
                            setAutoRefreshCustomMode(false);
                          }
                        }}
                      />
                        <span className="settings-input-unit">{t('settings.general.minutes')}</span>
                      </div>
                    ) : (
                      <select
                        className="settings-select"
                        style={{ minWidth: '120px', width: 'auto' }}
                        value={autoRefresh}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setAutoRefreshCustomMode(true);
                            setAutoRefresh(autoRefresh !== '-1' ? autoRefresh : '1');
                            return;
                          }
                          setAutoRefreshCustomMode(false);
                          setAutoRefresh(val);
                        }}
                      >
                        {!autoRefreshIsPreset && (
                          <option value={autoRefresh}>
                            {autoRefresh} {t('settings.general.minutes')}
                          </option>
                        )}
                        <option value="-1" disabled={hasActiveResetTasks}>{t('settings.general.autoRefreshDisabled')}</option>
                        <option value="2" disabled={hasActiveResetTasks}>2 {t('settings.general.minutes')}</option>
                        <option value="5" disabled={hasActiveResetTasks}>5 {t('settings.general.minutes')}</option>
                        <option value="10" disabled={hasActiveResetTasks}>10 {t('settings.general.minutes')}</option>
                        <option value="15" disabled={hasActiveResetTasks}>15 {t('settings.general.minutes')}</option>
                        <option value="custom" disabled={hasActiveResetTasks}>{t('settings.general.autoRefreshCustom')}</option>
                      </select>
                    )}
                  </div>
                  
                  {hasActiveResetTasks && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '12px',
                      marginTop: '8px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: 'var(--accent)',
                      lineHeight: '1.5'
                    }}>
                      <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                      <span>{t('settings.general.refreshIntervalLimited')}</span>
                    </div>
                  )}
                </div>
              </div>

	              {renderCurrentAccountRefreshRow('antigravity')}
	              {renderAccountLevelRefreshConfig('antigravity')}

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t(
                      'settings.general.antigravityLaunchOnSwitch',
                      '切换时启动 Antigravity',
                    )}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.antigravityLaunchOnSwitchDesc',
                      '关闭后切号只写入 Antigravity 默认账号数据，不会关闭、启动或重启应用。',
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={antigravityLaunchOnSwitch}
                      onChange={(e) => setAntigravityLaunchOnSwitch(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

	              <div className="settings-row">
	                <div className="row-label">
	                  <div className="row-title">{t('settings.general.antigravityAppPath', 'Antigravity IDE 启动路径')}</div>
                  <div className="row-desc">{t('settings.general.codexAppPathDesc', '留空则使用默认路径')}</div>
                </div>
                <div className="row-control row-control--grow">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                    <input
                      type="text"
                      className="settings-input settings-input--path"
                      value={antigravityAppPath}
                      placeholder={t('settings.general.codexAppPathPlaceholder', '默认路径')}
                      onChange={(e) => setAntigravityAppPath(e.target.value)}
                    />
                    <button
                      className="btn btn-secondary"
                      onClick={() => handlePickAppPath('antigravity')}
                      disabled={isAppPathResetDetecting('antigravity')}
                    >
                      {t('settings.general.codexPathSelect', '选择')}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleResetAppPath('antigravity')}
                      disabled={isAppPathResetDetecting('antigravity')}
                    >
                      <RefreshCw size={16} className={isAppPathResetDetecting('antigravity') ? 'spin' : undefined} />
                      {isAppPathResetDetecting('antigravity')
                        ? t('common.loading', '加载中...')
                        : getResetLabelByTarget('antigravity')}
                    </button>
                  </div>
                </div>
              </div>

              {antigravitySeamlessSwitchUnlocked && (
                <div className="settings-row">
                  <div className="row-label">
                    <div className="row-title">
                      {t(
                        'settings.general.antigravityDualSwitchNoRestart',
                        '无感双通道切号（不重启）'
                      )}
                    </div>
                    <div className="row-desc">
                      {t(
                        'settings.general.antigravityDualSwitchNoRestartDesc',
                        '切号时同时执行本地落盘与扩展无感切号，不再自动重启 Antigravity IDE。'
                      )}
                    </div>
                  </div>
                  <div className="row-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={antigravityDualSwitchNoRestartEnabled}
                        onChange={(e) =>
                          setAntigravityDualSwitchNoRestartEnabled(e.target.checked)
                        }
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              )}

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('quickSettings.autoSwitch.enable', '自动切号')}</div>
                  <div className="row-desc">{t('quickSettings.autoSwitch.hint', '命中监控的模型分组阈值时会自动切号；启用 Credits 监控后，剩余 Credits 低于阈值时也会触发。')}</div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={autoSwitchEnabled}
                      onChange={(e) => setAutoSwitchEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
              {autoSwitchEnabled && (
                <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                  <div className="row-label">
                    <div className="row-title">{t('quickSettings.autoSwitch.threshold', '切号阈值')}</div>
                    <div className="row-desc">{t('quickSettings.autoSwitch.thresholdDesc', '任意模型配额低于此百分比时触发自动切号')}</div>
                  </div>
                  <div className="row-control">
                    {autoSwitchThresholdCustomMode ? (
                      <div className="settings-inline-input">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="settings-select settings-select--input-mode settings-select--with-unit"
                          value={autoSwitchThreshold}
                          placeholder={t('quickSettings.inputPercent', '输入百分比')}
                          onChange={(e) => setAutoSwitchThreshold(sanitizeNumberInput(e.target.value))}
                        onBlur={() => {
                          const normalized = normalizeNumberInput(autoSwitchThreshold, 0, 100);
                          setAutoSwitchThreshold(normalized);
                          setAutoSwitchThresholdCustomMode(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const normalized = normalizeNumberInput(autoSwitchThreshold, 0, 100);
                            setAutoSwitchThreshold(normalized);
                            setAutoSwitchThresholdCustomMode(false);
                          }
                        }}
                      />
                        <span className="settings-input-unit">%</span>
                      </div>
                    ) : (
                      <select
                        className="settings-select"
                        value={autoSwitchThreshold}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setAutoSwitchThresholdCustomMode(true);
                            setAutoSwitchThreshold(autoSwitchThreshold || '20');
                            return;
                          }
                          setAutoSwitchThresholdCustomMode(false);
                          setAutoSwitchThreshold(val);
                        }}
                      >
                        {!autoSwitchThresholdIsPreset && (
                          <option value={autoSwitchThreshold}>{autoSwitchThreshold}%</option>
                        )}
                        <option value="0">0%</option>
                        <option value="20">20%</option>
                        <option value="40">40%</option>
                        <option value="60">60%</option>
                        <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                      </select>
                    )}
                  </div>
                </div>
              )}
              {autoSwitchEnabled && (
                <div className="settings-row">
                  <div className="row-label">
                    <div className="row-title">
                      {t('quickSettings.autoSwitch.creditsEnable', '监控 Credits')}
                    </div>
                    <div className="row-desc">
                      {t('quickSettings.autoSwitch.creditsThresholdDesc', '剩余 Credits 小于等于此值时也会触发自动切号')}
                    </div>
                  </div>
                  <div className="row-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={autoSwitchCreditsEnabled}
                        onChange={(e) => setAutoSwitchCreditsEnabled(e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              )}
              {autoSwitchEnabled && autoSwitchCreditsEnabled && (
                <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                  <div className="row-label">
                    <div className="row-title">
                      {t('quickSettings.autoSwitch.creditsThreshold', 'Credits 阈值')}
                    </div>
                    <div className="row-desc">
                      {t('quickSettings.autoSwitch.creditsThresholdDesc', '剩余 Credits 小于等于此值时也会触发自动切号')}
                    </div>
                  </div>
                  <div className="row-control">
                    {autoSwitchCreditsThresholdCustomMode ? (
                      <div className="settings-inline-input">
                        <input
                          type="number"
                          min={0}
                          className="settings-select settings-select--input-mode"
                          value={autoSwitchCreditsThreshold}
                          placeholder={t('quickSettings.inputCredits', '输入 Credits')}
                          onChange={(e) =>
                            setAutoSwitchCreditsThreshold(sanitizeNumberInput(e.target.value))
                          }
                          onBlur={() => {
                            const normalized = normalizeNumberInput(autoSwitchCreditsThreshold, 0);
                            setAutoSwitchCreditsThreshold(normalized);
                            setAutoSwitchCreditsThresholdCustomMode(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const normalized = normalizeNumberInput(autoSwitchCreditsThreshold, 0);
                              setAutoSwitchCreditsThreshold(normalized);
                              setAutoSwitchCreditsThresholdCustomMode(false);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <select
                        className="settings-select"
                        value={autoSwitchCreditsThreshold}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setAutoSwitchCreditsThresholdCustomMode(true);
                            setAutoSwitchCreditsThreshold(autoSwitchCreditsThreshold || '5');
                            return;
                          }
                          setAutoSwitchCreditsThresholdCustomMode(false);
                          setAutoSwitchCreditsThreshold(val);
                        }}
                      >
                        {!autoSwitchCreditsThresholdIsPreset && (
                          <option value={autoSwitchCreditsThreshold}>
                            {autoSwitchCreditsThreshold}
                          </option>
                        )}
                        <option value="0">0</option>
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                      </select>
                    )}
                  </div>
                </div>
              )}
              {autoSwitchEnabled && (
                <div className="settings-row settings-row--align-start" style={{ animation: 'fadeUp 0.3s ease both' }}>
                  <div className="row-label">
                    <div className="row-title">
                      {t('settings.general.autoSwitchAccountScope')}
                    </div>
                    <div className="row-desc">
                      {t('settings.general.autoSwitchAccountScopeDesc')}
                    </div>
                  </div>
                  <div className="row-control row-control--grow">
                    <AutoSwitchAccountScopeSelector
                      mode={autoSwitchAccountScopeMode}
                      onModeChange={setAutoSwitchAccountScopeMode}
                      selectedAccountIds={autoSwitchSelectedAccountIds}
                      onSelectedAccountIdsChange={setAutoSwitchSelectedAccountIds}
                      accounts={antigravityScopeAccounts}
                      groups={antigravityAccountGroups}
                      typeOptions={antigravityScopeTypeOptions}
                      useDialog
                    />
                  </div>
                </div>
              )}

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('quickSettings.quotaAlert.enable', '超额预警')}</div>
                  <div className="row-desc">{t('quickSettings.quotaAlert.hint', '当当前账号任意模型配额低于阈值时，发送原生通知并在页面提示快捷切号。')}</div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={quotaAlertEnabled}
                      onChange={(e) => setQuotaAlertEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
              {quotaAlertEnabled && (
                <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                  <div className="row-label">
                    <div className="row-title">{t('quickSettings.quotaAlert.threshold', '预警阈值')}</div>
                    <div className="row-desc">{t('quickSettings.quotaAlert.thresholdDesc', '任意模型配额低于此百分比时触发预警')}</div>
                  </div>
                  <div className="row-control">
                    {quotaAlertThresholdCustomMode ? (
                      <div className="settings-inline-input">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="settings-select settings-select--input-mode settings-select--with-unit"
                          value={quotaAlertThreshold}
                          placeholder={t('quickSettings.inputPercent', '输入百分比')}
                          onChange={(e) => setQuotaAlertThreshold(sanitizeNumberInput(e.target.value))}
                          onBlur={() => {
                            const normalized = normalizeNumberInput(quotaAlertThreshold, 0, 100);
                            setQuotaAlertThreshold(normalized);
                            setQuotaAlertThresholdCustomMode(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const normalized = normalizeNumberInput(quotaAlertThreshold, 0, 100);
                              setQuotaAlertThreshold(normalized);
                              setQuotaAlertThresholdCustomMode(false);
                            }
                          }}
                        />
                        <span className="settings-input-unit">%</span>
                      </div>
                    ) : (
                      <select
                        className="settings-select"
                        value={quotaAlertThreshold}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setQuotaAlertThresholdCustomMode(true);
                            setQuotaAlertThreshold(quotaAlertThreshold || '20');
                            return;
                          }
                          setQuotaAlertThresholdCustomMode(false);
                          setQuotaAlertThreshold(val);
                        }}
                      >
                        {!quotaAlertThresholdIsPreset && (
                          <option value={quotaAlertThreshold}>{quotaAlertThreshold}%</option>
                        )}
                        <option value="0">0%</option>
                        <option value="20">20%</option>
                        <option value="40">40%</option>
                        <option value="60">60%</option>
                        <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                      </select>
                    )}
                  </div>
                </div>
              )}
            </div>

              </div>

              <SettingsCodexPlatformPanel {...props} />

            </div>

          </fieldset>
          </>
        );
}
