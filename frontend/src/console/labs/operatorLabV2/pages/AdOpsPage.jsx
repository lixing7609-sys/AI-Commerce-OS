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
 *
 * 目标人群/素材/预计效果/复盘属于经营者视角的补充信息，
 * `adCenterMock.js` 本身不带这些字段（避免影响 Founder 侧复用同
 * 一份数据的 AdCenterModule），这里按活动名称在本页内单独补充。
 */

const STATUS_LABEL = { running: "投放中", paused: "已暂停", completed: "已结束", pending_approval: "待审批" };
const STATUS_TONE = { running: "success", paused: "warning", completed: "neutral", pending_approval: "danger" };
const PLATFORM_LABEL = { douyin: "抖音电商", taobao: "淘宝/天猫", xiaohongshu: "小红书" };
const CANDIDATE_STATUS_LABEL = { candidate: "待评测", evaluating: "评测中", experimenting: "灰度实验中", promoted: "已采纳", rejected: "已驳回", rolledBack: "已回滚" };

const CAMPAIGN_EXTRA = {
  "夏季新品推广": { audience: "18-30岁女性 · 近30天浏览过夏季新品", creative: "9张商品图 + 1条15秒短视频", forecast: "预计未来7天带来 GMV 约 ¥5,200，ROAS 维持在 2.3 左右" },
  "店铺新客召回": { audience: "近90天未下单的历史访客", creative: "6张促销图 + 优惠券贴片", forecast: "预计未来7天带来 GMV 约 ¥2,000，退款风险偏高需关注" },
  "大促预热": { audience: "全部粉丝 + 相似人群拓展", creative: "待补充：需要 Studio 实验室产出预热视频素材", forecast: "小额灰度验证后预计 ROAS 1.5-2.0，正式投放前需批准" },
  "老客复购唤醒": { audience: "近60天内下单≥2次的复购客户", creative: "复购专属券贴片 + 4张商品图", forecast: "预计未来7天带来 GMV 约 ¥3,400，ROAS 有望维持 3.0 以上" },
};

function getExtra(name) {
  return CAMPAIGN_EXTRA[name] ?? { audience: "全部客户", creative: "沿用店铺默认素材", forecast: "暂无预测数据" };
}

export function AdOpsPage({ rootNavigate }) {
  const toast = useToast();
  const [state, setState] = useState(() => getAdCenterState());
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [approvalDecisions, setApprovalDecisions] = useState({});
  const { wallet, campaigns, budgetRiskAlerts = [], learningCandidate } = state;
  const contributionSummary = getAdContributionSummary();
  const pendingApprovals = campaigns.filter((c) => c.approvalState === "pending" && !approvalDecisions[c.id]);
  const completedCampaigns = campaigns.filter((c) => c.status === "completed");

  function handleToggle(campaignId) {
    setState(toggleCampaignStatus(campaignId));
    toast("投放状态已更新", "success");
  }

  function handleCandidateDecision(decision) {
    setState(decideAdLearningCandidate(decision));
    toast(decision === "approve" ? "已批准灰度实验" : "已驳回该建议", "success");
  }

  function handleApprovalDecision(campaign, decision) {
    setApprovalDecisions((prev) => ({ ...prev, [campaign.id]: decision }));
    const label = decision === "approved" ? "已批准" : decision === "paused" ? "已暂停待复核" : "已驳回";
    toast(`「${campaign.name}」${label}（本地演示反馈，尚未真实投放）`, decision === "rejected" ? "danger" : "success");
  }

  return (
    <div>
      <PageHeader
        title="广告投放"
        subtitle="AI 投放建议、投放执行、待经营者批准与预算风险——授权范围内的经营操作"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DemoBadge />
            {rootNavigate ? (
              <Button size="sm" variant="secondary" onClick={() => rootNavigate("financeProfit")}>查看财务与利润 →</Button>
            ) : null}
          </div>
        }
      />

      <StatGrid>
        <StatCard label="广告可用预算" value={`¥${wallet.available.toLocaleString()}`} />
        <StatCard label="今日花费" value={`¥${wallet.todaySpend.toLocaleString()}`} />
        <StatCard label="待经营者批准" value={pendingApprovals.length} />
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
        <h3 className="fdr-card__title">待经营者批准</h3>
        {pendingApprovals.length === 0 ? (
          <EmptyState icon="☑" message="暂无待你批准的投放计划" />
        ) : (
          pendingApprovals.map((c) => {
            const extra = getExtra(c.name);
            return (
              <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <strong>{c.name}</strong>
                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-secondary)" }}>{PLATFORM_LABEL[c.platform] ?? c.platform} · 预算 ¥{c.budget.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" variant="primary" onClick={() => handleApprovalDecision(c, "approved")}>批准</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleApprovalDecision(c, "paused")}>暂停</Button>
                    <Button size="sm" variant="danger" onClick={() => handleApprovalDecision(c, "rejected")}>驳回</Button>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>目标人群：{extra.audience}</p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>素材：{extra.creative}</p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>预计效果：{extra.forecast}</p>
              </div>
            );
          })
        )}
        {Object.keys(approvalDecisions).length > 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
            本次会话内已处理 {Object.keys(approvalDecisions).length} 条批准事项（本地演示状态，刷新页面会重置）。
          </p>
        ) : null}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">投放计划</h3>
        {campaigns.length === 0 ? (
          <EmptyState icon="■" message="暂无投放计划" />
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "计划名称" },
              { key: "platform", label: "投放平台", render: (r) => PLATFORM_LABEL[r.platform] ?? r.platform },
              { key: "audience", label: "目标人群", render: (r) => getExtra(r.name).audience },
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
        <h3 className="fdr-card__title">AI 投放建议</h3>
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

      <div className="fdr-card">
        <h3 className="fdr-card__title">投放结果与复盘</h3>
        {completedCampaigns.length === 0 ? (
          <EmptyState icon="▦" message="暂无已结束的投放计划可供复盘" />
        ) : (
          completedCampaigns.map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <strong>{c.name}</strong>
              <span style={{ marginLeft: 8, color: "var(--text-secondary)" }}>
                投放结果：GMV ¥{c.attributedRevenue.toLocaleString()}，ROAS {c.roas != null ? c.roas.toFixed(1) : "—"}，贡献利润 ¥{c.contributionProfit.toLocaleString()}
              </span>
              <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>复盘：{getExtra(c.name).forecast}</p>
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
            <StatusPill tone={learningCandidate.status === "rejected" ? "danger" : "info"}>{CANDIDATE_STATUS_LABEL[learningCandidate.status] ?? learningCandidate.status}</StatusPill>
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
