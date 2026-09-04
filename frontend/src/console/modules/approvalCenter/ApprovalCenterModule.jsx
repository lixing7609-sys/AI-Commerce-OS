import { useEffect, useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { Modal } from "../../kit/Modal.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getDeliverables, approveDeliverable, rejectDeliverable } from "../../../services/deliverableApi.js";
import { safeCall } from "../../realDataSafe.js";
import { decideRequest, getApprovalRequests, getApprovalTypeLabel } from "../../mock/approvalMock.js";
import { decideContentApproval } from "../../mock/contentMock.js";

const TABS = [
  { key: "pending", label: "待审批" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已驳回" },
];

const RISK_TONE = { high: "danger", medium: "warning", low: "neutral" };

function formatPendingDuration(createdAt) {
  if (!createdAt) return "—";
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "不到 1 小时";
  if (hours < 24) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

function ReasonModal({ open, mode, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  return (
    <Modal
      open={open}
      title={mode === "rejected" ? "驳回审批事项" : "要求修改"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant={mode === "rejected" ? "danger" : "primary"} disabled={!note.trim()} onClick={() => { onConfirm(note); setNote(""); }}>
            确认
          </Button>
        </>
      }
    >
      <div className="fdr-field">
        <label className="fdr-field__label">{mode === "rejected" ? "驳回理由（必填）" : "修改说明（必填）"}</label>
        <textarea className="fdr-textarea" style={{ minHeight: 90 }} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

function PreviewModal({ row, onClose }) {
  if (!row) return null;
  return (
    <Modal open={!!row} title={`预览 · ${row.summary ?? row.object}`} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, margin: 0, fontSize: 13 }}>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>来源模块</dt><dd style={{ margin: 0 }}>{row.sourceModule ?? "—"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>店铺</dt><dd style={{ margin: 0 }}>{row.store ?? "—"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>平台</dt><dd style={{ margin: 0 }}>{row.platform ?? "—"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>对象</dt><dd style={{ margin: 0 }}>{row.object ?? row.summary}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>金额/成本</dt><dd style={{ margin: 0 }}>{row.amountOrCost ?? "—"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>Token 成本</dt><dd style={{ margin: 0 }}>{row.tokenCost ?? "—"}</dd></div>
        {row.checks ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>原创度 / 版权 / 合规</dt>
            <dd style={{ margin: 0 }}>{row.checks.originality} · {row.checks.copyright} · {row.checks.compliance}</dd>
          </div>
        ) : null}
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>AI 建议</dt><dd style={{ margin: 0 }}>{row.aiRecommendation ?? "—"}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>证据</dt><dd style={{ margin: 0 }}>{row.evidence ?? "—"}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>相关规则</dt><dd style={{ margin: 0 }}>{row.relatedRules ?? "—"}</dd></div>
      </dl>
    </Modal>
  );
}

/**
 * 阶段 Founder UX Review V4，P0-39：审批中心扩展支持内容/直播/
 * 售后来源的审批类型与筛选——不同来源模块的审批混合展示在同一个
 * 队列里，字段统一为来源模块/店铺/平台/对象/风险/金额或成本/
 * 时限/AI建议/证据/相关规则，保持审批中心作为唯一审批入口。
 */
export function ApprovalCenterModule() {
  const { subView, entityId, navigate } = useConsoleNavContext();
  const activeTab = subView ?? "pending";
  const toast = useToast();
  const [, forceRerender] = useState(0);
  const [pendingDeliverables, setPendingDeliverables] = useState({ connected: false, data: null });
  const [typeFilter, setTypeFilter] = useState("");
  const [reasonModal, setReasonModal] = useState(null);
  const [previewRow, setPreviewRow] = useState(null);

  useEffect(() => {
    safeCall(() => getDeliverables({ status: "pending_review", limit: 20 })).then(setPendingDeliverables);
  }, []);

  const requests = getApprovalRequests();

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

  const deepLinkedRow = entityId ? [...deliverableRows, ...requests].find((r) => r.id === entityId) : null;

  function refresh() {
    forceRerender((n) => n + 1);
  }

  async function handleDecision(row, decision, note) {
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

    const result = row.type === "content_approval" ? decideContentApproval(row.id, decision, note) : decideRequest(row.id, decision, note);
    if (!result.ok) {
      toast(result.error, "danger");
      return;
    }
    refresh();
    toast(decision === "approved" ? "已批准" : decision === "rejected" ? "已驳回" : "已要求修改", "success");
  }

  function requestReason(row, mode) {
    setReasonModal({ row, mode });
  }

  return (
    <div>
      <PageHeader title="审批中心" subtitle="所有需要人工确认的待审批事项——内容/直播/售后/广告/Agent 发布统一在这里审批" actions={<DemoBadge />} />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={(t) => navigate("approvalCenter", { subView: t })} />

      {entityId ? (
        deepLinkedRow ? (
          <div className="fdr-card" style={{ background: "rgba(79,70,229,.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>已定位到审批事项：{deepLinkedRow.summary ?? deepLinkedRow.object}</span>
              <Button size="sm" variant="ghost" onClick={() => navigate("approvalCenter")}>清除定位</Button>
            </div>
          </div>
        ) : (
          <div className="fdr-card">
            <EmptyState icon="⚠" message="未找到该审批事项（链接可能已失效）" action={<Button variant="secondary" onClick={() => navigate("approvalCenter")}>返回审批列表</Button>} />
          </div>
        )
      ) : null}

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
            { key: "summary", label: "标题", render: (r) => r.summary ?? r.object },
            { key: "sourceModule", label: "来源模块", render: (r) => r.sourceModule ?? "—" },
            { key: "store", label: "店铺", render: (r) => r.store ?? "—" },
            { key: "object", label: "对象", render: (r) => r.object ?? r.summary },
            { key: "checks", label: "原创/版权/合规", render: (r) => (r.checks ? `${r.checks.originality} · ${r.checks.copyright} · ${r.checks.compliance}` : "—") },
            { key: "amountOrCost", label: "金额/成本", render: (r) => r.amountOrCost ?? "—" },
            { key: "tokenCost", label: "Token 成本", render: (r) => r.tokenCost ?? "—" },
            { key: "createdAt", label: "提交时间", render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString("zh-CN") : "—") },
            { key: "pendingDuration", label: "待处理时长", render: (r) => (r.status === "pending" ? formatPendingDuration(r.createdAt) : "—") },
            { key: "aiRecommendation", label: "AI 建议", render: (r) => r.aiRecommendation ?? "—" },
            { key: "riskLevel", label: "风险", render: (r) => <StatusPill tone={RISK_TONE[r.riskLevel] ?? "neutral"}>{r.riskLevel}</StatusPill> },
            {
              key: "actions",
              label: "操作",
              render: (r) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Button size="sm" variant="ghost" onClick={() => setPreviewRow(r)}>预览</Button>
                  {r.contentProjectId ? (
                    <Button size="sm" variant="ghost" onClick={() => navigate("contentCenter", { subView: "projects", entityId: r.contentProjectId })}>
                      打开来源项目
                    </Button>
                  ) : null}
                  {r.status === "pending" ? (
                    <>
                      <Button size="sm" variant="primary" onClick={() => handleDecision(r, "approved")}>批准</Button>
                      <Button size="sm" variant="danger" onClick={() => requestReason(r, "rejected")}>驳回</Button>
                      {r.type !== "deliverable" ? (
                        <Button size="sm" variant="secondary" onClick={() => requestReason(r, "returned")}>要求修改</Button>
                      ) : null}
                    </>
                  ) : (
                    <StatusPill tone={r.status === "approved" ? "success" : "danger"}>{r.status === "approved" ? "已通过" : r.status === "rejected" ? "已驳回" : r.status}</StatusPill>
                  )}
                </div>
              ),
            },
          ]}
          rows={allRows}
          emptyMessage={<EmptyState icon="☑" message="暂无待审批事项" />}
        />
      </div>

      <PreviewModal row={previewRow} onClose={() => setPreviewRow(null)} />

      <ReasonModal
        open={!!reasonModal}
        mode={reasonModal?.mode}
        onClose={() => setReasonModal(null)}
        onConfirm={(note) => {
          const { row, mode } = reasonModal;
          setReasonModal(null);
          handleDecision(row, mode, note);
        }}
      />
    </div>
  );
}
