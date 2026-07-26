import { useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { ConfirmModal } from "../../kit/Modal.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import {
  decideAdLearningCandidate,
  getAdCenterState,
  getAdContributionSummary,
  rechargeAdWallet,
  refundAdWallet,
  toggleCampaignStatus,
} from "../../mock/adCenterMock.js";
import { EDITIONS, POLICY_KEYS, hasPolicy } from "../../../shared/editionPolicy.js";

const STATUS_LABEL = {
  running: "投放中",
  paused: "已暂停",
  completed: "已结束",
  pending_approval: "待审批",
};

const STATUS_TONE = {
  running: "success",
  paused: "warning",
  completed: "neutral",
  pending_approval: "danger",
};

function CampaignListView({ state, onChange, navigate }) {
  const toast = useToast();
  const [confirmTarget, setConfirmTarget] = useState(null);
  const { wallet, campaigns, budgetRiskAlerts = [], learningCandidate } = state;
  const contributionSummary = getAdContributionSummary();
  const pendingApprovals = campaigns.filter((c) => c.approvalState === "pending");
  const canApproveCandidate = hasPolicy(EDITIONS.FOUNDER, POLICY_KEYS.EVOLUTION_FULL_CONTROL);

  function handleToggle(campaignId) {
    onChange(toggleCampaignStatus(campaignId));
    toast("投放状态已更新", "success");
  }

  function handleCandidateDecision(decision) {
    onChange(decideAdLearningCandidate(decision));
    toast(decision === "approve" ? "已批准灰度实验" : "已驳回该建议", "success");
  }

  return (
    <div>
      <PageHeader
        title="广告中心"
        subtitle="独立的广告资金账户，与 Token 中心账户完全分离"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <DemoBadge />
            <Button variant="secondary" onClick={() => navigate("adCenter", { subView: "refund" })}>
              退还剩余余额
            </Button>
            <Button variant="primary" onClick={() => navigate("adCenter", { subView: "recharge" })}>
              + 充值
            </Button>
          </div>
        }
      />

      <div className="fdr-card" style={{ background: "var(--bg-secondary, #f8f9fb)" }}>
        <strong>广告决策优化贡献利润，不只是 GMV 或表面 ROI/ROAS。</strong>
        <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          贡献利润 = 归因营收 − 商品成本 − 平台佣金 − 广告花费 − 退款损失 − 履约成本 − 内容/Token 成本。一个 ROAS 很高的计划仍可能贡献利润为负。
        </p>
      </div>

      <StatGrid>
        <StatCard label="可用余额" value={`¥ ${wallet.available.toLocaleString()}`} />
        <StatCard label="冻结中" value={`¥ ${wallet.frozen.toLocaleString()}`} />
        <StatCard label="今日花费" value={`¥ ${wallet.todaySpend.toLocaleString()}`} />
        <StatCard label="累计花费" value={`¥ ${wallet.totalSpend.toLocaleString()}`} />
      </StatGrid>
      <StatGrid>
        <StatCard label="归因营收合计" value={`¥ ${contributionSummary.revenue.toLocaleString()}`} />
        <StatCard label="广告花费合计" value={`¥ ${contributionSummary.spend.toLocaleString()}`} />
        <StatCard
          label="贡献利润合计"
          value={`¥ ${contributionSummary.contributionProfit.toLocaleString()}`}
        />
        <StatCard label="待审批计划" value={pendingApprovals.length} />
      </StatGrid>

      {budgetRiskAlerts.length > 0 ? (
        <div className="fdr-card">
          <h3 className="fdr-card__title">预算风险提醒</h3>
          {budgetRiskAlerts.map((alert) => (
            <div key={alert.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-color, #eee)" }}>
              <strong>{alert.campaignName}</strong>
              <span style={{ marginLeft: 8, fontSize: 13, color: "var(--text-secondary)" }}>{alert.detail}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="fdr-card">
        <h3 className="fdr-card__title">投放计划</h3>
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
              render: (r) => (
                <span style={{ color: r.contributionProfit < 0 ? "var(--danger, #d92d20)" : "inherit", fontWeight: 600 }}>
                  ¥{r.contributionProfit.toLocaleString()}
                </span>
              ),
            },
            {
              key: "status",
              label: "状态",
              render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</StatusPill>,
            },
            {
              key: "actions",
              label: "操作",
              render: (r) =>
                r.status === "running" || r.status === "paused" ? (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmTarget(r)}>
                    {r.status === "running" ? "暂停" : "恢复"}
                  </Button>
                ) : null,
            },
          ]}
          rows={campaigns}
          emptyMessage="暂无投放计划"
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">AI 建议</h3>
        {campaigns.filter((c) => c.aiRecommendation).map((c) => (
          <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-color, #eee)", fontSize: 13 }}>
            <strong>{c.name}</strong>
            <span style={{ marginLeft: 8, color: "var(--text-secondary)" }}>{c.aiRecommendation}</span>
          </div>
        ))}
      </div>

      {learningCandidate ? (
        <div className="fdr-card">
          <h3 className="fdr-card__title">广告学习候选（人机边界：Founder 决策，不自动生效）</h3>
          <p style={{ fontSize: 13, margin: "0 0 4px 0" }}><strong>{learningCandidate.affectedScope}</strong> · {learningCandidate.candidateType}</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px 0" }}>证据：{learningCandidate.evidence}</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px 0" }}>预期收益：{learningCandidate.expectedBenefit}</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px 0" }}>可能风险：{learningCandidate.possibleRisk}</p>
          {learningCandidate.status === "candidate" && canApproveCandidate ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="primary" onClick={() => handleCandidateDecision("approve")}>批准灰度实验</Button>
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

function RechargeView({ state, onChange, navigate }) {
  const toast = useToast();
  const [amount, setAmount] = useState(1000);
  const { wallet, rechargeHistory } = state;

  return (
    <div>
      <PageHeader
        title="充值广告钱包"
        subtitle="只影响广告钱包余额，与 Token 钱包完全独立"
        actions={<Button variant="ghost" onClick={() => navigate("adCenter")}>← 返回广告中心</Button>}
      />
      <div className="fdr-card">
        <StatGrid>
          <StatCard label="当前余额" value={`¥ ${wallet.available.toLocaleString()}`} />
        </StatGrid>
        <div className="fdr-field">
          <label className="fdr-field__label">充值金额（¥）</label>
          <input className="fdr-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <Button
          variant="primary"
          onClick={() => {
            onChange(rechargeAdWallet(Number(amount)));
            toast(`已充值 ¥${amount}`, "success");
          }}
        >
          确认充值
        </Button>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">充值记录</h3>
        <DataTable
          columns={[
            { key: "createdAt", label: "时间", render: (r) => new Date(r.createdAt).toLocaleString("zh-CN") },
            { key: "amount", label: "金额", render: (r) => `+¥${r.amount.toLocaleString()}` },
            { key: "note", label: "说明" },
          ]}
          rows={rechargeHistory}
          emptyMessage={<EmptyState icon="◉" message="暂无充值记录" />}
        />
      </div>
    </div>
  );
}

function RefundView({ state, onChange, navigate }) {
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [destination, setDestination] = useState("");
  const { wallet, refundHistory } = state;
  const refundable = wallet.available;

  return (
    <div>
      <PageHeader
        title="退还广告钱包余额"
        subtitle="只能退还可用余额；冻结中与已花费部分不可退，仅作用于广告钱包"
        actions={<Button variant="ghost" onClick={() => navigate("adCenter")}>← 返回广告中心</Button>}
      />
      <div className="fdr-card">
        <StatGrid>
          <StatCard label="当前可用余额" value={`¥ ${wallet.available.toLocaleString()}`} />
          <StatCard label="可退余额" value={`¥ ${refundable.toLocaleString()}`} />
        </StatGrid>
        <div className="fdr-field">
          <label className="fdr-field__label">退款金额（¥，不超过可退余额）</label>
          <input
            className="fdr-input"
            type="number"
            max={refundable}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">退款去向</label>
          <input
            className="fdr-input"
            placeholder="例如：对公账户 / 支付宝账户"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          disabled={!amount || Number(amount) <= 0 || !destination}
          onClick={() => {
            onChange(refundAdWallet(Number(amount), destination));
            toast(`已退款 ¥${amount} 至「${destination}」`, "success");
            setAmount(0);
            setDestination("");
          }}
        >
          确认退款
        </Button>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">退款记录</h3>
        <DataTable
          columns={[
            { key: "createdAt", label: "时间", render: (r) => new Date(r.createdAt).toLocaleString("zh-CN") },
            { key: "amount", label: "金额", render: (r) => `-¥${r.amount.toLocaleString()}` },
            { key: "destination", label: "去向" },
          ]}
          rows={refundHistory}
          emptyMessage={<EmptyState icon="↩" message="暂无退款记录" />}
        />
      </div>
    </div>
  );
}

export function AdCenterModule() {
  const { subView, navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getAdCenterState());
  const view = subView ?? "overview";

  if (view === "recharge") {
    return <RechargeView state={state} onChange={setState} navigate={navigate} />;
  }
  if (view === "refund") {
    return <RefundView state={state} onChange={setState} navigate={navigate} />;
  }
  return <CampaignListView state={state} onChange={setState} navigate={navigate} />;
}
