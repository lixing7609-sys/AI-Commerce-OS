import { useState } from "react";

import { usePreview } from "../helpers/previewContextCore";
import { DEMO_DATA_LABEL } from "../previewData";
import { EDITIONS, POLICY_KEYS, hasPolicy } from "../../shared/editionPolicy.js";
import {
  APPROVAL_STATUS_LABEL,
  PLATFORM_AD_MAPPING,
  approveCampaign,
  getAdOpsState,
  getContributionSummary,
  pauseCampaign,
  rejectCampaign,
  resumeCampaign,
  startCampaign,
} from "../helpers/adOpsMock.js";

/**
 * 广告投放（阶段：release-blocking repair — Operator 广告投放）。
 *
 * 客户安全边界：这里只做"店铺绑定 → 广告账户绑定 → AI 策略草案 →
 * 预算审批 → 广告执行 → 效果回流 → 贡献利润归因 → AI 优化"这条
 * 操作路径里经营者应该看到、能做的那部分——不暴露 Founder 才有的
 * 无限制广告开发/策略配置工具（那些活在 console/modules/adCenter），
 * 也不暴露 Cloud 才有的跨租户/平台级管理。所有资金相关操作都必须
 * 先经过明确的人工批准（draft/pending_approval → approved → running
 * 之间没有任何自动跳过审批的路径）。
 */

const RISK_LABEL = { low: "低风险", medium: "中风险", high: "高风险" };
const RISK_TONE = { low: "approved", medium: "pending_review", high: "rejected" };

function AccountSelector({ accounts }) {
  return (
    <section className="op-panel">
      <div className="op-panel-heading">
        <h3>店铺与广告账户</h3>
        <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
      </div>
      <div className="op-table-wrap">
        <table className="op-table">
          <thead>
            <tr>
              <th>店铺</th>
              <th>电商平台</th>
              <th>对应广告平台</th>
              <th>账户连接状态</th>
              <th>授权状态</th>
              <th>预算来源</th>
              <th>最近同步</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.storeName}</td>
                <td>{a.commercePlatform}</td>
                <td>{a.adPlatform}</td>
                <td>
                  <span className={`op-status-badge ${a.connectionStatus === "connected" ? "approved" : "pending_review"}`}>
                    {a.connectionStatus === "connected" ? "已连接" : a.connectionStatus === "disconnected" ? "未连接" : "未接入"}
                  </span>
                </td>
                <td>{a.authorizationStatus === "authorized" ? "已授权" : "未授权"}</td>
                <td>{a.budgetSource === "operator_owned" ? "经营者自有账户" : "AI Commerce OS 广告钱包"}</td>
                <td>{a.lastSyncAt ? new Date(a.lastSyncAt).toLocaleString("zh-CN") : "从未同步"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="op-empty-hint" style={{ marginTop: 10 }}>
        平台映射参考：{PLATFORM_AD_MAPPING.map((m) => `${m.commercePlatform}→${m.adPlatform}`).join("；")}（产品映射示例，不代表已完成真实对接）
      </p>
    </section>
  );
}

function CampaignRow({ campaign, onChange, canApprove }) {
  const toast = usePreview().showPrototypeNotice;
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function handle(fn, ...args) {
    const result = fn(...args);
    if (result && result.ok === false) {
      toast(result.error);
      return;
    }
    onChange();
  }

  return (
    <article className="op-advice-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700 }}>{campaign.targetProduct}</p>
          <p className="op-empty-hint" style={{ margin: "2px 0 0 0" }}>{campaign.storeName} · {campaign.targetPlatform}</p>
        </div>
        <span className={`op-status-badge ${campaign.status}`}>{APPROVAL_STATUS_LABEL[campaign.status]}</span>
      </div>

      <dl className="op-detail-meta" style={{ marginTop: 10 }}>
        <div><dt>建议预算</dt><dd>¥{campaign.proposedBudget.toLocaleString()}</dd></div>
        <div><dt>已花费（平台媒介）</dt><dd>¥{campaign.platformAdSpend.toLocaleString()}</dd></div>
        <div><dt>预期订单</dt><dd>{campaign.expectedOrders}</dd></div>
        <div><dt>预期营收</dt><dd>¥{campaign.expectedRevenue.toLocaleString()}</dd></div>
        <div><dt>表面 ROAS</dt><dd>{campaign.roas.toFixed(2)}</dd></div>
        <div>
          <dt>贡献利润</dt>
          <dd style={{ color: campaign.contributionProfit < 0 ? "var(--op-danger)" : "inherit", fontWeight: 700 }}>
            ¥{campaign.contributionProfit.toLocaleString()}
          </dd>
        </div>
        <div><dt>风险等级</dt><dd><span className={`op-status-badge ${RISK_TONE[campaign.riskLevel]}`}>{RISK_LABEL[campaign.riskLevel]}</span></dd></div>
      </dl>

      <div style={{ marginTop: 8, fontSize: 13 }}>
        <p style={{ margin: "4px 0" }}><strong>人群建议：</strong>{campaign.audienceRecommendation}</p>
        <p style={{ margin: "4px 0" }}><strong>出价建议：</strong>{campaign.biddingRecommendation}</p>
        <p style={{ margin: "4px 0" }}><strong>创意建议：</strong>{campaign.creativeRecommendation}</p>
        <p className="op-empty-hint" style={{ margin: "4px 0" }}>AI 理由：{campaign.reason}</p>
        {campaign.rejectionReason ? <p className="op-empty-hint" style={{ margin: "4px 0" }}>驳回理由：{campaign.rejectionReason}</p> : null}
      </div>

      <div className="op-card-actions" style={{ marginTop: 10 }}>
        {campaign.status === "pending_approval" && canApprove ? (
          <>
            <button type="button" className="op-btn" onClick={() => handle(approveCampaign, campaign.id)}>批准</button>
            <button type="button" className="op-btn" onClick={() => setRejecting(true)}>驳回</button>
          </>
        ) : null}
        {campaign.status === "pending_approval" && !canApprove ? (
          <span className="op-empty-inline">等待有预算审批权限的人确认</span>
        ) : null}
        {campaign.status === "approved" ? (
          <button type="button" className="op-btn" onClick={() => handle(startCampaign, campaign.id)}>开始投放</button>
        ) : null}
        {campaign.status === "running" ? (
          <button type="button" className="op-btn" onClick={() => handle(pauseCampaign, campaign.id)}>暂停（含紧急停止）</button>
        ) : null}
        {campaign.status === "paused" ? (
          <button type="button" className="op-btn" onClick={() => handle(resumeCampaign, campaign.id)}>恢复投放</button>
        ) : null}
      </div>

      {rejecting ? (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <input
            className="op-input"
            placeholder="驳回理由（必填）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--op-border)" }}
          />
          <button
            type="button"
            className="op-btn"
            disabled={!reason.trim()}
            onClick={() => { handle(rejectCampaign, campaign.id, reason); setRejecting(false); setReason(""); }}
          >
            确认驳回
          </button>
          <button type="button" className="op-btn" onClick={() => setRejecting(false)}>取消</button>
        </div>
      ) : null}
    </article>
  );
}

export function AdOpsPage() {
  const [, forceRerender] = useState(0);
  const onChange = () => forceRerender((n) => n + 1);
  const state = getAdOpsState();
  const summary = getContributionSummary();
  const canApprove = hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.BUSINESS_OWN_TENANT_OPERATION);

  const activeCampaigns = state.campaigns.filter((c) => c.status === "running");
  const pausedCampaigns = state.campaigns.filter((c) => c.status === "paused");
  const pendingApprovals = state.campaigns.filter((c) => c.status === "pending_approval");
  const highRisk = state.campaigns.filter((c) => c.riskLevel === "high" && (c.status === "running" || c.status === "paused"));
  const lowBalance = state.wallet.available < state.budgetCeilings.lowBalanceThreshold;

  return (
    <div className="op-page">
      <header className="op-page-header">
        <div>
          <h1>广告投放</h1>
          <p>AI 生成投放建议，你批准后才会真正花钱——广告优化目标是贡献利润，不只是 GMV 或表面 ROAS。</p>
        </div>
        <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
      </header>

      {lowBalance ? (
        <div className="op-panel" style={{ borderColor: "var(--op-danger)" }}>
          <span className="op-status-badge rejected">余额预警</span>{" "}
          <span style={{ fontSize: 13 }}>广告钱包可用余额（¥{state.wallet.available.toLocaleString()}）已低于预警线，建议尽快充值。</span>
        </div>
      ) : null}

      <section className="op-metric-grid">
        <article className="op-metric-card">
          <span className="op-metric-label">今日广告花费</span>
          <strong className="op-metric-value">¥{summary.spend.toLocaleString()}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">归因营收</span>
          <strong className="op-metric-value">¥{summary.revenue.toLocaleString()}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">贡献利润</span>
          <strong className="op-metric-value">¥{summary.contributionProfit.toLocaleString()}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">投放中</span>
          <strong className="op-metric-value">{activeCampaigns.length}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">已暂停</span>
          <strong className="op-metric-value">{pausedCampaigns.length}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">待审批</span>
          <strong className="op-metric-value">{pendingApprovals.length}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">广告钱包余额</span>
          <strong className="op-metric-value">¥{state.wallet.available.toLocaleString()}</strong>
        </article>
      </section>

      {highRisk.length > 0 ? (
        <section className="op-panel" style={{ borderColor: "var(--op-warning)" }}>
          <h3>预算风险提醒</h3>
          {highRisk.map((c) => (
            <p key={c.id} style={{ fontSize: 13, margin: "4px 0" }}>
              <strong>{c.targetProduct}</strong> · 贡献利润 ¥{c.contributionProfit.toLocaleString()} · {c.reason}
            </p>
          ))}
        </section>
      ) : null}

      <AccountSelector accounts={state.accounts} />

      <section className="op-panel">
        <h3>AI 投放建议与审批</h3>
        <p style={{ fontSize: 12, color: "var(--op-text-secondary)", margin: "0 0 10px 0" }}>
          流程：AI 策略草案 → 你审批 → 开始投放 → 效果数据回流 → 贡献利润归因 → AI 优化下一轮建议。AI 从不在未获批准前直接花钱。
        </p>
        {state.campaigns.length === 0 ? (
          <div className="op-empty-state">暂无 AI 投放建议。</div>
        ) : (
          state.campaigns.map((c) => (
            <CampaignRow key={c.id} campaign={c} onChange={onChange} canApprove={canApprove} />
          ))
        )}
      </section>

      <section className="op-panel">
        <div className="op-panel-heading">
          <h3>广告钱包</h3>
          <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
        </div>
        <p className="op-empty-hint" style={{ marginTop: 0 }}>
          四个口径分开记账，不合并成一个笼统的"广告花费"：平台媒介预算、AI Commerce OS 广告运营服务费、内容与 Token 创作预算、AI 优化服务费。
        </p>
        <dl className="op-detail-meta">
          <div><dt>可用余额</dt><dd>¥{state.wallet.available.toLocaleString()}</dd></div>
          <div><dt>平台媒介预算分配</dt><dd>¥{state.wallet.platformBudgetAllocation.toLocaleString()}</dd></div>
          <div><dt>广告运营服务费分配</dt><dd>¥{state.wallet.serviceFeeAllocation.toLocaleString()}</dd></div>
          <div><dt>内容/Token 创作预算</dt><dd>¥{state.wallet.tokenCreativeBudget.toLocaleString()}</dd></div>
          <div><dt>AI 优化服务费分配</dt><dd>¥{state.wallet.aiOptimizationFeeAllocation.toLocaleString()}</dd></div>
          <div><dt>冻结中</dt><dd>¥{state.wallet.frozen.toLocaleString()}</dd></div>
          <div><dt>已消耗</dt><dd>¥{state.wallet.consumed.toLocaleString()}</dd></div>
          <div><dt>单日预算上限</dt><dd>¥{state.budgetCeilings.dailyCeiling.toLocaleString()}</dd></div>
          <div><dt>账户级预算上限</dt><dd>¥{state.budgetCeilings.accountCeiling.toLocaleString()}</dd></div>
          <div><dt>店铺级预算上限</dt><dd>¥{state.budgetCeilings.storeCeiling.toLocaleString()}</dd></div>
        </dl>

        <h4 style={{ fontSize: 13, margin: "16px 0 6px 0" }}>充值记录</h4>
        <div className="op-table-wrap">
          <table className="op-table">
            <thead><tr><th>时间</th><th>金额</th><th>说明</th></tr></thead>
            <tbody>
              {state.wallet.rechargeHistory.map((r) => (
                <tr key={r.id}><td>{new Date(r.createdAt).toLocaleString("zh-CN")}</td><td>+¥{r.amount.toLocaleString()}</td><td>{r.note}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 style={{ fontSize: 13, margin: "16px 0 6px 0" }}>结算记录</h4>
        <div className="op-table-wrap">
          <table className="op-table">
            <thead><tr><th>时间</th><th>平台媒介花费</th><th>广告运营服务费</th><th>内容/Token 成本</th><th>AI 优化服务费</th></tr></thead>
            <tbody>
              {state.wallet.settlementRecords.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.createdAt).toLocaleString("zh-CN")}</td>
                  <td>¥{s.platformAdSpend.toLocaleString()}</td>
                  <td>¥{s.adServiceFee.toLocaleString()}</td>
                  <td>¥{s.contentTokenCost.toLocaleString()}</td>
                  <td>¥{s.aiOptimizationFee.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="op-panel">
        <h3>贡献利润归因说明</h3>
        <p style={{ fontSize: 13, margin: 0 }}>
          贡献利润 = 归因营收 − 商品成本 − 平台佣金 − 平台广告花费 − 退款损失 − 履约成本 − 内容/Token 成本 − 广告运营服务费 − AI 优化服务费。
        </p>
        <p className="op-empty-hint" style={{ marginTop: 6 }}>
          广告优化目标是提升贡献利润，不是单纯追求 GMV 或表面 ROAS——一个 ROAS 看起来不错的计划，仍可能因为退款率高或履约成本高而贡献利润为负（见上方投放建议里的具体案例）。
        </p>
        <p className="op-empty-hint" style={{ marginTop: 6 }}>
          未来方向（仅数据模型预留，当前未接入）：平台返点、阶梯激励、集中采购、官方代理关系。
        </p>
      </section>
    </div>
  );
}
