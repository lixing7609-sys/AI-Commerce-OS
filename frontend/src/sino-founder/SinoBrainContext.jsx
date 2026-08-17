import { FounderActionCard } from "./FounderActionCard.jsx";
import { ContextSourcesDebug } from "./ContextSourcesDebug.jsx";
import { projectMaturityProjection } from "./projectMaturityProjection.js";

const STAGE_LABELS = {
  goal_discovery: "Goal Understanding · 目标理解", goal_review: "Goal Brief · 目标确认",
  goal_confirmed: "目标已确认", strategy_meeting: "Strategy Meeting · 策略会议",
  conflict_validation: "Validation · 验证", decision_ready: "Decision · 决策",
  package_ready: "Discussion Package · 成果包", package_approved: "成果包已批准",
  asset_commit: "Candidate Commit · 候选提交", conversation_completed: "Brain Discussion Completed · Conversation Active",
  context_updated: "Constitution Understanding · Founder Review",
  project_planning: "Project Planning · 项目规划",
  implementation_planning: "Implementation Planning · 实施规划",
  execution_package: "Execution Package · 执行包",
};
const TYPE_LABELS = { project: "Project（项目）", workflow: "Workflow（工作流）", skill: "Skill（技能）", prompt: "Prompt（提示词）", knowledge: "Knowledge（知识）", capability: "Capability（能力）", agent: "Agent（智能体）", connector: "Connector（连接器）", decision: "Decision（决策）", open_question: "Open Question（待确认问题）" };
const READINESS_LABELS = { unclear: "目标待理解", discovering: "目标理解中", reviewable: "等待确认", confirmed: "目标已确认" };
const ACTION_LABELS = { create: "Create（新建）", update: "Update（更新）", replace: "Replace（替换）", archive: "Archive（归档）" };
const WORK_ITEM_STATE_LABELS = { not_found: "尚未发现", existing: "已存在", partial: "部分存在", needs_review: "需要核对" };
const WORK_ITEM_DECISION_LABELS = { pending: "待判断", approved: "同意推进", discuss: "继续讨论", deferred: "暂不处理" };
const WORK_ITEM_NEXT_STEPS = {
  approved: "等待 Sino 判断该 Work Item 应进入哪一种正式工作流程",
  discuss: "返回当前 Conversation，与 Sino 继续讨论该 Work Item",
  deferred: "保留 Work Item，不进入后续流程",
  pending: "Founder 判断该 Work Item 是否值得进入下一阶段",
};
const ROUTE_LABELS = { system_project: "System Project", goal: "Goal", discussion: "Discussion", candidate_capability: "Candidate Capability", project_update: "Project Update", no_action: "No Action" };

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

export function SinoBrainContext({ brain, contextGroundings, busy, capabilityAction, capabilityAsset, selectedConstitutionWorkItemId, onReviewConstitutionWorkItem, onReviewConstitutionRouting, onConfirmFormalObject, onOpenProject, onCapabilityAction, onConfirmGoal, onForceReview, onStartStrategy, onAdvanceStage, onContinueDiscussion, onReviewPackage, onViewAssets, onNewGoal }) {
  if (!brain) return null;
  const brief = brain.goal_brief || {};
  const quickFixRoute = brain.discovery?.task_complexity_route;
  const isQuickFix = quickFixRoute?.classification === "QUICK_FIX";
  const decision = brain.decision || {};
  const understanding = brain.discovery?.working_understanding || {};
  const risk = decision.key_risks?.[0] || "暂无关键风险";
  const question = decision.remaining_unknowns?.[0] || brief.unknowns?.[0] || "暂无待确认问题";
  const action = isQuickFix ? null : capabilityAction || brain.current_action || (brain.stage === "goal_review" ? { action_id: "confirm_goal", title: "目标已经明确", description: "确认后开始 Strategy Meeting。", primary_label: "开始讨论", secondary_label: "修改目标" } : brain.stage === "package_ready" ? { action_id: "approve_package", title: "等待 Founder 批准成果包", description: "确认后把讨论成果沉淀为候选能力。", primary_label: "批准候选能力", secondary_label: "继续讨论", danger_label: "退回修改" } : null);
  const constitution = brain.message_intent === "project_context_update" ? brain.constitution_understanding || {} : null;
  const workItems = constitution?.proposed_work_items || [];
  const reviewedWorkItems = workItems.filter((item) => item.founder_decision && item.founder_decision !== "pending").length;
  const selectedWorkItem = workItems.find((item) => item.work_item_id === selectedConstitutionWorkItemId) || null;
  const selectedDecision = selectedWorkItem?.founder_decision || "pending";
  const dependencyEvidence = selectedWorkItem?.real_dependency_evidence || [];
  const routing = selectedWorkItem?.routing_recommendation || null;
  const formalProposal = routing?.formal_object_proposal || null;
  const projectAware = brain.stage === "project_planning" || brain.discovery?.project_aware;
  const maturity = projectAware ? projectMaturityProjection(brain) : {};
  const implementationPlan = brain.discovery?.implementation_planning;
  const executionPackage = brain.discovery?.execution_package;
  const projectLifecycle = brain.project_lifecycle;
  const maturityLabels = { evaluating: "正在判断", continue_analysis: "继续自主分析", founder_input_required: "需要 Founder 判断", ready_for_review: "已可审核" };
  return <section className="sino-brain-context sino-brain-dashboard" aria-label="Brain Dashboard">
    {!projectAware && !isQuickFix ? <FounderActionCard compact action={action} busy={busy} onCapabilityAction={onCapabilityAction} onConfirmGoal={onConfirmGoal} onReviseGoal={onContinueDiscussion} onAdvanceStage={onAdvanceStage} onReviewPackage={onReviewPackage} onContinueDiscussion={onContinueDiscussion} onViewAssets={onViewAssets} onNewGoal={onNewGoal} /> : null}
    <header><h2>{constitution ? "Constitution Review Status" : "Brain Dashboard"}</h2><span>{isQuickFix ? "Quick Fix" : projectLifecycle?.rank >= 300 ? projectLifecycle.stage_label : STAGE_LABELS[brain.stage] || brain.stage}</span></header>
    {isQuickFix ? <dl className="sino-brain-dashboard__grid">
      <div><dt>Task Type</dt><dd>Quick Fix</dd></div><div><dt>Target</dt><dd>{quickFixRoute.quick_fix_contract?.target_area}</dd></div><div><dt>Current Step</dt><dd>Inspect / Fix / Verify</dd></div><div><dt>Founder Decision</dt><dd>Not Required</dd></div><div><dt>Next Action</dt><dd>Sino 自动执行</dd></div>
    </dl> : constitution ? <dl className="sino-brain-dashboard__grid">
      <div><dt>Understanding Status</dt><dd>{constitution.status === "founder_approved" ? "Confirmed" : constitution.status === "revision_requested" ? "继续讨论" : "Founder Review"}</dd></div>
      <div><dt>System Objects</dt><dd>{constitution.system_objects?.length || 0}</dd></div>
      <div><dt>Proposed Work Items</dt><dd>{workItems.length}</dd></div>
      <div><dt>Founder Decisions</dt><dd>{reviewedWorkItems} / {workItems.length}</dd></div>
      <div><dt>Next Step</dt><dd>Founder 审核系统结构与建议工作项</dd></div>
    </dl> : brain.stage === "execution_package" ? <dl className="sino-brain-dashboard__grid">
      <div><dt>Package ID</dt><dd>{executionPackage?.package_id}</dd></div>
      <div><dt>Project</dt><dd>{brain.discovery?.current_project?.project_name || brain.project_id}</dd></div>
      <div><dt>Source Draft</dt><dd>{executionPackage?.source_draft_id} · v{executionPackage?.source_draft_version}</dd></div>
      <div><dt>Implementation Plan</dt><dd>{executionPackage?.implementation_plan_id}</dd></div>
      <div><dt>Founder Approval</dt><dd>{executionPackage?.approval_ref?.status === "approved" ? "Approved" : executionPackage?.approval_ref?.status}</dd></div>
      <div><dt>Work Items</dt><dd>{executionPackage?.work_items?.length || 0}</dd></div>
      <div><dt>Preflight Status</dt><dd>{executionPackage?.preflight_status}</dd></div>
      <div><dt>Executor</dt><dd>{executionPackage?.executor_requirements?.executor_provider || "—"}</dd></div>
      <div><dt>Execution Status</dt><dd>{executionPackage?.execution_status === "not_started" ? "Not Started" : executionPackage?.execution_status}</dd></div>
      {executionPackage?.runtime_binding?.requires_runtime_binding ? <div><dt>Runtime Binding</dt><dd>{executionPackage.runtime_binding.binding_status === "passed" ? "Passed" : "Founder Gate Required"}</dd></div> : null}
      <div><dt>Next Step</dt><dd>{executionPackage?.preflight_status === "ready" ? "Ready for Execution" : executionPackage?.preflight_status === "blocked" ? executionPackage?.preflight?.blocking_reasons?.join(" · ") : executionPackage?.runtime_binding?.requires_runtime_binding && executionPackage.runtime_binding.binding_status !== "passed" ? "Founder 审核 Runtime Environment Recommendation" : executionPackage?.preflight?.founder_gate_reasons?.join(" · ")}</dd></div>
    </dl> : projectLifecycle?.rank >= 300 ? <dl className="sino-brain-dashboard__grid">
      <div><dt>Current Project</dt><dd>{brain.discovery?.current_project?.project_name || brain.project_id}</dd></div>
      <div><dt>Current Stage</dt><dd>{projectLifecycle.stage_label}</dd></div>
      {projectLifecycle.implementation_status ? <div><dt>Implementation</dt><dd>{projectLifecycle.implementation_status === "completed" ? "✓ Completed" : projectLifecycle.implementation_status}</dd></div> : null}
      {projectLifecycle.validation_status ? <div><dt>Validation</dt><dd>{projectLifecycle.validation_status === "blocked_by_external_dependency" ? "Blocked by External Dependency" : projectLifecycle.validation_status}</dd></div> : null}
      {projectLifecycle.current_dependency ? <div><dt>Dependency</dt><dd>{projectLifecycle.current_dependency.dependency_target}</dd></div> : null}
      {projectLifecycle.blocking_reason ? <div><dt>Blocking Reason</dt><dd>{projectLifecycle.blocking_reason}</dd></div> : null}
      {projectLifecycle.resume_point ? <div><dt>Resume Point</dt><dd>{String(projectLifecycle.resume_point).toUpperCase()} Real Environment Validation</dd></div> : null}
      <div><dt>Next Step</dt><dd>{projectLifecycle.current_action?.title || projectLifecycle.next_step}</dd></div>
    </dl> : projectAware ? <dl className="sino-brain-dashboard__grid">
      <div><dt>Current Project</dt><dd>{brain.discovery?.current_project?.project_name || brain.project_id}</dd></div>
      <div><dt>Current Stage</dt><dd>{brain.stage === "implementation_planning" ? "Implementation Planning" : "Project Planning"}</dd></div>
      <div><dt>{brain.stage === "implementation_planning" ? "Plan Status" : "Maturity Status"}</dt><dd>{brain.stage === "implementation_planning" ? implementationPlan?.execution_approval === "approved" ? "实施方案已批准" : implementationPlan?.status === "ready_for_execution_review" ? "等待 Founder 批准实施" : "正在制定实施方案" : maturityLabels[maturity.maturity_status] || "正在判断"}</dd></div>
      <div><dt>Why</dt><dd>{brain.stage === "implementation_planning" ? "当前 System Definition 已确认，实施方案只负责拆解范围、依赖、顺序、风险与验收，不会启动执行。" : maturity.reason || "Sino 正在判断当前讨论成熟度。"}</dd></div>
      {maturity.maturity_status === "founder_input_required" && maturity.blocking_question ? <div><dt>Pending Question</dt><dd>{maturity.blocking_question}</dd></div> : null}
      {maturity.maturity_status === "founder_input_required" && maturity.sino_recommendation ? <div><dt>Sino Recommendation</dt><dd>{maturity.sino_recommendation}</dd></div> : null}
      {maturity.maturity_status === "ready_for_review" && maturity.outcomes?.length ? <div><dt>Outcome Summary</dt><dd>{maturity.outcomes.length} 项待审核成果</dd></div> : null}
      <div><dt>Next Step</dt><dd>{brain.stage === "implementation_planning" ? implementationPlan?.execution_approval === "approved" ? "生成 Execution Package（执行包）" : implementationPlan?.status === "ready_for_execution_review" ? "Founder 审核实施方案并决定是否批准实施" : "Sino 基于已确认 Definition 制定实施方案" : maturity.maturity_status === "continue_analysis" ? maturity.autonomous_next_analysis : maturity.maturity_status === "founder_input_required" ? "Founder 通过 Composer 回答关键问题" : maturity.maturity_status === "ready_for_review" ? "Founder 审核本轮成果" : "等待 Sino 完成成熟度判断"}</dd></div>
    </dl> : <dl className="sino-brain-dashboard__grid">
      <div><dt>Current Stage</dt><dd>{STAGE_LABELS[brain.stage] || brain.stage}</dd></div>
      <div><dt>Goal</dt><dd>{brief.goal || understanding.interpreted_goal || "正在理解"}</dd></div>
      <div><dt>Goal Status</dt><dd>{READINESS_LABELS[brain.goal_readiness] || brain.goal_readiness}</dd></div>
      <div><dt>Decision</dt><dd>{decision.final_recommendation || "尚未形成"}</dd></div>
      <div><dt>Confidence</dt><dd>{decision.confidence ? `${Math.round(decision.confidence * 100)}%` : "—"}</dd></div>
      <div><dt>Current Risk</dt><dd>{risk}</dd></div>
      <div><dt>Remaining Question</dt><dd>{question}</dd></div>
      <div><dt>Next Step</dt><dd>{action?.description || "继续当前讨论"}</dd></div>
      {capabilityAsset ? <><div><dt>Current Capability</dt><dd>{capabilityAsset.name}</dd></div><div><dt>Lifecycle Status</dt><dd>{capabilityAsset.status} · V{capabilityAsset.version || 1}</dd></div><div><dt>Available Actions</dt><dd>{capabilityAsset.available_actions?.join(" · ") || "继续讨论"}</dd></div></> : null}
    </dl>}
    {selectedWorkItem ? <section className="sino-work-item-context" aria-label="当前建议工作项">
      <header><span>Work Item</span><h3>{selectedWorkItem.title}</h3></header>
      <dl>
        <div><dt>Existing State</dt><dd>{WORK_ITEM_STATE_LABELS[selectedWorkItem.existing_state] || selectedWorkItem.existing_state}</dd></div>
        {selectedWorkItem.semantic_understanding?.system_role ? <div><dt>System Role</dt><dd>{selectedWorkItem.semantic_understanding.system_role}</dd></div> : null}
        {selectedWorkItem.semantic_understanding?.current_gap ? <div><dt>Current Gap</dt><dd>{selectedWorkItem.semantic_understanding.current_gap}</dd></div> : null}
        <div><dt>Source</dt><dd>{selectedWorkItem.source}</dd></div>
        <div><dt>Reason</dt><dd>{selectedWorkItem.reason}</dd></div>
        <div><dt>Recommended Action</dt><dd>{selectedWorkItem.recommended_action}</dd></div>
        <div><dt>Founder Decision</dt><dd>{WORK_ITEM_DECISION_LABELS[selectedDecision] || selectedDecision}</dd></div>
        <div><dt>Decision Status</dt><dd>{selectedDecision === "pending" ? "Pending" : "Recorded"}</dd></div>
        <div><dt>Next Step</dt><dd>{WORK_ITEM_NEXT_STEPS[selectedDecision]}</dd></div>
      </dl>
      {dependencyEvidence.length ? <section aria-label="Real Dependency Evidence"><span className="sino-kicker">Real Dependency Evidence</span>{dependencyEvidence.map((item) => <dl key={item.dependency_id}><div><dt>Source Project</dt><dd>{item.source_project_name}</dd></div><div><dt>Execution</dt><dd>Implementation Completed</dd></div><div><dt>Validation</dt><dd>Blocked by External Dependency</dd></div><div><dt>Required Runtime</dt><dd>{item.required_capabilities?.join(" · ")}</dd></div><div><dt>Evidence</dt><dd>{item.reason}</dd></div><div><dt>Source Session</dt><dd>{item.source_execution_session_id}</dd></div><div><dt>Source Package</dt><dd>{item.source_execution_package_id}</dd></div></dl>)}</section> : null}
      <footer>{selectedDecision === "pending" ? <><button type="button" className="is-primary" disabled={busy || constitution.status !== "founder_approved"} onClick={() => onReviewConstitutionWorkItem?.(selectedWorkItem.work_item_id, "approved")}>同意推进</button><button type="button" disabled={busy || constitution.status !== "founder_approved"} onClick={() => onReviewConstitutionWorkItem?.(selectedWorkItem.work_item_id, "discuss")}>继续讨论</button><button type="button" disabled={busy || constitution.status !== "founder_approved"} onClick={() => onReviewConstitutionWorkItem?.(selectedWorkItem.work_item_id, "deferred")}>暂不处理</button></> : <strong className={`sino-work-item-decision is-${selectedDecision}`}>{selectedDecision === "approved" ? "✓ 已同意推进" : WORK_ITEM_DECISION_LABELS[selectedDecision] || selectedDecision}</strong>}</footer>
      {routing ? <section className="sino-routing-recommendation" aria-label="Sino Routing Recommendation">
        <header><span>Sino Recommendation</span><h3>{ROUTE_LABELS[routing.recommended_route] || routing.recommended_route}</h3></header>
        <dl><div><dt>判断理由</dt><dd>{routing.reason}</dd></div><div><dt>建议对象</dt><dd>{routing.proposed_object}</dd></div><div><dt>当前状态</dt><dd>{WORK_ITEM_STATE_LABELS[routing.existing_state] || routing.existing_state}</dd></div><div><dt>建议下一步</dt><dd>{routing.next_action}</dd></div><div><dt>Confidence</dt><dd>{Math.round((routing.confidence || 0) * 100)}%</dd></div><div><dt>Routing Status</dt><dd>{routing.routing_status === "approved" ? "Approved" : routing.routing_status === "discuss" ? "继续讨论" : "等待 Founder 审核"}</dd></div></dl>
        <footer>{routing.routing_status === "approved" ? <strong className="sino-routing-approved">✓ 已批准</strong> : <button type="button" className="is-primary" disabled={busy} onClick={() => onReviewConstitutionRouting?.(selectedWorkItem.work_item_id, "approved")}>批准建议</button>}<button type="button" disabled={busy} onClick={() => onReviewConstitutionRouting?.(selectedWorkItem.work_item_id, "discuss")}>返回讨论</button></footer>
        {formalProposal ? <section className="sino-formal-object-proposal" aria-label="Formal Object Proposal">
          <header><span>Formal Object Proposal</span><h3>建议创建 · {formalProposal.proposed_object}</h3></header>
          <dl><div><dt>Object Type</dt><dd>{ROUTE_LABELS[formalProposal.object_type] || formalProposal.object_type}</dd></div><div><dt>Parent Project</dt><dd>{formalProposal.parent_project}</dd></div><div><dt>Architecture Role</dt><dd>{formalProposal.architecture_role}</dd></div><div><dt>Source</dt><dd>{formalProposal.source_constitution}</dd></div><div><dt>Source Work Item</dt><dd>{formalProposal.source_work_item}</dd></div><div><dt>Initial Positioning</dt><dd>{formalProposal.initial_positioning}</dd></div><div><dt>Reason</dt><dd>{formalProposal.reason}</dd></div><div><dt>Initial Scope</dt><dd><ul>{(formalProposal.initial_scope || []).map((item) => <li key={item}>{item}</li>)}</ul></dd></div><div><dt>Status</dt><dd>{formalProposal.status === "created" ? "Created" : "Awaiting Founder Confirmation"}</dd></div></dl>
          {formalProposal.status === "created" ? <section className="sino-formal-object-result" aria-label="Creation Result"><header><span>Creation Result</span><strong>✓ 已创建</strong></header><dl><div><dt>Project</dt><dd>{formalProposal.proposed_object}</dd></div><div><dt>Parent</dt><dd>{formalProposal.parent_project}</dd></div><div><dt>Type</dt><dd>{ROUTE_LABELS[formalProposal.object_type] || formalProposal.object_type}</dd></div><div><dt>Architecture Role</dt><dd>{formalProposal.architecture_role}</dd></div></dl><button type="button" className="is-primary" disabled={busy || !formalProposal.created_project_id} onClick={() => onOpenProject?.(formalProposal.created_project_id)}>进入 Project</button></section> : null}
          <footer>{formalProposal.status === "created" ? <strong className="sino-routing-approved">✓ 已创建</strong> : <button type="button" className="is-primary" disabled={busy} onClick={() => onConfirmFormalObject?.(selectedWorkItem.work_item_id)}>确认创建</button>}<button type="button" disabled={busy} onClick={() => onReviewConstitutionRouting?.(selectedWorkItem.work_item_id, "discuss")}>返回讨论</button></footer>
        </section> : null}
      </section> : null}
    </section> : null}
    {!isQuickFix && brain.stage === "goal_discovery" ? <button type="button" className="sino-brain-force-review" disabled={busy} onClick={onForceReview}>目标已经够清楚，开始讨论</button> : null}
    {!isQuickFix && brain.stage === "goal_confirmed" ? <button type="button" className="sino-brain-force-review" disabled={busy} onClick={onStartStrategy}>开始策略会议</button> : null}
    <PackageOverview pkg={brain.discussion_package} />
    {brain.discussion_package?.asset_commit ? <section className="sino-asset-commit-dashboard" aria-label="Candidate Commit Status"><h3>Candidate Commit Status</h3>{brain.discussion_package.asset_commit.items?.map((item) => <div key={item.asset_id}><span>{TYPE_LABELS[item.object_type] || item.object_type}</span><strong>{item.name}</strong><b>{item.lifecycle_status === "ready" ? "Ready" : "Candidate"}</b></div>)}</section> : null}
    {brain.strategy_proposals?.length || brain.discussion_package?.lifecycle?.length ? <details className="sino-brain-evidence"><summary>Developer Timeline · 查看讨论依据</summary>{brain.strategy_proposals?.map((item) => <article key={item.model_run_id || `${item.provider}-${item.model}`}><strong>{item.model} · {item.provider}</strong><p>{item.proposal?.core_judgment || item.proposal?.recommendation || "已记录结构化提案"}</p></article>)}{brain.discussion_package?.lifecycle?.map((item, index) => <article key={`${item.status}-${index}`}><strong>{item.status}</strong><p>{item.at}</p></article>)}</details> : null}
    <ContextSourcesDebug groundings={contextGroundings} />
  </section>;
}
