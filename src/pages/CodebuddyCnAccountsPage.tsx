import { useMemo, useState } from 'react';
import { PlatformOverviewTabsHeader, PlatformOverviewTab } from '../components/platform/PlatformOverviewTabsHeader';
import { CodebuddyCnInstancesContent } from './CodebuddyCnInstancesPage';
import { useCodebuddyCnAccountStore } from '../stores/useCodebuddyCnAccountStore';
import * as codebuddyCnService from '../services/codebuddyCnService';
import {
  CodebuddyAccount,
  getCodebuddyAccountDisplayEmail,
  getCodebuddyOfficialQuotaModel,
  getCodebuddyPlanBadge,
  getCodebuddyUsage,
  getCodebuddyQuotaCategoryGroups,
} from '../types/codebuddy';
import { useProviderAccountsPage } from '../hooks/useProviderAccountsPage';
import { CodebuddySuiteAccountsSharedView, type CodebuddySuiteAccountsPlatformConfig } from '../components/codebuddy-suite/CodebuddySuiteAccountsSharedView';
import { CodebuddySessionManager } from '../components/codebuddy/CodebuddySessionManager';
import { compareCurrentAccountFirst } from '../utils/currentAccountSort';

const CB_FLOW_NOTICE_COLLAPSED_KEY = 'agtools.codebuddycn.flow_notice_collapsed';
const CB_CURRENT_ACCOUNT_ID_KEY = 'agtools.codebuddycn.current_account_id';

const codebuddyCnPlatformConfig: CodebuddySuiteAccountsPlatformConfig<CodebuddyAccount> = {
  pageClassName: 'codebuddy-accounts-page',
  quickSettingsType: 'codebuddy_cn',
  searchPlaceholderKey: 'codebuddyCn.search',
  searchPlaceholderDefault: 'Tìm kiếm tài khoản CodeBuddy CN...',
  flowNotice: {
    titleKey: 'codebuddyCn.flowNotice.title',
    titleDefault: 'Hướng dẫn quản lý tài khoản CodeBuddy CN (nhấp để mở/thu gọn)',
    descKey: 'codebuddyCn.flowNotice.desc',
    descDefault: 'Khi chuyển tài khoản cần đọc dữ liệu xác thực cục bộ của CodeBuddy CN và mã hóa/giải mã qua chứng thực hệ thống. Dữ liệu chỉ xử lý trên máy.',
    permissionKey: 'codebuddyCn.flowNotice.permission',
    permissionDefault: 'Phạm vi quyền hạn: Đọc cơ sở dữ liệu xác thực CodeBuddy CN (state.vscdb), dùng chứng thực hệ thống (macOS Keychain / Windows DPAPI / Linux Secret Service) để giải mã và ghi.',
    networkKey: 'codebuddyCn.flowNotice.network',
    networkDefault: 'Phạm vi mạng: Đăng nhập OAuth và làm mới Token cần kết nối codebuddy.cn và copilot.tencent.com; làm mới gói dung lượng cần gọi API thanh toán. Không tải lên khóa hoặc thông tin chứng thực.',
  },
  noAccountsKey: 'codebuddyCn.noAccounts',
  noAccountsDefault: 'Chưa có tài khoản CodeBuddy CN',
  addAccountTitleKey: 'codebuddyCn.addAccount',
  addAccountTitleDefault: 'Thêm tài khoản CodeBuddy CN',
  oauthDescKey: 'codebuddyCn.oauthDesc',
  oauthDescDefault: 'Nhấp vào nút bên dưới để mở trang ủy quyền CodeBuddy CN trong trình duyệt.',
  oauthFeatureCardClassName: 'codebuddy-oauth-feature-card',
  oauthFeatureTitleKey: 'codebuddy.oauthFeature.oauth.title',
  oauthFeatureTitleDefault: 'Chỉ ủy quyền thông tin đăng nhập IDE',
  oauthFeatureItem1Key: 'codebuddy.oauthFeature.oauth.item1',
  oauthFeatureItem1Default: 'Sau khi hoàn tất OAuth trên trình duyệt có thể thêm tài khoản và dùng để chuyển đổi IDE.',
  oauthFeatureItem2Key: 'codebuddy.oauthFeature.oauth.item2',
  oauthFeatureItem2Default: 'Sau khi ủy quyền xong sẽ tự động làm mới dữ liệu hạn mức gói tài nguyên.',
  oauthFeatureItem3Key: 'codebuddy.oauthFeature.oauth.item3',
  oauthFeatureItem3Default: 'Thẻ tài khoản sẽ hiển thị hạn mức, tiến trình và thời gian làm mới/hết hạn theo gói tài nguyên.',
  oauthUrlInputPlaceholderKey: 'codebuddy.oauthUrlInputPlaceholder',
  oauthUrlInputPlaceholderDefault: 'Có thể nhập thủ công địa chỉ ủy quyền',
  oauthWaitingKey: 'codebuddy.oauthWaiting',
  oauthWaitingDefault: 'Đang chờ hoàn tất ủy quyền...',
  tokenDescKey: 'codebuddyCn.tokenDesc',
  tokenDescDefault: 'Dán access token của CodeBuddy CN:',
  importLocalDescKey: 'codebuddyCn.import.localDesc',
  importLocalDescDefault: 'Hỗ trợ nhập dữ liệu tài khoản từ ứng dụng CodeBuddy CN cục bộ hoặc tệp JSON.',
  importLocalClientKey: 'codebuddyCn.import.localClient',
  importLocalClientDefault: 'Nhập từ ứng dụng CodeBuddy CN cục bộ',
  syncButtonTitle: (t) => t('codebuddyCn.syncToWorkbuddy', '同步到 WorkBuddy'),
  syncSuccessMessage: (t, count) => t('codebuddyCn.syncSuccess', '成功同步 {{count}} 个账号到 WorkBuddy', { count }),
  syncFailedMessage: (t, error) => t('codebuddyCn.syncFailed', '同步失败: {{error}}', { error }),
  runSync: () => codebuddyCnService.syncCodebuddyCnToWorkbuddy(),
  getDisplayEmail: (account) => getCodebuddyAccountDisplayEmail(account),
  getPlanBadge: (account) => getCodebuddyPlanBadge(account),
  getUsage: (account) => getCodebuddyUsage(account),
  getQuotaGroups: (account, t) => getCodebuddyQuotaCategoryGroups(account, t),
  hasQuotaData: (account) => {
    const model = getCodebuddyOfficialQuotaModel(account);
    return model.resources.length > 0 || model.extra.total > 0 || model.extra.remain > 0 || model.extra.used > 0;
  },
  usagePrefix: 'codebuddy',
  quotaPrefix: 'codebuddy',
  tableUsageClassName: 'codebuddy-table-usage',
};

export function CodebuddyCnAccountsPage() {
  const [activeTab, setActiveTab] = useState<PlatformOverviewTab>('overview');
  const store = useCodebuddyCnAccountStore();

  const page = useProviderAccountsPage<CodebuddyAccount>({
    platformKey: 'CodeBuddy CN',
    oauthLogPrefix: 'CodebuddyCnOAuth',
    flowNoticeCollapsedKey: CB_FLOW_NOTICE_COLLAPSED_KEY,
    currentAccountIdKey: CB_CURRENT_ACCOUNT_ID_KEY,
    exportFilePrefix: 'codebuddy_cn_accounts',
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
      startLogin: codebuddyCnService.startCodebuddyCnOAuthLogin,
      completeLogin: codebuddyCnService.completeCodebuddyCnOAuthLogin,
      cancelLogin: codebuddyCnService.cancelCodebuddyCnOAuthLogin,
    },
    dataService: {
      importFromJson: codebuddyCnService.importCodebuddyCnFromJson,
      importFromLocal: codebuddyCnService.importCodebuddyCnFromLocal,
      addWithToken: codebuddyCnService.addCodebuddyCnAccountWithToken,
      exportAccounts: codebuddyCnService.exportCodebuddyCnAccounts,
      injectToVSCode: codebuddyCnService.injectCodebuddyCnToVSCode,
    },
    getDisplayEmail: (account) => getCodebuddyAccountDisplayEmail(account),
  });

  const accountsForInstances = useMemo(
    () =>
      [...store.accounts].sort((a, b) => {
        const currentFirstDiff = compareCurrentAccountFirst(a.id, b.id, store.currentAccountId);
        if (currentFirstDiff !== 0) {
          return currentFirstDiff;
        }
        const diff = b.created_at - a.created_at;
        return page.sortDirection === 'desc' ? diff : -diff;
      }),
    [page.sortDirection, store.accounts, store.currentAccountId],
  );

  return (
    <div className={`ghcp-accounts-page ${codebuddyCnPlatformConfig.pageClassName}`}>
      <PlatformOverviewTabsHeader
        platform="codebuddy_cn"
        active={activeTab}
        onTabChange={setActiveTab}
        tabs={['overview', 'sessions', 'instances']}
      />
      {activeTab === 'instances' ? (
        <CodebuddyCnInstancesContent accountsForSelect={accountsForInstances} />
      ) : activeTab === 'sessions' ? (
        <CodebuddySessionManager platform="cn" accounts={store.accounts as any} />
      ) : (
        <CodebuddySuiteAccountsSharedView
          accounts={store.accounts}
          loading={store.loading}
          page={page}
          platformConfig={codebuddyCnPlatformConfig}
          onRefreshAccounts={() => { store.fetchAccounts(); }}
        />
      )}
    </div>
  );
}
