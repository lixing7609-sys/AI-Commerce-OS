import { useMemo, useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { DEMO_STORES, getStoreName } from "../../mock/storesMock.js";
import { AUTOMATION_MODES, getUnifiedConversations } from "../../mock/dailyCustomerServiceMock.js";

const STATUS_TONE = {
  "AI 处理中": "info", "AI 等待信息": "neutral", "建议人工接管": "warning", "等待人工接管": "warning",
  "人工处理中": "info", "人工暂时离开": "warning", "已交还 AI": "neutral", "已完成": "success",
  待受理: "neutral", AI分析中: "info", 待补充证据: "warning", 待经营者确认: "warning", 待审批: "warning",
  等待买家: "neutral", 等待物流: "neutral", 等待平台: "warning", 处理中: "info", 平台介入: "danger",
  已同意: "success", 已驳回: "danger", 已退款: "success", 已补发: "success", 已换货: "success",
  异常: "danger", 已关闭: "neutral",
};

/**
 * 统一会话：日常客服会话 + 售后客服工单汇总在同一份跨类型列表里
 * 做筛选（阶段客服中心修正）——点击行按类型分别跳回各自详情
 * （日常客服/售后客服标签页），不是另建一套详情页。
 */
export function UnifiedConversations() {
  const { navigate } = useConsoleNavContext();
  const [rows] = useState(() => getUnifiedConversations());
  const [storeFilter, setStoreFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => rows.filter((r) => {
    if (storeFilter && r.storeId !== storeFilter) return false;
    if (platformFilter && r.platform !== platformFilter) return false;
    if (kindFilter && r.kind !== kindFilter) return false;
    if (riskFilter && r.riskLevel !== riskFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  }), [rows, storeFilter, platformFilter, kindFilter, riskFilter, statusFilter]);

  const platforms = [...new Set(rows.map((r) => r.platform))];
  const statuses = [...new Set(rows.map((r) => r.status))];

  return (
    <div>
      <div className="fdr-card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
            <option value="">全部店铺</option>
            {DEMO_STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="fdr-select" style={{ maxWidth: 140 }} value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            <option value="">全部平台</option>
            {platforms.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select className="fdr-select" style={{ maxWidth: 140 }} value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="">全部会话类型</option>
            <option value="daily">日常客服</option>
            <option value="afterSales">售后客服</option>
          </select>
          <select className="fdr-select" style={{ maxWidth: 140 }} value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
            <option value="">全部风险</option>
            <option value="低">低</option>
            <option value="中">中</option>
            <option value="高">高</option>
          </select>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "kind", label: "类型", render: (r) => <StatusPill tone={r.kind === "daily" ? "info" : "neutral"}>{r.kind === "daily" ? "日常客服" : "售后客服"}</StatusPill> },
            { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
            { key: "platform", label: "平台" },
            { key: "customer", label: "客户" },
            { key: "product", label: "关联商品" },
            { key: "orderNumber", label: "关联订单", render: (r) => r.orderNumber ?? "—" },
            { key: "conversationType", label: "会话类型" },
            { key: "responsibleAgent", label: "负责 Agent" },
            { key: "humanOwner", label: "人工负责人", render: (r) => r.humanOwner ?? "—" },
            { key: "automationMode", label: "自动化模式", render: (r) => AUTOMATION_MODES.find((m) => m.key === r.automationMode)?.label ?? r.automationMode },
            { key: "riskLevel", label: "风险" },
            { key: "responseDeadline", label: "响应时限", render: (r) => new Date(r.responseDeadline).toLocaleString("zh-CN") },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
          ]}
          rows={filtered}
          onRowClick={(row) => navigate("customerServiceCenter", { subView: row.kind === "daily" ? "daily" : "afterSales" })}
          emptyMessage={<EmptyState icon="◎" message="当前筛选条件下暂无会话" />}
        />
      </div>
    </div>
  );
}
