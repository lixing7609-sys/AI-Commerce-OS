import { FounderActionCard } from "./FounderActionCard.jsx";
import { ContextSourcesDebug } from "./ContextSourcesDebug.jsx";
import { projectMaturityProjection } from "./projectMaturityProjection.js";
import { approveFounderObject, approveTaskForExecution, cancelFounderExecution, decideOperationalAction, rejectTaskForExecution, startTaskExecution } from "../services/founderAiApi.js";
import { acceptFounderTaskResult } from "../services/founderAiApi.js";
import { decideCodexAuthorization } from "../services/founderAiApi.js";
import { decideFounderClarification } from "../services/founderAiApi.js";
import { decideFounderTaskCandidate } from "../services/founderAiApi.js";
import { focusFounderTask } from "../services/founderAiApi.js";
import { ExternalModelProbeDecisionCard } from "./ExternalModelProbeDecisionCard.jsx";
import { ImageModelProbeDecisionCard } from "./ImageModelProbeDecisionCard.jsx";
import { ArchitectureProposalCard } from "./ConversationThread.jsx";

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

const TASK_STATUS_LABELS = {
  pending_founder_confirmation: "待确认", needs_revision: "待修改", discussion_continues: "讨论中",
  queued: "排队中", inspecting: "检查中", executing: "执行中", testing: "测试中",
  verification: "验证中", blocked: "验证受阻", self_healing: "正在自愈", retrying: "重新验证",
  completed: "已完成", accepted: "已验收", closed: "已关闭", cancelled: "已停止",
};

export function FounderWorkQueue({ tasks = [], focusedTaskId, conversationId, busy, onFocused, onCandidateResolved, onContinueDiscussion }) {
  const active = tasks.filter((item) => !item.is_completed && !item.is_archived);
  const completed = tasks.filter((item) => item.is_completed && !item.is_archived);
  const choose = async (taskRef) => {
    const result = await focusFounderTask(conversationId, taskRef);
    onFocused?.(result);
  };
  const card = (task) => {
    const focused = task.task_ref === focusedTaskId;
    const candidate = task.details || {};
    const candidateAction = (task.founder_actions || []).find((item) => item.type === "TASK_CONFIRMATION" && item.status === "pending");
    const list = (value) => Array.isArray(value) ? value : value ? [value] : [];
    return <article key={task.task_ref} aria-label={`Task Card: ${task.title}`} aria-current={focused ? "true" : undefined}
      aria-expanded={focused} className={`sino-work-queue-card${focused ? " is-focused" : ""}`} onClick={() => choose(task.task_ref)}>
      <header><div><h3>{task.title}</h3><span>{TASK_STATUS_LABELS[task.status] || task.status}</span></div><small>{task.founder_action_required ? "Founder：需要操作" : "Founder：无需操作"}</small></header>
      {Number.isFinite(task.progress) ? <div className="sino-work-queue-progress" aria-label={`${task.title} progress`}><i style={{ width: `${task.progress}%` }} /><span>{task.progress}%</span></div> : null}
      {focused ? <section className="sino-work-queue-card__details"><p>{candidate.goal || candidate.description || "任务详情已记录。"}</p>
        {task.is_candidate ? <dl><div><dt>范围</dt><dd>{list(candidate.scope).join(" · ") || "按当前讨论"}</dd></div><div><dt>约束</dt><dd>{list(candidate.constraints).join(" · ") || "按当前讨论"}</dd></div><div><dt>验收标准</dt><dd>{list(candidate.acceptance_criteria).join(" · ") || "按当前讨论"}</dd></div></dl> : null}
        {candidateAction ? <footer onClick={(event) => event.stopPropagation()}><button type="button" className="is-primary" disabled={busy} onClick={async () => onCandidateResolved?.(await decideFounderTaskCandidate(conversationId, task.candidate_id, "confirm"))}>确认执行</button><button type="button" disabled={busy} onClick={async () => { onCandidateResolved?.(await decideFounderTaskCandidate(conversationId, task.candidate_id, "modify")); onContinueDiscussion?.(); }}>修改任务</button><button type="button" disabled={busy} onClick={async () => { onCandidateResolved?.(await decideFounderTaskCandidate(conversationId, task.candidate_id, "continue_discussion")); onContinueDiscussion?.(); }}>继续讨论</button></footer> : null}
      </section> : null}
    </article>;
  };
  return <section className="sino-brain-context sino-founder-task-sidebar" aria-label="Execution Center">
    <header className="sino-work-queue-heading"><div><h2>执行中心</h2><span>任务 {tasks.length}</span></div><small>{tasks.some((item) => item.founder_action_required) ? "有事项需要处理" : "暂无需要处理的事项"}</small></header>
    <section className="sino-work-queue-list" aria-label="Conversation Tasks">{active.map(card)}</section>
    {completed.length ? <details className="sino-work-queue-completed"><summary>已完成（{completed.length}）</summary>{completed.map(card)}</details> : null}
  </section>;
}

const UNIFIED_QUEUE_TYPES = ["OBJECT_APPROVAL", "EXECUTION_APPROVAL", "EXECUTION_START", "HIGH_RISK_OPERATIONAL_TASK", "BOUNDED_CODE_CHANGE_APPROVAL", "SAFE_PUSH_APPROVAL", "SAFE_MERGE_APPROVAL", "SAFE_INTEGRATION_PUSH_APPROVAL"];

function FounderActionQueueItems({ actions = [], busy, onResolved, onContinueDiscussion }) {
  const mvpActions = actions.filter((item) => UNIFIED_QUEUE_TYPES.includes(item.action_type || item.type) && item.status === "pending");
  if (!mvpActions.length) return null;
  const complete = async (handler) => {
    await handler();
    await onResolved?.();
  };
  return <>
    {mvpActions.map((item) => {
      const type = item.action_type || item.type;
      const risk = item.risk_level || item.risk || "MEDIUM";
      if (type === "OBJECT_APPROVAL") return <article className="sino-founder-action-item" aria-label="Object Approval" key={item.action_id}>
        <span>对象审批 · {risk}</span><h3>{item.title || "批准对象"}</h3><p>{item.summary}</p>
        <footer><button type="button" className="is-primary" disabled={busy} onClick={() => complete(() => approveFounderObject(item.object_id || item.source_id))}>批准对象</button><button type="button" disabled={busy} onClick={onContinueDiscussion}>继续讨论</button></footer>
      </article>;
      if (type === "EXECUTION_APPROVAL") return <article className="sino-founder-action-item" aria-label="Execution Approval" key={item.action_id}>
        <span>执行审批 · {risk}</span><h3>{item.title || "批准执行"}</h3><p>{item.summary}</p>
        <footer><button type="button" className="is-primary" disabled={busy} onClick={() => complete(() => approveTaskForExecution(item.task_id || item.source_id))}>批准执行</button><button type="button" disabled={busy} onClick={() => complete(() => rejectTaskForExecution(item.task_id || item.source_id))}>拒绝</button><button type="button" disabled={busy} onClick={onContinueDiscussion}>继续讨论</button></footer>
      </article>;
      if (type === "HIGH_RISK_OPERATIONAL_TASK") return <article className="sino-founder-action-item" aria-label="High Risk Operational Action" key={item.action_id}>
        <span>高风险操作 · {risk}</span><h3>{item.title || "需要 Founder 确认"}</h3><p>{item.summary}</p>
        <footer><button type="button" disabled={busy} onClick={onContinueDiscussion}>继续讨论</button></footer>
      </article>;
      if (type === "BOUNDED_CODE_CHANGE_APPROVAL") {
        const metadata = item.metadata || {};
        const plannedFiles = metadata.planned_files || metadata.allowed_files || [];
        const criteria = metadata.acceptance_criteria || [];
        const nonGoals = metadata.explicit_non_goals || [];
        return <article className="sino-founder-action-item" aria-label="Bounded Code Change Approval" key={item.action_id}>
          <span>受控代码修改 · {risk}</span><h3>{item.title || "批准受控代码修改"}</h3><p>{item.summary}</p>
          <dl>
            <div><dt>计划文件</dt><dd>{plannedFiles.length ? plannedFiles.join(" · ") : "等待 Sino 明确边界"}</dd></div>
            <div><dt>验收标准</dt><dd>{criteria.length ? criteria.join(" · ") : "按当前讨论"}</dd></div>
            <div><dt>批准后</dt><dd>修改 → 自动验证 → 创建本地 checkpoint；不会 push</dd></div>
            <div><dt>不做</dt><dd>{nonGoals.length ? nonGoals.join(" · ") : "不越过授权边界"}</dd></div>
          </dl>
          <footer><button type="button" className="is-primary" disabled={busy} onClick={() => complete(() => decideOperationalAction(item.action_id, "approve"))}>批准修改</button><button type="button" disabled={busy} onClick={() => complete(() => decideOperationalAction(item.action_id, "reject"))}>驳回</button><button type="button" disabled={busy} onClick={() => decideOperationalAction(item.action_id, "continue_discussion").then(() => onContinueDiscussion?.())}>继续讨论</button></footer>
        </article>;
      }
      if (type === "SAFE_PUSH_APPROVAL") {
        const metadata = item.metadata || {};
        const pushRequest = metadata.push_request || {};
        return <article className="sino-founder-action-item" aria-label="Safe Push Approval" key={item.action_id}>
          <span>安全推送 · {risk}</span><h3>{item.title || "批准安全推送"}</h3><p>{item.summary}</p>
          <dl>
            <div><dt>Local branch</dt><dd>{pushRequest.local_branch || metadata.local_branch || "—"}</dd></div>
            <div><dt>Local HEAD</dt><dd>{pushRequest.local_head || metadata.checkpoint_head || "—"}</dd></div>
            <div><dt>Remote</dt><dd>{pushRequest.remote_name || metadata.remote_name || "origin"}</dd></div>
            <div><dt>Remote branch</dt><dd>{pushRequest.remote_branch || metadata.remote_branch || "—"}</dd></div>
            <div><dt>Ahead / Behind</dt><dd>{pushRequest.ahead_count ?? metadata.ahead_count ?? 0} / {pushRequest.behind_count ?? metadata.behind_count ?? 0}</dd></div>
            <div><dt>Working tree</dt><dd>{pushRequest.working_tree_clean ? "clean" : "dirty"}</dd></div>
            <div><dt>Force</dt><dd>NO</dd></div>
            <div><dt>Tags</dt><dd>不会 push tags</dd></div>
            <div><dt>范围</dt><dd>只会把当前分支的已验证本地 commit 正常 push 到同名远程分支；不会 force push，不会 push tags，不会 merge，不会 deploy。</dd></div>
          </dl>
          <footer><button type="button" className="is-primary" disabled={busy} onClick={() => complete(() => decideOperationalAction(item.action_id, "approve"))}>批准推送</button><button type="button" disabled={busy} onClick={() => complete(() => decideOperationalAction(item.action_id, "reject"))}>拒绝</button><button type="button" disabled={busy} onClick={() => decideOperationalAction(item.action_id, "continue_discussion").then(() => onContinueDiscussion?.())}>继续讨论</button></footer>
        </article>;
      }
      if (type === "SAFE_MERGE_APPROVAL") {
        const metadata = item.metadata || {};
        const mergeRequest = metadata.merge_request || {};
        return <article className="sino-founder-action-item" aria-label="Safe Merge Approval" key={item.action_id}>
          <span>SAFE MERGE · {risk}</span><h3>{item.title || "批准本地安全合并"}</h3><p>{item.summary}</p>
          <dl>
            <div><dt>Source branch</dt><dd>{mergeRequest.source_branch || metadata.source_branch || "—"}</dd></div>
            <div><dt>Source HEAD</dt><dd>{mergeRequest.source_head || metadata.source_head || "—"}</dd></div>
            <div><dt>Source remote</dt><dd>{mergeRequest.source_remote || metadata.source_remote || "origin"}</dd></div>
            <div><dt>Source remote HEAD</dt><dd>{mergeRequest.source_remote_head || metadata.source_remote_head || "—"}</dd></div>
            <div><dt>Target branch</dt><dd>{mergeRequest.target_branch || metadata.target_branch || "feature/foundation-reset-integration"}</dd></div>
            <div><dt>Target HEAD</dt><dd>{mergeRequest.target_head_before || metadata.target_head_before || "—"}</dd></div>
            <div><dt>Target remote sync</dt><dd>{mergeRequest.target_ahead_remote || mergeRequest.target_behind_remote ? "NOT_SYNCED" : "SYNCED"}</dd></div>
            <div><dt>Source remote sync</dt><dd>{mergeRequest.source_ahead_remote || mergeRequest.source_behind_remote ? "NOT_SYNCED" : "SYNCED"}</dd></div>
            <div><dt>Strategy</dt><dd>--no-ff</dd></div>
            <div><dt>Conflict auto-resolution</dt><dd>NO，不会自动解决冲突</dd></div>
            <div><dt>Push after merge</dt><dd>NO，不会 push target branch</dd></div>
            <div><dt>方向</dt><dd>source → target；不会 merge main/master/develop，不会 force，不会 deploy。</dd></div>
          </dl>
          <footer><button type="button" className="is-primary" disabled={busy} onClick={() => complete(() => decideOperationalAction(item.action_id, "approve"))}>批准合并</button><button type="button" disabled={busy} onClick={() => complete(() => decideOperationalAction(item.action_id, "reject"))}>拒绝</button><button type="button" disabled={busy} onClick={() => decideOperationalAction(item.action_id, "continue_discussion").then(() => onContinueDiscussion?.())}>继续讨论</button></footer>
        </article>;
      }
      if (type === "SAFE_INTEGRATION_PUSH_APPROVAL") {
        const metadata = item.metadata || {};
        const pushRequest = metadata.push_request || {};
        return <article className="sino-founder-action-item" aria-label="Safe Integration Push Approval" key={item.action_id}>
          <span>SAFE INTEGRATION PUSH · {risk}</span><h3>{item.title || "批准 Integration 安全推送"}</h3><p>{item.summary}</p>
          <dl>
            <div><dt>Integration branch</dt><dd>{pushRequest.integration_branch || metadata.integration_branch || "feature/foundation-reset-integration"}</dd></div>
            <div><dt>Integration HEAD</dt><dd>{pushRequest.integration_head || metadata.integration_head || "—"}</dd></div>
            <div><dt>Remote</dt><dd>{pushRequest.remote_name || metadata.remote_name || "origin"}</dd></div>
            <div><dt>Remote branch</dt><dd>{pushRequest.remote_branch || metadata.remote_branch || "—"}</dd></div>
            <div><dt>Ahead / Behind</dt><dd>{pushRequest.ahead_count ?? metadata.ahead_count ?? 0} / {pushRequest.behind_count ?? metadata.behind_count ?? 0}</dd></div>
            <div><dt>Working tree</dt><dd>{pushRequest.working_tree_clean ? "clean" : "dirty"}</dd></div>
            <div><dt>Source merge</dt><dd>{pushRequest.merged_source_branch || metadata.merged_source_branch || "已记录"}</dd></div>
            <div><dt>Merge commit</dt><dd>{pushRequest.merge_commit_head || metadata.merge_commit_head || "—"}</dd></div>
            <div><dt>Force</dt><dd>NO</dd></div>
            <div><dt>Tags</dt><dd>不会 push tags</dd></div>
            <div><dt>Deploy</dt><dd>NO，不会 deploy</dd></div>
            <div><dt>范围</dt><dd>只会把当前已完成本地安全合并的 integration branch 正常 push 到配置的同名远程 integration branch；不会 force push，不会 push tag，不会 deploy，不会 merge main/master/develop。</dd></div>
          </dl>
          <footer><button type="button" className="is-primary" disabled={busy} onClick={() => complete(() => decideOperationalAction(item.action_id, "approve"))}>批准推送 Integration</button><button type="button" disabled={busy} onClick={() => complete(() => decideOperationalAction(item.action_id, "reject"))}>拒绝</button><button type="button" disabled={busy} onClick={() => decideOperationalAction(item.action_id, "continue_discussion").then(() => onContinueDiscussion?.())}>继续讨论</button></footer>
        </article>;
      }
      return <article className="sino-founder-action-item" aria-label="Execution Start" key={item.action_id}>
        <span>开始执行 · {risk}</span><h3>{item.title || "开始执行"}</h3><p>{item.summary}</p>
        <footer><button type="button" className="is-primary" disabled={busy} onClick={() => complete(() => startTaskExecution(item.task_id || item.source_id))}>开始执行</button><button type="button" disabled={busy} onClick={onContinueDiscussion}>稍后 / 继续讨论</button></footer>
      </article>;
    })}
  </>;
}

export function ExecutionCenterEmpty() {
  return <section className="sino-brain-context sino-founder-task-sidebar sino-execution-center-empty" aria-label="Execution Center">
    <header className="sino-work-queue-heading"><div><h2>执行中心</h2></div></header>
    <section className="sino-task-status-empty"><strong>暂无执行事项</strong><small>Founder 暂无需要处理的事项</small></section>
  </section>;
}

export function SinoBrainContext({ brain, conversationId, contextGroundings, busy, capabilityAction, capabilityAsset, selectedConstitutionWorkItemId, onReviewConstitutionWorkItem, onReviewConstitutionRouting, onConfirmFormalObject, onOpenProject, onCapabilityAction, onConfirmGoal, onForceReview, onStartStrategy, onAdvanceStage, onContinueDiscussion, onReviewPackage, onViewAssets, onNewGoal, onExternalProbeDecision, onImageProbeDecision, onArchitectureDecision, onTaskAccepted, onClarificationResolved, onTaskCandidateResolved, onFounderActionResolved }) {
  if (!brain) return null;
  const brief = brain.goal_brief || {};
  const quickFixRoute = brain.discovery?.task_complexity_route;
  const routeHasTask = Boolean(
    quickFixRoute?.autonomous_execution?.execution_session_id
    || quickFixRoute?.execution_status
    || quickFixRoute?.standard_task_contract?.task_id
    || quickFixRoute?.architecture_proposal?.proposal_id
    || brain.execution_progress?.task_id
    || brain.discovery?.autonomous_main_loop?.status
  );
  const isQuickFix = quickFixRoute?.classification === "QUICK_FIX" && routeHasTask;
  const isStandardTask = quickFixRoute?.classification === "STANDARD_TASK" && routeHasTask;
  const isStrategicTask = quickFixRoute?.classification === "STRATEGIC_TASK" && routeHasTask;
  const architectureDecisionStatus = quickFixRoute?.architecture_proposal?.decision_status || (quickFixRoute?.architecture_proposal?.status === "ready_for_founder_decision" ? "pending" : quickFixRoute?.architecture_proposal?.status);
  const autonomousLoop = brain.discovery?.autonomous_main_loop;
  const decision = brain.decision || {};
  const understanding = brain.discovery?.working_understanding || {};
  const risk = decision.key_risks?.[0] || "暂无关键风险";
  const question = decision.remaining_unknowns?.[0] || brief.unknowns?.[0] || "暂无待确认问题";
  const taskSummaryAction = routeHasTask ? {
    action_id: "task_status_summary",
    title: brain.execution_progress?.current_action || (isStrategicTask ? "等待 Founder 决策" : isQuickFix ? "Quick Fix" : "Standard Task"),
    description: brain.execution_progress?.next_action || quickFixRoute?.standard_task_contract?.objective || quickFixRoute?.quick_fix_contract?.expected_behavior || "Sino 正在处理当前任务。",
    progress_percent: brain.execution_progress?.progress_percent,
    founder_action_required: Boolean(brain.execution_progress?.founder_action_required),
  } : null;
  const action = capabilityAction || taskSummaryAction || brain.current_action || (brain.stage === "goal_review" ? { action_id: "confirm_goal", title: "目标已经明确", description: "继续对话；只有 Founder 明确要求执行后才创建任务。", primary_label: null, secondary_label: null } : brain.stage === "package_ready" ? { action_id: "approve_package", title: "等待 Founder 批准成果包", description: "确认后把讨论成果沉淀为候选能力。", primary_label: "批准候选能力", secondary_label: "继续讨论", danger_label: "退回修改" } : null);
  const progress = brain.execution_progress;
  const executionId = progress?.execution_id || quickFixRoute?.autonomous_execution?.execution_session_id;
  const canStop = Boolean(executionId && ["queued", "executing", "testing", "verification", "self_healing", "retrying", "stalled", "waiting_for_founder_authorization", "cancelling"].includes(progress?.execution_status));
  const visibleResult = quickFixRoute?.visible_result;
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
  const mvpQueueActions = (brain.discovery?.founder_action_queue || []).filter((item) => UNIFIED_QUEUE_TYPES.includes(item.action_type || item.type) && item.status === "pending");
  const conversationTasks = brain.discovery?.conversation_tasks || [];
  if (conversationTasks.length > 0 && !mvpQueueActions.length) return <FounderWorkQueue tasks={conversationTasks} focusedTaskId={brain.discovery?.focused_task_id}
    conversationId={conversationId} busy={busy} onFocused={onTaskCandidateResolved} onCandidateResolved={onTaskCandidateResolved}
    onContinueDiscussion={onContinueDiscussion} />;
  if (!routeHasTask) {
    const clarificationActions = (brain.discovery?.founder_action_queue || []).filter((item) => item.type === "CLARIFICATION" && item.status === "pending");
    const taskConfirmationActions = (brain.discovery?.founder_action_queue || []).filter((item) => item.type === "TASK_CONFIRMATION" && item.status === "pending");
    const founderActions = [...mvpQueueActions, ...taskConfirmationActions, ...clarificationActions];
    const clarificationRequired = clarificationActions.length > 0 || brain.discovery?.clarification_state?.founder_action_required === true;
    const taskConfirmationRequired = taskConfirmationActions.length > 0;
    if (!founderActions.length) return <ExecutionCenterEmpty />;
    return <section className="sino-brain-context sino-founder-task-sidebar" aria-label="Execution Center">
      <header className="sino-work-queue-heading"><div><h2>执行中心</h2></div></header>
      <section className="sino-task-status-empty" aria-label="Task Status"><header><h2>任务状态</h2></header><strong>{taskConfirmationRequired ? "待确认" : clarificationRequired ? "等待确认" : "讨论中"}</strong><p>{taskConfirmationRequired ? "已形成待确认任务，尚未开始执行" : "尚未形成执行任务"}</p><small>{founderActions.length ? "Founder：需要操作" : "Founder：无需操作"}</small></section>
      <section className="sino-founder-action-queue" aria-label="Founder Action Queue"><header><h2>需要你处理</h2><span>{founderActions.length ? `${founderActions.length} 项待处理` : "暂无需要你处理的事项"}</span></header>
        <FounderActionQueueItems actions={mvpQueueActions} busy={busy} onResolved={onFounderActionResolved} onContinueDiscussion={onContinueDiscussion} />
        {taskConfirmationActions.map((item) => { const candidate = item.task_candidate || {}; const list = (value) => Array.isArray(value) ? value : value ? [value] : []; return <article className="sino-founder-action-item" aria-label="Task Confirmation" key={item.action_id}><span>待确认任务</span><h3>{candidate.title || item.title}</h3><p>{candidate.goal || item.summary}</p><dl><div><dt>范围</dt><dd>{list(candidate.scope).join(" · ") || "按当前讨论"}</dd></div><div><dt>约束</dt><dd>{list(candidate.constraints).join(" · ") || "按当前讨论"}</dd></div><div><dt>验收标准</dt><dd>{list(candidate.acceptance_criteria).join(" · ") || "按当前讨论"}</dd></div></dl><footer><button type="button" className="is-primary" disabled={busy} onClick={async () => { const value = await decideFounderTaskCandidate(conversationId, candidate.candidate_id, "confirm"); onTaskCandidateResolved?.(value); }}>确认执行</button><button type="button" disabled={busy} onClick={async () => { const value = await decideFounderTaskCandidate(conversationId, candidate.candidate_id, "modify"); onTaskCandidateResolved?.(value); onContinueDiscussion?.(); }}>修改任务</button><button type="button" disabled={busy} onClick={async () => { const value = await decideFounderTaskCandidate(conversationId, candidate.candidate_id, "continue_discussion"); onTaskCandidateResolved?.(value); onContinueDiscussion?.(); }}>继续讨论</button></footer></article>; })}
        {clarificationActions.map((item) => { const confirmable = Boolean(item.current_understanding?.confirmed_decisions?.length); return <article className="sino-founder-action-item" aria-label="Clarification Required" key={item.action_id}><span>待确认</span><h3>{item.title}</h3><p>{item.summary}</p>{confirmable ? <dl>{Object.entries(item.current_understanding.confirmed_decisions[0]).filter(([key]) => key !== "type").map(([key, value]) => <div key={key}><dt>{{ left: "左", center: "中", right: "右" }[key] || key}</dt><dd>{value}</dd></div>)}</dl> : null}<footer>{confirmable ? <button type="button" className="is-primary" disabled={busy} onClick={async () => { const value = await decideFounderClarification(conversationId, "confirm"); onClarificationResolved?.(value); }}>确认当前理解</button> : null}<button type="button" disabled={busy} onClick={async () => { const value = await decideFounderClarification(conversationId, "continue_discussion"); onClarificationResolved?.(value); onContinueDiscussion?.(); }}>继续讨论</button></footer></article>; })}
      </section>
      <details className="sino-task-technical-details"><summary>查看讨论详情 / 技术详情</summary><dl><div><dt>Current Stage</dt><dd>{STAGE_LABELS[brain.stage] || brain.stage}</dd></div><div><dt>Goal</dt><dd>{brief.goal || understanding.interpreted_goal || "正在理解"}</dd></div><div><dt>Goal Status</dt><dd>{READINESS_LABELS[brain.goal_readiness] || brain.goal_readiness}</dd></div><div><dt>Decision</dt><dd>{decision.final_recommendation || "尚未形成"}</dd></div><div><dt>Confidence</dt><dd>{decision.confidence ? `${Math.round(decision.confidence * 100)}%` : "—"}</dd></div><div><dt>Current Risk</dt><dd>{risk}</dd></div><div><dt>Remaining Question</dt><dd>{question}</dd></div></dl><ContextSourcesDebug groundings={contextGroundings} /></details>
    </section>;
  }
  if (isQuickFix || isStandardTask || isStrategicTask) {
    const externalGate = quickFixRoute?.founder_gate_contract?.gate_type === "EXTERNAL_MODEL_PROBE" ? quickFixRoute.founder_gate_contract : null;
    const imageGateVisible = ["founder_gate_required", "founder_gate_rejected", "model_probe_authorized", "model_probe_queued"].includes(autonomousLoop?.status);
    const acceptance = quickFixRoute?.founder_acceptance;
    const codexBoundary = progress?.codex_authorization_boundary;
    const actionCount = mvpQueueActions.length + Number(Boolean(isStrategicTask && ["pending", "ready_for_founder_decision", "revision_requested"].includes(architectureDecisionStatus))) + Number(Boolean(externalGate)) + Number(Boolean(imageGateVisible)) + Number(Boolean(codexBoundary)) + Number(Boolean(visibleResult?.verification_status === "PASS" && acceptance?.status !== "accepted")) + Number(Boolean(progress?.execution_status === "technical_blocker"));
    const architecturePending = isStrategicTask && ["pending", "ready_for_founder_decision", "revision_requested"].includes(architectureDecisionStatus);
    const accepted = acceptance?.status === "accepted";
    const hasHandledActions = accepted || ["approved", "rejected"].includes(architectureDecisionStatus);
    return <section className="sino-brain-context sino-founder-task-sidebar" aria-label="Execution Center">
      <header className="sino-task-status-heading"><h2>执行中心</h2></header>
      <FounderActionCard compact action={action} busy={busy} readOnly onViewAssets={onViewAssets} />
      {canStop ? <section className="sino-emergency-stop" aria-label="任务控制"><button type="button" disabled={busy || progress?.execution_status === "cancelling"} onClick={() => cancelFounderExecution(executionId).catch(() => {})}>{progress?.execution_status === "cancelling" ? "正在停止…" : "停止任务"}</button></section> : null}
      <section className="sino-founder-action-queue" aria-label="Founder Action Queue"><header><h2>需要你处理</h2><span>{actionCount ? `${actionCount} 项待处理` : "暂无需要你处理的事项"}</span></header>
        <FounderActionQueueItems actions={mvpQueueActions} busy={busy} onResolved={onFounderActionResolved} onContinueDiscussion={onContinueDiscussion} />
        {architecturePending && quickFixRoute?.architecture_proposal ? <ArchitectureProposalCard proposal={quickFixRoute.architecture_proposal} busy={busy} onDecision={onArchitectureDecision} /> : null}
        {externalGate ? <ExternalModelProbeDecisionCard gate={externalGate} busy={busy} onDecision={onExternalProbeDecision} /> : null}
        {imageGateVisible ? <ImageModelProbeDecisionCard loop={autonomousLoop} busy={busy} onDecision={onImageProbeDecision} /> : null}
        {codexBoundary ? <article className="sino-founder-action-item" aria-label="Codex Founder Boundary"><span>待授权</span><h3>{codexBoundary.operation_type}</h3><p>{codexBoundary.decision_reason}</p><dl><div><dt>Scope</dt><dd>{Array.isArray(codexBoundary.resource_scope) ? codexBoundary.resource_scope.join(" · ") : codexBoundary.resource_scope}</dd></div><div><dt>Risk</dt><dd>{codexBoundary.risk_level}</dd></div><div><dt>External Effect</dt><dd>{codexBoundary.external_effect || "none"}</dd></div></dl><footer><button type="button" className="is-primary" disabled={busy} onClick={() => decideCodexAuthorization(executionId, "approve", codexBoundary.requested_scope || {})}>批准</button><button type="button" disabled={busy} onClick={() => decideCodexAuthorization(executionId, "modify", codexBoundary.requested_scope || {})}>修改范围</button><button type="button" disabled={busy} onClick={() => decideCodexAuthorization(executionId, "reject")}>驳回</button></footer></article> : null}
        {progress?.execution_status === "technical_blocker" ? <article className="sino-founder-action-item"><span>需要关注</span><h3>Technical Blocker</h3><p>{progress.technical_blocker?.reason || progress.next_action}</p></article> : null}
        {visibleResult?.verification_status === "PASS" && !accepted ? <article className="sino-founder-action-item" aria-label="Founder Acceptance"><span>等待验收</span><h3>{visibleResult.title}</h3><p>Verification PASS · {visibleResult.target_surface}</p><footer><button type="button" onClick={onViewAssets}>查看结果</button><button type="button" className="is-primary" disabled={busy} onClick={async () => { const next = await acceptFounderTaskResult(conversationId); onTaskAccepted?.(next); }}>验收通过</button></footer></article> : null}
      </section>
      {hasHandledActions ? <details className="sino-founder-action-history"><summary>已处理</summary>{accepted ? <p>Founder Acceptance · Accepted</p> : null}{["approved", "rejected"].includes(architectureDecisionStatus) ? <p>Architecture Proposal · {architectureDecisionStatus === "approved" ? "Approved" : "Rejected"}</p> : null}</details> : null}
      <details className="sino-task-technical-details"><summary>查看任务详情 / 技术详情</summary><dl><div><dt>Task</dt><dd>{progress?.task_id || "—"}</dd></div><div><dt>Target</dt><dd>{quickFixRoute?.standard_task_contract?.target_surface || quickFixRoute?.quick_fix_contract?.target_area || "—"}</dd></div><div><dt>Execution</dt><dd>{executionId || "—"}</dd></div><div><dt>Phase</dt><dd>{progress?.current_phase || quickFixRoute?.current_step}</dd></div><div><dt>Status</dt><dd>{progress?.execution_status || quickFixRoute?.execution_status}</dd></div></dl><ContextSourcesDebug groundings={contextGroundings} /></details>
    </section>;
  }
  return <section className="sino-brain-context sino-brain-dashboard" aria-label="Execution Center">
    {!projectAware ? <FounderActionCard compact action={action} busy={busy} onCapabilityAction={onCapabilityAction} onConfirmGoal={onConfirmGoal} onReviseGoal={onContinueDiscussion} onAdvanceStage={onAdvanceStage} onReviewPackage={onReviewPackage} onContinueDiscussion={onContinueDiscussion} onViewAssets={onViewAssets} onNewGoal={onNewGoal} /> : null}
    <header><h2>执行中心</h2><span>{constitution ? "Constitution Review" : autonomousLoop ? "Autonomous Capability Build" : projectLifecycle?.rank >= 300 ? projectLifecycle.stage_label : STAGE_LABELS[brain.stage] || brain.stage}</span></header>
    {isQuickFix ? <dl className="sino-brain-dashboard__grid">
      <div><dt>Task Type</dt><dd>Quick Fix</dd></div><div><dt>Visual Target</dt><dd>{quickFixRoute.quick_fix_contract?.visual_target || quickFixRoute.quick_fix_contract?.target_area}</dd></div><div><dt>Action</dt><dd>{quickFixRoute.quick_fix_contract?.operation === "REMOVE_UI_ELEMENT" ? "Remove UI Element" : "Bounded UI Fix"}</dd></div><div><dt>Current Step</dt><dd>{progress?.current_phase || (quickFixRoute.execution_status === "completed" ? "Completed" : quickFixRoute.clarification_required ? "需要确认目标位置" : "自动推进")}</dd></div><div><dt>Founder Decision</dt><dd>{progress?.founder_action_required ? "Required" : "Not Required"}</dd></div><div><dt>Next Action</dt><dd>{progress?.next_action || (quickFixRoute.execution_status === "completed" ? "等待 Founder 验收" : quickFixRoute.clarification_required ? "补充目标位置后继续 Quick Fix" : "Sino 自动执行")}</dd></div>
    </dl> : isStandardTask ? <dl className="sino-brain-dashboard__grid">
      <div><dt>Task Type</dt><dd>Standard Task</dd></div><div><dt>Target</dt><dd>{quickFixRoute.standard_task_contract?.target_surface}</dd></div><div><dt>Current Step</dt><dd>{progress?.current_phase || quickFixRoute.current_step}</dd></div><div><dt>Execution</dt><dd>{progress?.execution_status || quickFixRoute.execution_status}</dd></div><div><dt>Founder Decision</dt><dd>{progress?.founder_action_required ? "Required" : "Not Required"}</dd></div><div><dt>Next Action</dt><dd>{progress?.next_action || (quickFixRoute.execution_status === "completed" ? "等待 Founder 验收" : "Sino 自动执行")}</dd></div>
    </dl> : isStrategicTask ? <dl className="sino-brain-dashboard__grid">
      <div><dt>Task Type</dt><dd>Architecture Task</dd></div><div><dt>Current Step</dt><dd>{progress?.current_phase || quickFixRoute.current_step}</dd></div><div><dt>Architecture Analysis</dt><dd>{quickFixRoute.architecture_analysis?.status}</dd></div><div><dt>Proposal</dt><dd>{quickFixRoute.architecture_proposal?.status}</dd></div><div><dt>Execution</dt><dd>{architectureDecisionStatus === "approved" ? "Allowed · Not Started" : "Not Allowed Before Approval"}</dd></div><div><dt>Founder Decision</dt><dd>{architectureDecisionStatus === "approved" ? "Approved" : architectureDecisionStatus === "rejected" ? "Rejected" : "Required"}</dd></div><div><dt>Next Action</dt><dd>{architectureDecisionStatus === "approved" ? "等待进入实施阶段" : architectureDecisionStatus === "rejected" ? "Task 已关闭" : architectureDecisionStatus === "revision_requested" ? "Founder 提交修改意见" : "Founder 审核 Architecture Proposal"}</dd></div>
    </dl> : autonomousLoop ? <dl className="sino-brain-dashboard__grid">
      <div><dt>Task Type</dt><dd>{autonomousLoop.task_type}</dd></div>
      <div><dt>Capability Gap</dt><dd>{autonomousLoop.capability_compatibility?.status}</dd></div>
      <div><dt>Model Candidates</dt><dd>{autonomousLoop.model_candidates?.length || 0}</dd></div>
      <div><dt>Manual Continue</dt><dd>{autonomousLoop.manual_continue_count}</dd></div>
      <div><dt>Codex Instructions</dt><dd>{autonomousLoop.manual_codex_instruction_count}</dd></div>
      <div><dt>Current Status</dt><dd>{autonomousLoop.status}</dd></div>
      <div><dt>Founder Decision</dt><dd>{autonomousLoop.founder_gate_required ? "Required for bounded model probe" : "Not Required"}</dd></div>
      <div><dt>Next Action</dt><dd>{action?.description || "Sino 自动执行"}</dd></div>
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
    {canStop ? <section className="sino-emergency-stop" aria-label="任务控制"><button type="button" disabled={busy || progress?.execution_status === "cancelling"} onClick={() => cancelFounderExecution(executionId).catch(() => {})}>{progress?.execution_status === "cancelling" ? "正在停止…" : "停止任务"}</button></section> : null}
    {visibleResult?.verification_status === "PASS" ? <section className="sino-visible-result" aria-label="验收结果"><span>验收结果</span><h3>{visibleResult.title}</h3><dl><div><dt>验证</dt><dd>PASS</dd></div><div><dt>目标</dt><dd>{visibleResult.target_surface}</dd></div></dl><button type="button" className="is-primary" onClick={onViewAssets}>查看结果</button></section> : null}
    <PackageOverview pkg={brain.discussion_package} />
    {brain.discussion_package?.asset_commit ? <section className="sino-asset-commit-dashboard" aria-label="Candidate Commit Status"><h3>Candidate Commit Status</h3>{brain.discussion_package.asset_commit.items?.map((item) => <div key={item.asset_id}><span>{TYPE_LABELS[item.object_type] || item.object_type}</span><strong>{item.name}</strong><b>{item.lifecycle_status === "ready" ? "Ready" : "Candidate"}</b></div>)}</section> : null}
    {brain.strategy_proposals?.length || brain.discussion_package?.lifecycle?.length ? <details className="sino-brain-evidence"><summary>Developer Timeline · 查看讨论依据</summary>{brain.strategy_proposals?.map((item) => <article key={item.model_run_id || `${item.provider}-${item.model}`}><strong>{item.model} · {item.provider}</strong><p>{item.proposal?.core_judgment || item.proposal?.recommendation || "已记录结构化提案"}</p></article>)}{brain.discussion_package?.lifecycle?.map((item, index) => <article key={`${item.status}-${index}`}><strong>{item.status}</strong><p>{item.at}</p></article>)}</details> : null}
    <ContextSourcesDebug groundings={contextGroundings} />
  </section>;
}
