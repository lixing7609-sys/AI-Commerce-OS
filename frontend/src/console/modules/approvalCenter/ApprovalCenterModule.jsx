import { useEffect, useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getDeliverables, approveDeliverable, rejectDeliverable } from "../../../services/deliverableApi.js";
import { safeCall } from "../../realDataSafe.js";
import { decideRequest, getApprovalRequests, getApprovalTypeLabel } from "../../mock/approvalMock.js";

const TABS = [
  { key: "pending", label: "待审批" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已驳回" },
];

const RISK_TONE = { high: "danger", medium: "warning", low: "neutral" };

/**
 * 阶段 Founder UX Review V4，P0-39：审批中心扩展支持内容/直播/
 * 售后来源的审批类型与筛选——不同来源模块的审批混合展示在同一个
 * 队列里，字段统一为来源模块/店铺/平台/对象/风险/金额或成本/
 * 时限/AI建议/证据/相关规则，保持审批中心作为唯一审批入口。
 */
export function ApprovalCenterModule() {
  const { subView, navigate } = useConsoleNavContext();
  const activeTab = subView ?? "pending";
  const toast = useToast();
  const [requests, setRequests] = useState(() => getApprovalRequests());
  const [pendingDeliverables, setPendingDeliverables] = useState({ connected: false, data: null });
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    safeCall(() => getDeliverables({ status: "pending_review", limit: 20 })).then(setPendingDeliverables);
  }, []);

  // Deliverable 数据模型本身保留（真实后端 AI 任务产出），但"成果
  // 中心"作为独立业务模块已在阶段 V4.2 移除——这里读取的是真实
  // 待审核 Deliverable，批准/驳回后从这个待审队列里移除，不会
  // 永久停留在审批中心里（阶段 V4.2 架构修正要求）。
  const deliverableRows = (pendingDeliverables.data?.items ?? []).map((item) => ({
    id: `deliverable-${item.id}`,
    deliverableId: item.id,
    type: "deliverable",
    requestedBy: item.agent_name,
    summary: item.title,
    riskLevel: "low",
    status: "pending",
    createdAt: item.created_at,
    sourceModule: "AI 任务成果",
  }));

  const allTypes = [...new Set([...deliverableRows, ...requests].map((r) => r.type))];
  let allRows = [...deliverableRows, ...requests].filter((r) => r.status === activeTab);
  if (typeFilter) allRows = allRows.filter((r) => r.type === typeFilter);

  async function handleDecision(row, decision) {
    if (row.type === "deliverable") {
      try {
        if (decision === "approved") await approveDeliverable(row.deliverableId);
        if (decision === "rejected") await rejectDeliverable(row.deliverableId);
        setPendingDeliverables((prev) => ({
          ...prev,
          data: { ...prev.data, items: prev.data.items.filter((i) => i.id !== row.deliverableId) },
        }));
        toast(decision === "approved" ? "已批准" : "已驳回", "success");
      } catch {
        toast("操作失败，请稍后重试", "danger");
      }
      return;
    }
    setRequests(decideRequest(row.id, decision));
    toast(decision === "approved" ? "已批准" : decision === "rejected" ? "已驳回" : "已退回修改", "success");
  }

  return (
    <div>
      <PageHeader title="审批中心" subtitle="所有需要人工确认的事项——内容/直播/售后/广告/Agent 发布统一在这里审批" />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={(t) => navigate("approvalCenter", { subView: t })} />

      <div className="fdr-card">
        <div className="fdr-field" style={{ margin: 0, maxWidth: 240 }}>
          <label className="fdr-field__label">按来源类型筛选</label>
          <select className="fdr-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">全部类型</option>
            {allTypes.map((t) => (
              <option key={t} value={t}>{getApprovalTypeLabel(t)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "type", label: "类型", render: (r) => getApprovalTypeLabel(r.type) },
            { key: "sourceModule", label: "来源模块", render: (r) => r.sourceModule ?? "—" },
            { key: "store", label: "店铺", render: (r) => r.store ?? "—" },
            { key: "object", label: "对象", render: (r) => r.object ?? r.summary },
            { key: "amountOrCost", label: "金额/成本", render: (r) => r.amountOrCost ?? "—" },
            { key: "deadline", label: "时限", render: (r) => (r.deadline ? new Date(r.deadline).toLocaleString("zh-CN") : "—") },
            { key: "aiRecommendation", label: "AI 建议", render: (r) => r.aiRecommendation ?? "—" },
            { key: "riskLevel", label: "风险", render: (r) => <StatusPill tone={RISK_TONE[r.riskLevel] ?? "neutral"}>{r.riskLevel}</StatusPill> },
            {
              key: "actions",
              label: "操作",
              render: (r) =>
                r.status === "pending" ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button size="sm" variant="primary" onClick={() => handleDecision(r, "approved")}>通过</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDecision(r, "rejected")}>驳回</Button>
                    {r.type !== "deliverable" ? (
                      <Button size="sm" variant="ghost" onClick={() => handleDecision(r, "returned")}>退回修改</Button>
                    ) : null}
                  </div>
                ) : (
                  <StatusPill tone={r.status === "approved" ? "success" : "danger"}>{r.status === "approved" ? "已通过" : "已驳回"}</StatusPill>
                ),
            },
          ]}
          rows={allRows}
          emptyMessage={<EmptyState icon="☑" message="暂无记录" />}
        />
      </div>
    </div>
  );
}
