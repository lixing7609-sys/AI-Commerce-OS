import { FounderActionCard } from "./FounderActionCard.jsx";

const STAGE_LABELS = {
  goal_discovery: "Goal Understanding · 目标理解", goal_review: "Goal Brief · 目标确认",
  goal_confirmed: "目标已确认", strategy_meeting: "Strategy Meeting · 策略会议",
  conflict_validation: "Validation · 验证", decision_ready: "Decision · 决策",
  package_ready: "Discussion Package · 成果包", package_approved: "成果包已批准",
  asset_commit: "Candidate Commit · 候选提交", conversation_completed: "Brain Discussion Completed · Conversation Active",
};
const TYPE_LABELS = { project: "Project（项目）", workflow: "Workflow（工作流）", skill: "Skill（技能）", prompt: "Prompt（提示词）", knowledge: "Knowledge（知识）", capability: "Capability（能力）", agent: "Agent（智能体）", connector: "Connector（连接器）", decision: "Decision（决策）", open_question: "Open Question（待确认问题）" };
const READINESS_LABELS = { unclear: "目标待理解", discovering: "目标理解中", reviewable: "等待确认", confirmed: "目标已确认" };
const ACTION_LABELS = { create: "Create（新建）", update: "Update（更新）", replace: "Replace（替换）", archive: "Archive（归档）" };

function PackageOverview({ pkg }) {
  if (!pkg?.package_id) return null;
  return <section className="sino-package-overview" aria-label="成果包资产总览">
    <header><div><span>Discussion Package</span><h3>{pkg.title}</h3></div><strong>{pkg.status === "archived" ? "已提交并归档" : pkg.status === "approved" ? "已批准" : pkg.status === "returned" ? "已退回" : "待 Founder 审批"}</strong></header>
    <div className="sino-package-overview__counts">{Object.entries(pkg.counts || {}).map(([type, count]) => <span key={type}>{TYPE_LABELS[type] || type} ×{count}</span>)}</div>
    <div className="sino-package-assets">{pkg.objects?.map((item) => <details key={item.discussion_object_id}>
      <summary><span>{TYPE_LABELS[item.object_type] || item.object_type}</span><strong>{item.name}</strong><b>{item.commit_status === "committed" ? "✓ Committed" : ACTION_LABELS[item.action] || item.action}</b></summary>
      <p>{item.purpose}</p>
      <dl><div><dt>Confidence</dt><dd>{Math.round((item.confidence || 0) * 100)}%</dd></div><div><dt>Creator</dt><dd>Sino Brain</dd></div><div><dt>Dependency</dt><dd>{item.dependencies?.length ? item.dependencies.join(" · ") : "暂无"}</dd></div>{item.asset_id ? <div><dt>Asset ID</dt><dd>{item.asset_id}</dd></div> : null}</dl>
    </details>)}</div>
  </section>;
}

export function SinoBrainContext({ brain, busy, capabilityAction, onCapabilityAction, onConfirmGoal, onForceReview, onStartStrategy, onAdvanceStage, onContinueDiscussion, onReviewPackage, onViewAssets, onNewGoal }) {
  if (!brain) return null;
  const brief = brain.goal_brief || {};
  const decision = brain.decision || {};
  const understanding = brain.discovery?.working_understanding || {};
  const risk = decision.key_risks?.[0] || "暂无关键风险";
  const question = decision.remaining_unknowns?.[0] || brief.unknowns?.[0] || "暂无待确认问题";
  const action = capabilityAction || brain.current_action || (brain.stage === "goal_review" ? { action_id: "confirm_goal", title: "目标已经明确", description: "确认后开始 Strategy Meeting。", primary_label: "开始讨论", secondary_label: "修改目标" } : brain.stage === "package_ready" ? { action_id: "approve_package", title: "等待 Founder 批准成果包", description: "确认后把讨论成果沉淀为候选能力。", primary_label: "批准候选能力", secondary_label: "继续讨论", danger_label: "退回修改" } : null);
  return <section className="sino-brain-context sino-brain-dashboard" aria-label="Brain Dashboard">
    <FounderActionCard compact action={action} busy={busy} onCapabilityAction={onCapabilityAction} onConfirmGoal={onConfirmGoal} onReviseGoal={onContinueDiscussion} onAdvanceStage={onAdvanceStage} onReviewPackage={onReviewPackage} onContinueDiscussion={onContinueDiscussion} onViewAssets={onViewAssets} onNewGoal={onNewGoal} />
    <header><h2>Brain Dashboard</h2><span>{STAGE_LABELS[brain.stage] || brain.stage}</span></header>
    <dl className="sino-brain-dashboard__grid">
      <div><dt>Current Stage</dt><dd>{STAGE_LABELS[brain.stage] || brain.stage}</dd></div>
      <div><dt>Goal</dt><dd>{brief.goal || understanding.interpreted_goal || "正在理解"}</dd></div>
      <div><dt>Goal Status</dt><dd>{READINESS_LABELS[brain.goal_readiness] || brain.goal_readiness}</dd></div>
      <div><dt>Decision</dt><dd>{decision.final_recommendation || "尚未形成"}</dd></div>
      <div><dt>Confidence</dt><dd>{decision.confidence ? `${Math.round(decision.confidence * 100)}%` : "—"}</dd></div>
      <div><dt>Current Risk</dt><dd>{risk}</dd></div>
      <div><dt>Remaining Question</dt><dd>{question}</dd></div>
      <div><dt>Next Step</dt><dd>{action?.description || "继续当前讨论"}</dd></div>
    </dl>
    {brain.stage === "goal_discovery" ? <button type="button" className="sino-brain-force-review" disabled={busy} onClick={onForceReview}>目标已经够清楚，开始讨论</button> : null}
    {brain.stage === "goal_confirmed" ? <button type="button" className="sino-brain-force-review" disabled={busy} onClick={onStartStrategy}>开始策略会议</button> : null}
    <PackageOverview pkg={brain.discussion_package} />
    {brain.discussion_package?.asset_commit ? <section className="sino-asset-commit-dashboard" aria-label="Candidate Commit Status"><h3>Candidate Commit Status</h3>{brain.discussion_package.asset_commit.items?.map((item) => <div key={item.asset_id}><span>{TYPE_LABELS[item.object_type] || item.object_type}</span><strong>{item.name}</strong><b>{item.lifecycle_status === "ready" ? "Ready" : "Candidate"}</b></div>)}</section> : null}
    {brain.strategy_proposals?.length || brain.discussion_package?.lifecycle?.length ? <details className="sino-brain-evidence"><summary>Developer Timeline · 查看讨论依据</summary>{brain.strategy_proposals?.map((item) => <article key={item.model_run_id || `${item.provider}-${item.model}`}><strong>{item.model} · {item.provider}</strong><p>{item.proposal?.core_judgment || item.proposal?.recommendation || "已记录结构化提案"}</p></article>)}{brain.discussion_package?.lifecycle?.map((item, index) => <article key={`${item.status}-${index}`}><strong>{item.status}</strong><p>{item.at}</p></article>)}</details> : null}
  </section>;
}
