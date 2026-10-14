import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PlatformOverviewTabsHeader,
  type PlatformOverviewTab,
} from '../components/platform/PlatformOverviewTabsHeader';
import {
  CodebuddySuiteAccountsSharedView,
  type CodebuddySuiteAccountsPlatformConfig,
} from '../components/codebuddy-suite/CodebuddySuiteAccountsSharedView';
import { useProviderAccountsPage } from '../hooks/useProviderAccountsPage';
import * as zcodeService from '../services/zcodeService';
import { useZcodeAccountStore } from '../stores/useZcodeAccountStore';
import {
  getZcodeAccountDisplayEmail,
  getZcodePlanBadge,
  getZcodeQuotaGroups,
  getZcodeUsage,
  hasZcodeQuotaData,
  type ZcodeAccount,
} from '../types/zcode';
import { compareCurrentAccountFirst } from '../utils/currentAccountSort';
import { ZcodeInstancesContent } from './ZcodeInstancesPage';

const FLOW_NOTICE_KEY = 'agtools.zcode.flow_notice_collapsed';
const CURRENT_ACCOUNT_KEY = 'agtools.zcode.current_account_id';

export function ZcodeAccountsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PlatformOverviewTab>('overview');
  const [oauthProvider, setOauthProvider] = useState<zcodeService.ZcodeOAuthProvider>('zai');
  const [apiKeyProvider, setApiKeyProvider] = useState<zcodeService.ZcodeApiKeyProvider>('zai');
  const store = useZcodeAccountStore();

  const page = useProviderAccountsPage<ZcodeAccount>({
    platformKey: 'zcode',
    oauthLogPrefix: 'ZcodeOAuth',
    flowNoticeCollapsedKey: FLOW_NOTICE_KEY,
    currentAccountIdKey: CURRENT_ACCOUNT_KEY,
    exportFilePrefix: 'zcode_accounts',
    oauthTabKeys: ['oauth'],
    store: {
      accounts: store.accounts,
      currentAccountId: store.currentAccountId,
      loading: store.loading,
      error: store.error,
      fetchAccounts: store.fetchAccounts,
      fetchCurrentAccountId: store.fetchCurrentAccountId,
      deleteAccounts: store.deleteAccounts,
      refreshToken: store.refreshToken,
      refreshAllTokens: store.refreshAllTokens,
      setCurrentAccountId: store.setCurrentAccountId,
      updateAccountTags: store.updateAccountTags,
    },
    oauthService: {
      startLogin: () => zcodeService.startZcodeOAuthLogin(oauthProvider),
      completeLogin: zcodeService.completeZcodeOAuthLogin,
      cancelLogin: zcodeService.cancelZcodeOAuthLogin,
      submitCallbackUrl: zcodeService.submitZcodeOAuthCallbackUrl,
      openAuthUrl: zcodeService.openZcodeOAuthWindow,
    },
    dataService: {
      importFromJson: zcodeService.importZcodeFromJson,
      importFromLocal: zcodeService.importZcodeFromLocal,
      addWithToken: (apiKey) => zcodeService.importZcodeApiKey(apiKey, apiKeyProvider),
      exportAccounts: zcodeService.exportZcodeAccounts,
      injectToVSCode: zcodeService.injectZcodeAccount,
    },
    getDisplayEmail: getZcodeAccountDisplayEmail,
    resolveOauthSuccessMessage: () => t('zcode.oauth.success', 'ZCode OAuth 登录成功'),
  });

  const previousOauthProviderRef = useRef(oauthProvider);
  useEffect(() => {
    if (previousOauthProviderRef.current === oauthProvider) return;
    previousOauthProviderRef.current = oauthProvider;
    if (page.showAddModal && page.addTab === 'oauth') {
      page.handleRetryOauth();
    }
  }, [oauthProvider, page.addTab, page.handleRetryOauth, page.showAddModal]);

  const accountsForInstances = useMemo(
    () =>
      [...store.accounts].sort((left, right) => {
        const current = compareCurrentAccountFirst(left.id, right.id, store.currentAccountId);
        if (current !== 0) return current;
        const diff = right.created_at - left.created_at;
        return page.sortDirection === 'desc' ? diff : -diff;
      }),
    [page.sortDirection, store.accounts, store.currentAccountId],
  );

  const platformConfig: CodebuddySuiteAccountsPlatformConfig<ZcodeAccount> = {
    pageClassName: 'zcode-accounts-page',
    quickSettingsType: 'zcode',
    searchPlaceholderKey: 'zcode.search',
    searchPlaceholderDefault: 'Tìm kiếm tài khoản ZCode...',
    flowNotice: {
      titleKey: 'zcode.flowNotice.title',
      titleDefault: 'Hướng dẫn quản lý tài khoản ZCode',
      descKey: 'zcode.flowNotice.desc',
      descDefault: 'Cockpit quản lý chứng thực OAuth và API Key theo định dạng chuẩn của ZCode để chuyển tài khoản và liên kết cửa sổ.',
      permissionKey: 'zcode.flowNotice.permission',
      permissionDefault: 'Phạm vi cục bộ: ~/.zcode/v2/credentials.json, config.json, setting.json và thư mục cửa sổ quản lý.',
      networkKey: 'zcode.flowNotice.network',
      networkDefault: 'Phạm vi mạng: Giao diện OAuth, thông tin người dùng, gói đăng ký và hạn mức; không tải tài khoản lên máy chủ Cockpit.',
    },
    noAccountsKey: 'zcode.empty',
    noAccountsDefault: 'Chưa có tài khoản ZCode',
    addAccountTitleKey: 'zcode.addAccount',
    addAccountTitleDefault: 'Thêm tài khoản ZCode',
    oauthDescKey: 'zcode.oauth.desc',
    oauthDescDefault: 'Sau khi đóng ZCode, hoàn tất đăng nhập trong cửa sổ ủy quyền Cockpit; phản hồi gọi lại sẽ do Cockpit nhận trực tiếp.',
    oauthFeatureCardClassName: 'zcode-oauth-feature-card',
    oauthFeatureTitleKey: 'zcode.oauth.title',
    oauthFeatureTitleDefault: 'ZCode OAuth',
    oauthFeatureItem1Key: 'zcode.oauth.item1',
    oauthFeatureItem1Default: 'Hỗ trợ đăng nhập chính thức Z.ai và BigModel.',
    oauthFeatureItem2Key: 'zcode.oauth.item2',
    oauthFeatureItem2Default: 'Sau khi ủy quyền sẽ tự động lưu tài khoản và làm mới hạn mức gói và mô hình.',
    oauthFeatureItem3Key: 'zcode.oauth.item3',
    oauthFeatureItem3Default: 'Tài khoản có thể dùng để chuyển tài khoản trên client mặc định và liên kết với các cửa sổ khác.',
    oauthUrlInputPlaceholderKey: 'zcode.oauth.urlPlaceholder',
    oauthUrlInputPlaceholderDefault: 'Địa chỉ ủy quyền ZCode OAuth',
    oauthWaitingKey: 'zcode.oauth.waiting',
    oauthWaitingDefault: 'Đang chờ phản hồi gọi lại ZCode OAuth...',
    oauthOpenButtonKey: 'zcode.oauth.openWindow',
    oauthOpenButtonDefault: 'Mở cửa sổ ủy quyền',
    showOauthIncognitoOpenButton: true,
    tokenTabLabelKey: 'zcode.apiKey.tab',
    tokenTabLabelDefault: 'API Key',
    tokenDescKey: 'zcode.apiKey.desc',
    tokenDescDefault: 'Thêm API Key Z.ai hoặc BigModel chính thức của ZCode. Chuyển tài khoản và cửa sổ sẽ ghi vào config.json tương ứng.',
    tokenInputPlaceholderKey: 'zcode.apiKey.placeholder',
    tokenInputPlaceholderDefault: 'Dán API Key',
    tokenSubmitLabelKey: 'zcode.apiKey.add',
    tokenSubmitLabelDefault: 'Thêm API Key',
    tokenInputSecret: true,
    importLocalDescKey: 'zcode.import.localDesc',
    importLocalDescDefault: 'Nhập tài khoản từ chứng thực mã hóa ZCode trên máy hoặc tệp JSON.',
    importLocalClientKey: 'zcode.import.localClient',
    importLocalClientDefault: 'Nhập từ ứng dụng ZCode cục bộ',
    getDisplayEmail: getZcodeAccountDisplayEmail,
    getPlanBadge: getZcodePlanBadge,
    getSearchText: (account) =>
      [
        getZcodeAccountDisplayEmail(account),
        account.display_name,
        account.user_id,
        account.provider,
        getZcodePlanBadge(account),
      ]
        .filter(Boolean)
        .join(' '),
    getUsage: getZcodeUsage,
    getQuotaGroups: getZcodeQuotaGroups,
    hasQuotaData: (account) => hasZcodeQuotaData(account),
    usagePrefix: 'zcode',
    quotaPrefix: 'zcode',
    tableUsageClassName: 'zcode-table-usage',
    showMfaQuickCode: false,
    tokenControl: (
      <div className="zcode-oauth-provider-control" role="group" aria-label={t('zcode.apiKey.provider', 'API Key 服务')}>
        <button
          type="button"
          className={`btn btn-secondary ${apiKeyProvider === 'zai' ? 'active' : ''}`}
          aria-pressed={apiKeyProvider === 'zai'}
          onClick={() => setApiKeyProvider('zai')}
        >
          Z.ai
        </button>
        <button
          type="button"
          className={`btn btn-secondary ${apiKeyProvider === 'bigmodel' ? 'active' : ''}`}
          aria-pressed={apiKeyProvider === 'bigmodel'}
          onClick={() => setApiKeyProvider('bigmodel')}
        >
          BigModel
        </button>
      </div>
    ),
    oauthProviderControl: (
      <div className="zcode-oauth-provider-control" role="group" aria-label={t('zcode.oauth.provider', '登录服务')}>
        <button
          type="button"
          className={`btn btn-secondary ${oauthProvider === 'zai' ? 'active' : ''}`}
          aria-pressed={oauthProvider === 'zai'}
          onClick={() => setOauthProvider('zai')}
        >
          Z.ai
        </button>
        <button
          type="button"
          className={`btn btn-secondary ${oauthProvider === 'bigmodel' ? 'active' : ''}`}
          aria-pressed={oauthProvider === 'bigmodel'}
          onClick={() => setOauthProvider('bigmodel')}
        >
          BigModel
        </button>
      </div>
    ),
  };

  return (
    <div className="ghcp-accounts-page zcode-accounts-page">
      <PlatformOverviewTabsHeader platform="zcode" active={activeTab} onTabChange={setActiveTab} />
      {activeTab === 'instances' ? (
        <ZcodeInstancesContent accountsForSelect={accountsForInstances} />
      ) : (
        <CodebuddySuiteAccountsSharedView
          accounts={store.accounts}
          loading={store.loading}
          page={page}
          platformConfig={platformConfig}
          onRefreshAccounts={() => void store.fetchAccounts()}
        />
      )}
    </div>
  );
}
