import { useState } from "react";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";
import { ConfirmModal } from "../../../kit/Modal.jsx";
import { EmptyState } from "../../../kit/EmptyState.jsx";
import { useToast } from "../../../kit/useToast.js";
import {
  decideAdLearningCandidate,
  getAdCenterState,
  getAdContributionSummary,
  toggleCampaignStatus,
} from "../../../mock/adCenterMock.js";

/**
 * Operator 实验室"广告投放"——经营执行视角：预算/暂停恢复/审批/
 * ROAS/贡献利润/预算风险提醒/投放记录。复用 Founder Capability
 * 中心"广告策略研发"（AdCenterModule）同一份 `adCenterMock.js`
 * 演示数据（这是 Founder 自己的模块，不是独立 /operator 的文件，
 * 复用它不违反"本批次不改动独立 /operator、/studio"的约束），但
 * 不暴露充值/退款钱包财务操作——那是 Founder 侧的资金管理动作，
 * 不属于经营者日常执行视角，避免和 Capability 中心里的入口变成
 * 一模一样的两份 UI。
 */

const STATUS_LABEL = { running: "投放中", paused: "已暂停", completed: "已结束", pending_approval: "待审批" };
const STATUS_TONE = { running: "success", paused: "warning", completed: "neutral", pending_approval: "danger" };

export function AdOpsPage() {
  const toast = useToast();
  const [state, setState] = useState(() => getAdCenterState());
  const [confirmTarget, setConfirmTarget] = useState(null);
  const { wallet, campaigns, budgetRiskAlerts = [], learningCandidate } = state;
  const contributionSummary = getAdContributionSummary();
  const pendingApprovals = campaigns.filter((c) => c.approvalState === "pending");

  function handleToggle(campaignId) {
    setState(toggleCampaignStatus(campaignId));
    toast("投放状态已更新", "success");
  }

  function handleCandidateDecision(decision) {
    setState(decideAdLearningCandidate(decision));
    toast(decision === "approve" ? "已批准灰度实验" : "已驳回该建议", "success");
  }

  return (
    <div>
      <PageHeader
        title="广告投放"
        subtitle="投放执行、暂停/恢复、审批与预算风险——授权范围内的经营操作"
        actions={<DemoBadge />}
      />

      <StatGrid>
        <StatCard label="广告可用预算" value={`¥${wallet.available.toLocaleString()}`} />
        <StatCard label="今日花费" value={`¥${wallet.todaySpend.toLocaleString()}`} />
        <StatCard label="待审批计划" value={pendingApprovals.length} />
        <StatCard label="贡献利润合计" value={`¥${contributionSummary.contributionProfit.toLocaleString()}`} />
      </StatGrid>

      {budgetRiskAlerts.length > 0 ? (
        <div className="fdr-card">
          <h3 className="fdr-card__title">预算风险提醒</h3>
          {budgetRiskAlerts.map((alert) => (
            <div key={alert.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <strong>{alert.campaignName}</strong>
              <span style={{ marginLeft: 8, fontSize: 13, color: "var(--text-secondary)" }}>{alert.detail}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="fdr-card">
        <h3 className="fdr-card__title">投放计划</h3>
        {campaigns.length === 0 ? (
          <EmptyState icon="■" message="暂无投放计划" />
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "计划名称" },
              { key: "platform", label: "平台" },
              { key: "budget", label: "预算", render: (r) => `¥${r.budget}` },
              { key: "spend", label: "已花费", render: (r) => `¥${r.spend}` },
              { key: "roas", label: "ROAS", render: (r) => (r.roas != null ? r.roas.toFixed(1) : "—") },
              {
                key: "contributionProfit",
                label: "贡献利润",
                render: (r) => <span style={{ color: r.contributionProfit < 0 ? "var(--danger, #d92d20)" : "inherit", fontWeight: 600 }}>¥{r.contributionProfit.toLocaleString()}</span>,
              },
              { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</StatusPill> },
              {
                key: "actions",
                label: "操作",
                render: (r) => (r.status === "running" || r.status === "paused" ? (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmTarget(r)}>{r.status === "running" ? "暂停" : "恢复"}</Button>
                ) : null),
              },
            ]}
            rows={campaigns}
          />
        )}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">投放建议</h3>
        {campaigns.filter((c) => c.aiRecommendation).length === 0 ? (
          <EmptyState icon="◔" message="暂无新的投放建议" />
        ) : (
          campaigns.filter((c) => c.aiRecommendation).map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <strong>{c.name}</strong>
              <span style={{ marginLeft: 8, color: "var(--text-secondary)" }}>{c.aiRecommendation}</span>
            </div>
          ))
        )}
      </div>

      {learningCandidate ? (
        <div className="fdr-card">
          <h3 className="fdr-card__title">待审批：广告学习候选</h3>
          <p style={{ fontSize: 13, margin: "0 0 4px 0" }}><strong>{learningCandidate.affectedScope}</strong> · {learningCandidate.candidateType}</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px 0" }}>{learningCandidate.evidence}</p>
          {learningCandidate.status === "candidate" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="primary" onClick={() => handleCandidateDecision("approve")}>批准</Button>
              <Button size="sm" variant="secondary" onClick={() => handleCandidateDecision("reject")}>驳回</Button>
            </div>
          ) : (
            <StatusPill tone={learningCandidate.status === "rejected" ? "danger" : "info"}>{learningCandidate.status}</StatusPill>
          )}
        </div>
      ) : null}

      <ConfirmModal
        open={!!confirmTarget}
        title={confirmTarget?.status === "running" ? "暂停投放" : "恢复投放"}
        message={`确认${confirmTarget?.status === "running" ? "暂停" : "恢复"}「${confirmTarget?.name}」吗？`}
        confirmLabel={confirmTarget?.status === "running" ? "暂停" : "恢复"}
        onConfirm={() => handleToggle(confirmTarget.id)}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}
