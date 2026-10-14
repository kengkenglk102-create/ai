import { useMemo, useState } from 'react';
import { PlatformOverviewTabsHeader, PlatformOverviewTab } from '../components/platform/PlatformOverviewTabsHeader';
import { WorkbuddyInstancesContent } from './WorkbuddyInstancesPage';
import { useWorkbuddyAccountStore } from '../stores/useWorkbuddyAccountStore';
import * as workbuddyService from '../services/workbuddyService';
import { syncWorkbuddyToCodebuddyCn } from '../services/codebuddyCnService';
import {
  WorkbuddyAccount,
  getWorkbuddyAccountDisplayEmail,
  getWorkbuddyPlanBadge,
  getWorkbuddyUsage,
  getWorkbuddyQuotaCategoryGroups,
} from '../types/workbuddy';
import { useProviderAccountsPage } from '../hooks/useProviderAccountsPage';
import { WorkbuddyCheckinModal } from '../components/codebuddy-suite/CodebuddySuiteCheckinModal';
import { CodebuddySessionManager } from '../components/codebuddy/CodebuddySessionManager';
import { CodebuddySuiteAccountsSharedView, type CodebuddySuiteAccountsPlatformConfig } from '../components/codebuddy-suite/CodebuddySuiteAccountsSharedView';
import { compareCurrentAccountFirst } from '../utils/currentAccountSort';

const WORKBUDDY_FLOW_NOTICE_COLLAPSED_KEY = 'agtools.workbuddy.flow_notice_collapsed';
const WORKBUDDY_CURRENT_ACCOUNT_ID_KEY = 'agtools.workbuddy.current_account_id';

const workbuddyPlatformConfig: CodebuddySuiteAccountsPlatformConfig<WorkbuddyAccount> = {
  pageClassName: 'workbuddy-accounts-page',
  quickSettingsType: 'workbuddy',
  searchPlaceholderKey: 'workbuddy.search',
  searchPlaceholderDefault: 'Tìm kiếm tài khoản WorkBuddy...',
  flowNotice: {
    titleKey: 'workbuddy.flowNotice.title',
    titleDefault: 'Hướng dẫn quản lý tài khoản WorkBuddy (nhấp để mở/thu gọn)',
    descKey: 'workbuddy.flowNotice.desc',
    descDefault: 'Khi chuyển tài khoản cần đọc dữ liệu xác thực cục bộ của WorkBuddy và mã hóa/giải mã qua chứng thực hệ thống. Dữ liệu chỉ xử lý trên máy.',
    permissionKey: 'workbuddy.flowNotice.permission',
    permissionDefault: 'Phạm vi quyền hạn: Đọc cơ sở dữ liệu xác thực WorkBuddy, dùng chứng thực hệ thống (macOS Keychain / Windows DPAPI / Linux Secret Service) để giải mã và ghi.',
    networkKey: 'workbuddy.flowNotice.network',
    networkDefault: 'Phạm vi mạng: Đăng nhập OAuth và làm mới Token cần kết nối dịch vụ WorkBuddy. Không tải lên khóa hoặc thông tin chứng thực.',
  },
  noAccountsKey: 'workbuddy.noAccounts',
  noAccountsDefault: 'Chưa có tài khoản WorkBuddy',
  addAccountTitleKey: 'workbuddy.addAccount',
  addAccountTitleDefault: 'Thêm tài khoản WorkBuddy',
  oauthDescKey: 'workbuddy.oauthDesc',
  oauthDescDefault: 'Nhấp vào nút bên dưới để mở trang ủy quyền WorkBuddy trong trình duyệt.',
  oauthFeatureCardClassName: 'workbuddy-oauth-feature-card',
  oauthFeatureTitleKey: 'workbuddy.oauthFeature.oauth.title',
  oauthFeatureTitleDefault: 'Chỉ ủy quyền thông tin đăng nhập IDE',
  oauthFeatureItem1Key: 'workbuddy.oauthFeature.oauth.item1',
  oauthFeatureItem1Default: 'Sau khi hoàn tất OAuth trên trình duyệt có thể thêm tài khoản và dùng để chuyển đổi IDE.',
  oauthFeatureItem2Key: 'workbuddy.oauthFeature.oauth.item2',
  oauthFeatureItem2Default: 'Sau khi ủy quyền xong sẽ tự động làm mới dữ liệu hạn mức gói tài nguyên.',
  oauthFeatureItem3Key: 'workbuddy.oauthFeature.oauth.item3',
  oauthFeatureItem3Default: 'Thẻ tài khoản sẽ hiển thị hạn mức, tiến trình và thời gian làm mới/hết hạn theo gói tài nguyên.',
  oauthUrlInputPlaceholderKey: 'workbuddy.oauthUrlInputPlaceholder',
  oauthUrlInputPlaceholderDefault: 'Có thể nhập thủ công địa chỉ ủy quyền',
  oauthWaitingKey: 'workbuddy.oauthWaiting',
  oauthWaitingDefault: 'Đang chờ hoàn tất ủy quyền...',
  tokenDescKey: 'workbuddy.tokenDesc',
  tokenDescDefault: 'Dán access token của WorkBuddy:',
  importLocalDescKey: 'workbuddy.import.localDesc',
  importLocalDescDefault: 'Hỗ trợ nhập dữ liệu tài khoản từ ứng dụng WorkBuddy cục bộ hoặc tệp JSON.',
  importLocalClientKey: 'workbuddy.import.localClient',
  importLocalClientDefault: 'Nhập từ ứng dụng WorkBuddy cục bộ',
  syncButtonTitle: (t) => `${t('common.shared.import.label', '导入')} ${t('nav.codebuddyCn', 'CodeBuddy CN')}`,
  syncSuccessMessage: (t, count) => t('common.shared.token.importSuccessMsg', '成功导入 {{count}} 个账号', { count }),
  syncFailedMessage: (t, error) => t('common.shared.token.importFailedMsg', '导入失败: {{error}}', { error }),
  runSync: () => syncWorkbuddyToCodebuddyCn(),
  getDisplayEmail: (account) => getWorkbuddyAccountDisplayEmail(account),
  getPlanBadge: (account) => getWorkbuddyPlanBadge(account),
  getUsage: (account) => getWorkbuddyUsage(account),
  getQuotaGroups: (account, t) => getWorkbuddyQuotaCategoryGroups(account, t),
  hasQuotaData: (_account, groups) => groups.some((g) => g.items.length > 0),
  usagePrefix: 'workbuddy',
  quotaPrefix: 'workbuddy',
  tableUsageClassName: 'workbuddy-table-usage',
  CheckinModal: WorkbuddyCheckinModal,
};

export function WorkbuddyAccountsPage() {
  const [activeTab, setActiveTab] = useState<PlatformOverviewTab>('overview');
  const store = useWorkbuddyAccountStore();

  const page = useProviderAccountsPage<WorkbuddyAccount>({
    platformKey: 'WorkBuddy',
    oauthLogPrefix: 'WorkbuddyOAuth',
    flowNoticeCollapsedKey: WORKBUDDY_FLOW_NOTICE_COLLAPSED_KEY,
    currentAccountIdKey: WORKBUDDY_CURRENT_ACCOUNT_ID_KEY,
    exportFilePrefix: 'workbuddy_accounts',
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
      startLogin: workbuddyService.startWorkbuddyOAuthLogin,
      completeLogin: workbuddyService.completeWorkbuddyOAuthLogin,
      cancelLogin: workbuddyService.cancelWorkbuddyOAuthLogin,
    },
    dataService: {
      importFromJson: workbuddyService.importWorkbuddyFromJson,
      importFromLocal: workbuddyService.importWorkbuddyFromLocal,
      addWithToken: workbuddyService.addWorkbuddyAccountWithToken,
      exportAccounts: workbuddyService.exportWorkbuddyAccounts,
      injectToVSCode: workbuddyService.injectWorkbuddyToVSCode,
      openWebview: workbuddyService.openWorkbuddyWebview,
    },
    getDisplayEmail: (account) => getWorkbuddyAccountDisplayEmail(account),
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
    <div className={`ghcp-accounts-page ${workbuddyPlatformConfig.pageClassName}`}>
      <PlatformOverviewTabsHeader
        platform="workbuddy"
        active={activeTab}
        onTabChange={setActiveTab}
        tabs={['overview', 'sessions', 'instances']}
      />
      {activeTab === 'sessions' ? (
        <CodebuddySessionManager platform="workbuddy" accounts={store.accounts as any} />
      ) : activeTab === 'instances' ? (
        <WorkbuddyInstancesContent accountsForSelect={accountsForInstances} />
      ) : (
        <CodebuddySuiteAccountsSharedView
          accounts={store.accounts}
          loading={store.loading}
          page={page}
          platformConfig={workbuddyPlatformConfig}
          onRefreshAccounts={() => { store.fetchAccounts(); }}
        />
      )}
    </div>
  );
}
