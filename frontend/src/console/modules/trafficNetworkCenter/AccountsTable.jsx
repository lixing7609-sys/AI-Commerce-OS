import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { getStoreName } from "../../mock/storesMock.js";
import { getAccountTypeLabel } from "../../mock/trafficNetworkMock.js";

const QUALITY_TONE = { 高: "success", 中: "warning", 低: "danger" };
const RISK_TONE = { 低: "success", 中: "warning", 高: "danger" };

export function AccountsTable({ accounts, emptyMessage = "暂无账号" }) {
  if (accounts.length === 0) {
    return <EmptyState icon="◆" message={emptyMessage} />;
  }
  return (
    <DataTable
      columns={[
        { key: "account", label: "账号" },
        { key: "accountType", label: "类型", render: (r) => getAccountTypeLabel(r.accountType) },
        { key: "platform", label: "平台" },
        { key: "storeBinding", label: "店铺绑定", render: (r) => (r.storeBinding ? getStoreName(r.storeBinding) : "不绑定") },
        { key: "category", label: "类目" },
        { key: "followers", label: "粉丝数", render: (r) => r.followers.toLocaleString() },
        { key: "monthlyImpressions", label: "月曝光量", render: (r) => r.monthlyImpressions.toLocaleString() },
        { key: "trafficQuality", label: "流量质量", render: (r) => <StatusPill tone={QUALITY_TONE[r.trafficQuality] ?? "neutral"}>{r.trafficQuality}</StatusPill> },
        { key: "commercialValue", label: "商业价值" },
        { key: "growth", label: "增长" },
        { key: "risk", label: "风险", render: (r) => <StatusPill tone={RISK_TONE[r.risk] ?? "neutral"}>{r.risk}</StatusPill> },
        { key: "status", label: "状态" },
      ]}
      rows={accounts}
      emptyMessage={emptyMessage}
    />
  );
}
