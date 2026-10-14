import { useTranslation } from 'react-i18next';
import { PlatformInstancesContent } from '../components/platform/PlatformInstancesContent';
import { DosageNotifyQuotaPreview } from '../components/platform/DosageNotifyQuotaPreview';
import { usePlatformRuntimeSupport } from '../hooks/usePlatformRuntimeSupport';
import { useZcodeAccountStore } from '../stores/useZcodeAccountStore';
import { useZcodeInstanceStore } from '../stores/useZcodeInstanceStore';
import {
  getZcodeAccountDisplayEmail,
  getZcodePlanBadge,
  getZcodeUsage,
  type ZcodeAccount,
} from '../types/zcode';

interface ZcodeInstancesContentProps {
  accountsForSelect?: ZcodeAccount[];
}

export function ZcodeInstancesContent({
  accountsForSelect,
}: ZcodeInstancesContentProps = {}) {
  const { t, i18n } = useTranslation();
  const accountStore = useZcodeAccountStore();
  const instanceStore = useZcodeInstanceStore();
  const accounts = accountsForSelect ?? accountStore.accounts;
  const isSupported = usePlatformRuntimeSupport('desktop');

  return (
    <PlatformInstancesContent<ZcodeAccount>
      instanceStore={instanceStore}
      accounts={accounts}
      fetchAccounts={accountStore.fetchAccounts}
      renderAccountQuotaPreview={(account) => (
        <DosageNotifyQuotaPreview
          usage={getZcodeUsage(account)}
          locale={i18n.language || 'vi'}
          emptyText={t('instances.quota.empty', '暂无配额缓存')}
          normalText={t('zcode.usageNormal', '正常')}
          abnormalText={t('zcode.usageAbnormal', '异常')}
          abnormalDisplay="short"
        />
      )}
      renderAccountBadge={(account) => {
        const plan = getZcodePlanBadge(account);
        return <span className="instance-plan-badge">{plan}</span>;
      }}
      getAccountDisplayText={getZcodeAccountDisplayEmail}
      getAccountSearchText={(account) =>
        `${getZcodeAccountDisplayEmail(account)} ${getZcodePlanBadge(account)} ${account.provider}`
      }
      appType="zcode"
      isSupported={isSupported}
      unsupportedTitleKey="common.shared.instances.unsupported.title"
      unsupportedTitleDefault="Hệ điều hành hiện tại chưa được hỗ trợ"
      unsupportedDescKey="zcode.instances.unsupported"
      unsupportedDescDefault="Đa cửa sổ ZCode chỉ hỗ trợ macOS, Windows và Linux."
    />
  );
}
