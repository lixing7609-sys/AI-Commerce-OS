import { useLayoutEffect, useRef, useState } from "react";
import { GlobalSecretaryComposer } from "./GlobalSecretaryComposer.jsx";
import { FounderActionCard } from "./FounderActionCard.jsx";
import { CapabilityLifecycleCard } from "./CapabilityLifecycleCard.jsx";
import { AssetCommitWorkspace } from "./AssetCommitWorkspace.jsx";
import { founderConversationTitle } from "./founderConversationTitle.js";
import { objectTypeLabel, statusLabel } from "./founderTerminology.js";
import { MessageBody } from "./MessageBody.jsx";
import { ConstitutionUnderstandingCard } from "./ConstitutionUnderstandingCard.jsx";
import { ExecutionPackageCard, ImplementationPlanCard, ProjectMaturityCard } from "./ProjectMaturityCard.jsx";
import { projectCurrentAction, projectMaturityProjection } from "./projectMaturityProjection.js";
import { ImageModelProbeDecisionCard } from "./ImageModelProbeDecisionCard.jsx";
import { founderImageUrl } from "../services/founderAiApi.js";

const MODEL_NAMES = { claude: "Claude", gpt: "GPT", deepseek: "DeepSeek" };
const HUMAN_FIELDS = ["text", "content", "message", "title", "summary", "description", "reason", "recommendation", "value"];
const LONGFORM_SOURCE_TERMS = /constitution|document|knowledge|prompt|宪法|文档|知识|提示词/i;

function longformSource(content, role) {
  if (role !== "founder") return false;
  const text = String(content || "");
  const paragraphs = text.split(/\n\s*\n/).filter((item) => item.trim());
  const lines = text.split("\n").filter((item) => item.trim());
  return text.length > 800 || paragraphs.length >= 4 || lines.length >= 12 || (text.length > 240 && LONGFORM_SOURCE_TERMS.test(text));
}

function longformTitle(content) {
  return String(content || "").split("\n").map((item) => item.replace(/^#{1,6}\s*/, "").trim()).find(Boolean) || "Founder 长文本";
}

export function normalizeDisplayText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(normalizeDisplayText).filter(Boolean).join("；");
  if (typeof value === "object") {
    for (const field of HUMAN_FIELDS) {
      const readable = normalizeDisplayText(value[field]);
      if (readable) return readable;
    }
    try {
      return Object.entries(value).map(([key, item]) => {
        const readable = normalizeDisplayText(item);
        return readable ? `${key}：${readable}` : "";
      }).filter(Boolean).join("；");
    } catch { return ""; }
  }
  try { return String(value); } catch { return ""; }
}

export function normalizeTextList(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map(normalizeDisplayText).filter(Boolean);
}

const proposalText = (proposal) => {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return normalizeDisplayText(proposal);
  return [
    normalizeDisplayText(proposal.core_judgment) && `核心判断：${normalizeDisplayText(proposal.core_judgment)}`,
    normalizeTextList(proposal.key_reasons).length && `主要理由：${normalizeTextList(proposal.key_reasons).join("；")}`,
    normalizeDisplayText(proposal.recommendation) && `建议：${normalizeDisplayText(proposal.recommendation)}`,
    normalizeTextList(proposal.risks).length && `风险：${normalizeTextList(proposal.risks).join("；")}`,
    normalizeTextList(proposal.objections).length && `异议：${normalizeTextList(proposal.objections).join("；")}`,
  ].filter(Boolean).join("\n");
};

function CouncilConversation({ run }) {
  const modelRuns = Array.isArray(run?.model_runs) ? run.model_runs.filter((item) => item && typeof item === "object") : [];
  const identityKey = (item) => `${item?.provider || ""}::${item?.model || ""}`;
  const actual = new Map(modelRuns.map((item) => [identityKey(item), item]));
  const participants = Array.isArray(run?.participants) && run.participants.length ? run.participants : modelRuns.map((item) => ({ provider: item.provider, model: item.model }));
  const ordered = participants.map((participant) => ({ ...participant, ...(actual.get(identityKey(participant)) || { status: "running" }) }));
  const messageClass = "sino-council-message";
  const synthesisText = normalizeDisplayText(run?.sino_synthesis || run?.synthesis);
  const synthesisLines = [
    normalizeDisplayText(run?.recommendation) ? `综合判断：${normalizeDisplayText(run.recommendation)}` : "",
    normalizeTextList(run?.consensus).length ? `主要共识：${normalizeTextList(run.consensus).join("；")}` : "",
    normalizeTextList(run?.disagreements).length ? `关键分歧：${normalizeTextList(run.disagreements).join("；")}` : "",
    normalizeTextList(run?.unique_insights).length ? `独特洞察：${normalizeTextList(run.unique_insights).join("；")}` : "",
    normalizeTextList(run?.risks).length ? `风险：${normalizeTextList(run.risks).join("；")}` : "",
    normalizeDisplayText(run?.candidate_goal) ? `Founder 下一步建议：${normalizeDisplayText(run.candidate_goal)}` : "",
    synthesisText,
  ].filter(Boolean);
  const hasCompletedProposal = modelRuns.some((item) => item.status === "completed" && item.proposal);
  if (!synthesisLines.length && ["completed", "completed_partial"].includes(run?.status) && hasCompletedProposal) {
    synthesisLines.push("已基于当前可用模型完成本轮讨论，但综合内容暂未完整返回。");
  }
  if (!ordered.length && run?.status === "running") return <article className={messageClass} data-role="assistant" data-message-type="system_status"><strong>* Sino</strong><MessageBody>正在组织多模型讨论…</MessageBody></article>;
  return <div className="sino-council-conversation">
    {ordered.map((item, index) => { const text = proposalText(item.proposal); const modelName = normalizeDisplayText(item.model_display_name) || MODEL_NAMES[item.provider] || normalizeDisplayText(item.model) || "模型"; const providerName = normalizeDisplayText(item.provider_display_name); return <article className={messageClass} key={`${run.council_run_id}-${identityKey(item) || index}`} data-role="assistant" data-message-type="model_proposal"><strong>* {modelName}{providerName ? ` · ${providerName}` : ""}</strong><MessageBody>{item.status === "completed" ? (text || "返回内容暂时无法完整展示") : item.status === "running" ? "思考中…" : "暂时不可用"}</MessageBody></article>; })}
    {run.status === "running" ? <article className={messageClass} data-role="assistant" data-message-type="system_status"><strong>* Sino</strong><MessageBody>{ordered.some((item) => item.status === "completed") ? "正在提炼共识与分歧…" : "正在组织多模型讨论…"}</MessageBody></article> : synthesisLines.length ? <article className={messageClass} data-role="assistant" data-message-type="sino_synthesis"><strong>* Sino</strong><MessageBody>{synthesisLines.join("\n")}</MessageBody></article> : null}
  </div>;
}

function AutoDeliberationConversation({ run }) {
  const modelRuns = Array.isArray(run?.model_runs) ? run.model_runs : [];
  const persistedRounds = Array.isArray(run?.deliberation?.rounds) ? run.deliberation.rounds : [];
  const roundNumbers = [...new Set(modelRuns.map((item) => Number(item?.round_number)).filter(Boolean))].sort((a, b) => a - b);
  const identity = (item) => {
    const modelName = normalizeDisplayText(item?.model_display_name) || MODEL_NAMES[item?.provider] || normalizeDisplayText(item?.model) || "模型";
    const providerName = normalizeDisplayText(item?.provider_display_name);
    return `${modelName}${providerName ? ` · ${providerName}` : ""}`;
  };
  const roundSummaryText = (summary) => [
    normalizeTextList(summary?.consensus).length ? `本轮共识：${normalizeTextList(summary.consensus).join("；")}` : "本轮共识：尚未形成",
    normalizeTextList(summary?.disagreements).length ? `本轮分歧：${normalizeTextList(summary.disagreements).join("；")}` : "本轮分歧：暂无明确分歧",
    normalizeTextList(summary?.new_information).length ? `新增信息：${normalizeTextList(summary.new_information).join("；")}` : "新增信息：本轮未提取到新的关键内容",
    normalizeDisplayText(summary?.next_focus) ? `下一步：${normalizeDisplayText(summary.next_focus)}` : "下一步：继续讨论",
  ].join("\n");
  const finalContent = [
    normalizeDisplayText(run?.recommendation) ? `最终综合：${normalizeDisplayText(run.recommendation)}` : "",
    normalizeTextList(run?.consensus).length ? `主要共识：${normalizeTextList(run.consensus).join("；")}` : "",
    normalizeTextList(run?.disagreements).length ? `关键分歧：${normalizeTextList(run.disagreements).join("；")}` : "",
    normalizeTextList(run?.unique_insights).length ? `重要少数意见：${normalizeTextList(run.unique_insights).join("；")}` : "",
    normalizeTextList(run?.risks).length ? `风险：${normalizeTextList(run.risks).join("；")}` : "",
    normalizeTextList(run?.unknowns).length ? `未解决问题：${normalizeTextList(run.unknowns).join("；")}` : "",
    normalizeDisplayText(run?.candidate_goal) ? `最终建议：${normalizeDisplayText(run.candidate_goal)}` : "",
  ].filter(Boolean).join("\n");
  return <div className="sino-council-conversation sino-auto-deliberation" data-deliberation-id={run?.council_run_id}>
    {roundNumbers.map((roundNumber) => { const items = modelRuns.filter((item) => Number(item?.round_number) === roundNumber); const trace = persistedRounds.find((item) => Number(item?.round_number) === roundNumber); return <details className="sino-deliberation-round" key={`${run.council_run_id}-round-${roundNumber}`} open>
      <summary>第 {roundNumber} 轮 <span>收起本轮 / 展开本轮</span></summary>
      <div className="sino-deliberation-round__messages">{items.map((item, index) => <article className="sino-council-message" key={item.model_run_id || `${roundNumber}-${index}`} data-message-type="model_proposal"><strong>* {identity(item)}</strong><MessageBody>{item.status === "completed" ? (proposalText(item.proposal) || "返回内容暂时无法完整展示") : "本轮暂时未返回"}</MessageBody></article>)}</div>
      <article className="sino-council-message" data-message-type="sino_round_summary"><strong>* Sino</strong><MessageBody>{trace ? roundSummaryText(trace.sino_round_summary) : "正在整理本轮共识、分歧与新增信息…"}</MessageBody></article>
    </details>; })}
    {run?.status === "running" ? <article className="sino-council-message" data-role="assistant" data-message-type="system_status"><strong>* Sino</strong><MessageBody>Sino 正在主持自动多轮讨论…</MessageBody></article> : ["completed", "completed_partial"].includes(run?.status) ? <>
      <article className="sino-council-message" data-message-type="stop_reason"><strong>* Sino</strong><MessageBody>{normalizeDisplayText(run?.deliberation?.stop_explanation) || "讨论已基本形成结论，本轮结束。"}</MessageBody></article>
      <article className="sino-council-message" data-role="assistant" data-message-type="sino_synthesis" data-source-count={run?.deliberation?.source_refs?.length || 0}><strong>* Sino · 最终综合</strong><MessageBody>{finalContent || "本轮自动讨论已完成。"}</MessageBody></article>
    </> : null}
  </div>;
}

function GoalBriefConfirmationCard({ brain, busy, onConfirm, onRevise, onReviseGoal }) {
  if (brain?.stage !== "goal_review") return null;
  onRevise = onRevise || onReviseGoal;
  const brief = brain.goal_brief || {};
  const understanding = brain.discovery?.working_understanding || {};
  const understood = [...(understanding.known_context || []), ...(understanding.inferred_context || [])];
  return <article className="sino-conversation-goal-brief" aria-label="Goal Brief 确认">
    <span>Goal Brief</span>
    <h2>我目前理解的是：</h2>
    <p>{brief.summary || understanding.interpreted_goal || brief.goal}</p>
    <dl><div><dt>已确认理解</dt><dd>{understood.join(" · ") || brief.goal}</dd></div><div><dt>仍待 Strategy Meeting 解决</dt><dd>{(understanding.non_blocking_unknowns || brief.unknowns || []).join(" · ") || "暂无"}</dd></div></dl>
    <footer><button type="button" className="is-primary" disabled={busy} onClick={onConfirm}>确认目标并开始讨论</button><button type="button" disabled={busy} onClick={onRevise}>修正理解</button><button type="button" disabled={busy} onClick={onConfirm}>目标已经够清楚，直接讨论</button></footer>
  </article>;
}

function ArchitectureProposalCard({ proposal, busy, onDecision }) {
  if (!proposal) return null;
  const [editingRevision, setEditingRevision] = useState(proposal.decision_status === "revision_requested");
  const [feedback, setFeedback] = useState("");
  const version = proposal.proposal_version || 1;
  const status = proposal.decision_status || (proposal.status === "ready_for_founder_decision" ? "pending" : proposal.status);
  const list = (items) => <ul>{(items || []).map((item) => <li key={item}>{item}</li>)}</ul>;
  async function requestRevision() {
    setEditingRevision(true);
    await onDecision?.({ action: "request_revision", proposalId: proposal.proposal_id, proposalVersion: version });
  }
  async function cancelRevision() {
    await onDecision?.({ action: "cancel_revision", proposalId: proposal.proposal_id, proposalVersion: version });
    setEditingRevision(false); setFeedback("");
  }
  return <article className="sino-conversation-goal-brief" aria-label="Architecture Proposal">
    <span>Architecture Proposal · v{version}</span><h3>Founder → Studio Capability Supply Boundary</h3>
    <dl><div><dt>Current Problem</dt><dd>{proposal.current_problem}</dd></div><div><dt>Proposed Boundary</dt><dd>{proposal.proposed_boundary}</dd></div><div><dt>Founder Responsibilities</dt><dd>{list(proposal.founder_responsibilities)}</dd></div><div><dt>Studio Responsibilities</dt><dd>{list(proposal.studio_responsibilities)}</dd></div><div><dt>Capability Lifecycle</dt><dd>{(proposal.capability_lifecycle || []).join(" → ")}</dd></div><div><dt>Binding Contract</dt><dd>{proposal.binding_contract?.reference} · {proposal.binding_contract?.consumer_rule}</dd></div><div><dt>Data / Asset Ownership</dt><dd>Capability: Founder · Studio Task/Asset: Studio · Evidence: shared lineage</dd></div><div><dt>Execution Authority</dt><dd>Founder validates/promotes; Studio executes Ready bindings; implementation before approval is forbidden.</dd></div><div><dt>Learning Feedback</dt><dd>{proposal.learning_feedback}</dd></div><div><dt>Migration Impact</dt><dd>{list(proposal.migration_impact)}</dd></div><div><dt>Risks</dt><dd>{list(proposal.risks)}</dd></div><div><dt>Recommended Decision</dt><dd>{proposal.recommended_decision}</dd></div></dl>
    {status === "approved" ? <p><strong>方案已批准</strong> · 等待进入实施阶段，本次决策不会自动 Dispatch Codex。</p>
      : status === "rejected" ? <p><strong>方案已驳回</strong> · Task 已关闭，Proposal 与 Decision history 保留。</p>
      : editingRevision || status === "revision_requested" ? <section aria-label="Architecture Proposal 修改意见"><label htmlFor={`architecture-feedback-${proposal.proposal_id}`}>请输入希望调整的架构边界、职责或约束。</label><textarea id={`architecture-feedback-${proposal.proposal_id}`} value={feedback} onChange={(event) => setFeedback(event.target.value)} disabled={busy} /><footer><button type="button" className="is-primary" disabled={busy || !feedback.trim()} onClick={() => onDecision?.({ action: "submit_revision", proposalId: proposal.proposal_id, proposalVersion: version, founderFeedback: feedback.trim() })}>提交修改意见</button><button type="button" disabled={busy} onClick={cancelRevision}>取消</button></footer></section>
      : <><p><strong>Founder Decision Required</strong> · 批准前不会进入实施。</p><footer><button type="button" className="is-primary" disabled={busy} onClick={() => onDecision?.({ action: "approve", proposalId: proposal.proposal_id, proposalVersion: version })}>批准方案</button><button type="button" disabled={busy} onClick={requestRevision}>修改方案</button><button type="button" disabled={busy} onClick={() => onDecision?.({ action: "reject", proposalId: proposal.proposal_id, proposalVersion: version })}>驳回方案</button></footer></>}
  </article>;
}

const FALLBACK_STAGES = [
  ["goal", "Goal Understanding"], ["strategy", "Strategy Meeting"], ["validation", "Validation"],
  ["decision", "Decision"], ["package", "Discussion Package"], ["asset_commit", "Asset Commit"],
].map(([stage_key, label], index) => ({ stage_id: stage_key, stage_key, label, status: index ? "locked" : "active", summary: "", message_refs: [] }));

function StageNavigator({ stages, activeStage, onSelect }) {
  return <nav className="sino-stage-navigator" aria-label="Sino Brain stages">{stages.map((stage, index) => <div key={stage.stage_id || stage.stage_key}>
    <button type="button" className={`${stage.status === "active" ? "is-current" : ""} ${activeStage === stage.stage_key ? "is-selected" : ""}`} disabled={stage.status === "locked"} onClick={() => onSelect(stage.stage_key)}><span>{stage.status === "completed" ? "✓" : index + 1}</span>{stage.label.replace(" Understanding", "").replace(" Meeting", "").replace("Discussion ", "")}</button>
    {index < stages.length - 1 ? <i aria-hidden="true">→</i> : null}
  </div>)}</nav>;
}

function StageSummary({ stage, brain, currentStage, onSelect }) {
  if (!stage) return null;
  if (stage.stage_key === "validation" && brain?.validations?.length) return <section className="sino-stage-structured"><h2>Validation</h2>{brain.validations.map((item) => <article key={item.validation_id}><strong>{item.result}</strong><p>{item.criteria?.join(" · ")}</p></article>)}</section>;
  if (stage.stage_key === "decision" && brain?.decision?.final_recommendation) return <section className="sino-stage-structured"><h2>Decision</h2><article><strong>{brain.decision.final_recommendation}</strong><p>Confidence {Math.round((brain.decision.confidence || 0) * 100)}%</p></article></section>;
  if (stage.stage_key === "package" && brain?.discussion_package?.package_id) return <section className="sino-stage-structured"><h2>Discussion Package</h2><article><strong>{brain.discussion_package.title}</strong><p>{brain.discussion_package.status === "archived" ? "已提交并归档" : brain.discussion_package.status === "approved" ? "已批准" : "等待 Founder 审批"}</p></article></section>;
  if (stage.status === "completed") return <section className="sino-stage-completion"><span>{stage.label} Completed</span><p>{stage.summary}</p>{stage.stage_key !== currentStage ? <button type="button" onClick={() => onSelect(currentStage)}>{stage.stage_key === "goal" && currentStage === "strategy" ? "进入 Strategy" : "返回当前阶段"}</button> : null}</section>;
  return null;
}

function ReuseSuggestions({ items, busy, onReuse, onDevelop }) {
  if (!items?.length) return null;
  return <section className="sino-reuse-suggestions" aria-label="可复用能力"><span>Capability Repository</span><h2>检测到已有相关能力</h2>{items.map((item) => <article key={item.asset_id}><div><strong>{item.name} · V{item.version}</strong><p>{item.reuse_reason}</p><small>{item.domain_id} · {statusLabel(item.status)}</small></div>{item.can_reuse ? <button type="button" disabled={busy} onClick={() => onReuse?.(item)}>引用</button> : <button type="button" disabled={busy} onClick={() => onDevelop?.({ action_id: "candidates_saved", asset_id: item.asset_id })}>开发</button>}</article>)}</section>;
}

export function ConversationThread({ snapshot, drafts = [], onOpenDraft, message, onMessage, onSend, busy, mode, onModeChange, healthy, contextControls, onExitObjectDiscussion, onConfirmGoal, onReviseGoal, onAdvanceStage, onReviewPackage, onReviewConstitution, onReviewProjectOutcome, onReviewImplementationPlan, onContinueProjectAnalysis, onReviewFounderGate, onImageProbeDecision, onArchitectureDecision, selectedConstitutionWorkItemId, onSelectConstitutionWorkItem, onContinueDiscussion, onViewAssets, onNewGoal, capabilityAction, capabilityAsset, capabilityError, onCapabilityAction, reuseSuggestions, onReuse, pendingAttachments = [], onAddImages, onRemoveImage }) {
  const logRef = useRef(null);
  const conversationRef = useRef(null);
  const scrollAfterSendRef = useRef(false);
  const latestProjectionRef = useRef("");
  const nearBottomRef = useRef(true);
  const [showReturnToLatest, setShowReturnToLatest] = useState(false);
  const conversationId = snapshot?.conversation?.id;
  const messageCount = snapshot?.messages?.length || 0;
  const latestProjection = JSON.stringify({
    conversationId,
    latestMessageId: snapshot?.messages?.at?.(-1)?.message_id || null,
    messageCount,
    currentAction: snapshot?.sino_brain?.current_action || null,
    maturity: snapshot?.sino_brain?.discovery?.discussion_maturity || null,
    draftRefs: drafts.filter((item) => item.source_conversation_id === conversationId).map((item) => `${item.draft_id}:${item.updated_at || item.version}`),
  });
  const quickFixRoute = snapshot?.sino_brain?.discovery?.task_complexity_route;
  const isQuickFix = quickFixRoute?.classification === "QUICK_FIX";
  const isStandardTask = quickFixRoute?.classification === "STANDARD_TASK" && Boolean(quickFixRoute?.standard_task_contract);
  const isStrategicTask = quickFixRoute?.classification === "STRATEGIC_TASK";
  const quickFixCompleted = isQuickFix && quickFixRoute?.execution_status === "completed";
  const stages = quickFixCompleted ? [
    { stage_key: "issue", label: "问题", status: "completed", message_refs: snapshot?.sino_brain?.source_message_refs || [] },
    { stage_key: "inspect", label: "定位", status: "completed", message_refs: [] },
    { stage_key: "fix", label: "修复", status: "completed", message_refs: [] },
    { stage_key: "verify", label: "验证", status: "completed", message_refs: [] },
    { stage_key: "complete", label: "完成", status: "active", message_refs: [] },
  ] : snapshot?.sino_brain?.stage_workspaces || FALLBACK_STAGES;
  const currentStage = quickFixCompleted ? "complete" : snapshot?.sino_brain?.active_workspace_stage || "goal";
  const [selection, setSelection] = useState({ conversationId, currentStage, stage: currentStage });
  const [longMessageExpansion, setLongMessageExpansion] = useState({});
  const activeStage = selection.conversationId === conversationId && selection.currentStage === currentStage ? selection.stage : currentStage;
  const selectStage = (stage) => setSelection({ conversationId, currentStage, stage });

  const scrollToLatest = () => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
    nearBottomRef.current = true;
    scrollAfterSendRef.current = false;
    setShowReturnToLatest(false);
  };

  useLayoutEffect(() => {
    const restored = Boolean(conversationId && conversationRef.current !== conversationId);
    const changed = latestProjectionRef.current !== latestProjection;
    if (restored || (changed && (nearBottomRef.current || scrollAfterSendRef.current))) scrollToLatest();
    else if (changed && conversationRef.current === conversationId) setShowReturnToLatest(true);
    conversationRef.current = conversationId;
    latestProjectionRef.current = latestProjection;
  }, [conversationId, latestProjection]);

  function trackReadingPosition() {
    const log = logRef.current;
    if (!log) return;
    const threshold = Math.max(96, log.clientHeight * 0.18);
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight <= threshold;
    nearBottomRef.current = nearBottom;
    if (nearBottom) setShowReturnToLatest(false);
    else if (scrollAfterSendRef.current) scrollAfterSendRef.current = false;
  }

  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return undefined;
    log.addEventListener("scroll", trackReadingPosition, { passive: true });
    return () => log.removeEventListener("scroll", trackReadingPosition);
  }, [conversationId]);

  function submit(event) {
    const log = logRef.current;
    const threshold = log ? Math.max(96, log.clientHeight * 0.18) : 96;
    scrollAfterSendRef.current = !log || log.scrollHeight - log.scrollTop - log.clientHeight <= threshold;
    nearBottomRef.current = scrollAfterSendRef.current;
    return onSend(event);
  }

  const latestRuns = new Map();
  for (const run of Array.isArray(snapshot?.council_runs) ? snapshot.council_runs : []) if (run && (run.status !== "failed" || !latestRuns.has(run.question))) latestRuns.set(run.question, run);
  const contextObject = snapshot?.founder_objects?.find((item) => item.is_context_object);
  const contextCandidate = snapshot?.context_candidate;
  const selectedStage = stages.find((item) => item.stage_key === activeStage) || stages[0];
  const selectedRefs = new Set(selectedStage?.message_refs || []);
  const hasStageProjection = Boolean(snapshot?.sino_brain?.stage_workspaces?.length);
  const visibleMessages = hasStageProjection ? (snapshot?.messages || []).filter((item) => selectedRefs.has(item.message_id)) : (snapshot?.messages || []);
  const latestLifecycleEvent = [...(snapshot?.messages || [])].reverse().find((item) => item.role === "assistant" && item.message_type === "capability_lifecycle");
  const constitutionUnderstanding = snapshot?.sino_brain?.constitution_understanding;
  const constitutionSourceRefs = new Set(snapshot?.sino_brain?.source_message_refs || []);
  const constitutionSourceMessage = constitutionUnderstanding ? visibleMessages.find((item) => item.role === "founder" && constitutionSourceRefs.has(item.message_id)) || visibleMessages.find((item) => item.role === "founder") : null;
  const constitutionDerivedContent = constitutionUnderstanding ? <ConstitutionUnderstandingCard understanding={constitutionUnderstanding} busy={busy} onReview={onReviewConstitution} selectedWorkItemId={selectedConstitutionWorkItemId} onSelectWorkItem={onSelectConstitutionWorkItem} /> : null;
  const maturity = projectMaturityProjection(snapshot?.sino_brain);
  const currentAction = projectCurrentAction(snapshot?.sino_brain, maturity);
  const isProjectPlanning = snapshot?.sino_brain?.stage === "project_planning";
  const cognitiveWorkRunning = ["pending", "running"].includes(snapshot?.sino_brain?.discovery?.cognitive_work_run?.run_status);
  const isOutcomeReview = isProjectPlanning && maturity.maturity_status === "ready_for_review";
  const reviewableProjectDraft = drafts?.some((item) => item.source_conversation_id === snapshot?.conversation?.id && item.status === "ready_for_review" && item.draft_type === "project_definition");
  const implementationPlan = snapshot?.sino_brain?.discovery?.implementation_planning;
  const isImplementationPlanning = snapshot?.sino_brain?.stage === "implementation_planning";
  const executionPackage = snapshot?.sino_brain?.discovery?.execution_package;
  const autonomousLoop = snapshot?.sino_brain?.discovery?.autonomous_main_loop;
  const isExecutionPackage = snapshot?.sino_brain?.stage === "execution_package";
  const workspaceAction = cognitiveWorkRunning ? currentAction : isProjectPlanning && maturity.maturity_status === "continue_analysis"
    ? { ...currentAction, title: "继续自主分析", description: maturity.reason || currentAction?.description, primary_label: "继续分析", secondary_label: null }
    : isProjectPlanning && maturity.maturity_status === "founder_input_required"
      ? { ...currentAction, title: "需要 Founder 判断", description: [maturity.blocking_question || currentAction?.description, maturity.why_founder_needed ? `为什么需要 Founder：${maturity.why_founder_needed}` : maturity.reason, maturity.sino_recommendation ? `Sino 建议：${maturity.sino_recommendation}` : null, maturity.recommendation_reason ? `建议理由：${maturity.recommendation_reason}` : null].filter(Boolean).join("\n\n"), primary_label: null, secondary_label: null }
      : currentAction;
  const imageProbeDecisionVisible = ["founder_gate_required", "founder_gate_rejected", "model_probe_authorized", "model_probe_queued"].includes(autonomousLoop?.status);
  const timelineAction = activeStage !== currentStage ? null : imageProbeDecisionVisible
    ? <ImageModelProbeDecisionCard loop={autonomousLoop} busy={busy} onDecision={onImageProbeDecision} />
    : isStrategicTask
    ? <ArchitectureProposalCard key={quickFixRoute?.architecture_proposal?.proposal_id} proposal={quickFixRoute?.architecture_proposal} busy={busy} onDecision={onArchitectureDecision} />
    : capabilityAction
    ? <CapabilityLifecycleCard asset={capabilityAsset} action={capabilityAction} candidates={snapshot?.sino_brain?.discussion_package?.asset_commit?.items || []} error={capabilityError} busy={busy} onAction={onCapabilityAction} onContinue={onContinueDiscussion} onOpenRepository={onViewAssets} />
    : isExecutionPackage
      ? <ExecutionPackageCard pkg={executionPackage} onReviewFounderGate={onReviewFounderGate} />
    : isImplementationPlanning
      ? <><ProjectMaturityCard maturity={maturity} busy={busy} onReview={onReviewProjectOutcome} reviewable={reviewableProjectDraft} /><ImplementationPlanCard plan={implementationPlan} busy={busy} onReview={onReviewImplementationPlan} /></>
    : isOutcomeReview
      ? <ProjectMaturityCard maturity={maturity} busy={busy} onReview={onReviewProjectOutcome} reviewable={reviewableProjectDraft} />
      : <FounderActionCard action={workspaceAction} busy={busy} onCapabilityAction={onCapabilityAction} onConfirmGoal={onConfirmGoal} onReviseGoal={onReviseGoal} onAdvanceStage={onAdvanceStage} onReviewPackage={onReviewPackage} onContinueProjectAnalysis={onContinueProjectAnalysis} onContinueDiscussion={onContinueDiscussion} onViewAssets={onViewAssets} onNewGoal={onNewGoal} />;
  return <section className="sino-conversation-thread" aria-label="Conversation">
    <header className="sino-conversation-header"><div><h1>{founderConversationTitle(snapshot?.conversation?.title, snapshot?.sino_brain?.goal_brief?.goal)}</h1><p>{selectedStage?.label || activeStage}</p></div><dl><div><dt>Status</dt><dd>{snapshot?.sino_brain?.current_action?.title || "讨论中"}</dd></div><div><dt>Confidence</dt><dd>{snapshot?.sino_brain?.decision?.confidence ? `${Math.round(snapshot.sino_brain.decision.confidence * 100)}%` : "—"}</dd></div></dl></header>
    {isQuickFix ? <section className="sino-quick-fix-route" aria-label="Quick Fix 流程"><strong>Quick Fix</strong><span>问题 → 定位 → 修复 → 验证 → 完成</span>{quickFixRoute?.clarification_required ? <small>需要确认目标位置；仍保持 Quick Fix，不进入 Strategy Meeting。</small> : quickFixRoute?.evidence?.image_context_status === "unavailable" ? <small>图片上下文当前不可用；已按明确文字继续 Quick Fix。</small> : null}</section> : isStandardTask ? <section className="sino-quick-fix-route" aria-label="Standard Task 流程"><strong>Standard Task</strong><span>Inspect → Plan → Execution → Verification → Learning → Closure</span></section> : isStrategicTask ? <section className="sino-quick-fix-route" aria-label="Architecture Task 流程"><strong>Architecture Task</strong><span>Analysis → Alternatives → Proposal → Impact → Founder Decision</span><small>批准前禁止创建实施包或 Dispatch Codex。</small></section> : <StageNavigator stages={stages} activeStage={activeStage} onSelect={selectStage} />}
    <div ref={logRef} className="sino-conversation-log" aria-label="讨论记录" data-stage-workspace={selectedStage?.label || activeStage} tabIndex={0}><div className="sino-conversation-reading-column"><ReuseSuggestions items={reuseSuggestions} busy={busy} onReuse={onReuse} onDevelop={onCapabilityAction} />{activeStage === "asset_commit" ? <AssetCommitWorkspace commit={snapshot?.sino_brain?.discussion_package?.asset_commit} onViewAssets={onViewAssets} onReturnDiscussion={() => selectStage("package")} onNewGoal={onNewGoal} /> : null}{contextObject ? <div className="sino-context-object-banner"><div><small>正在讨论</small><strong>{contextObject.name}</strong><span>{objectTypeLabel(contextObject.object_type, contextObject.type_label)} · V{contextObject.version} · {statusLabel(contextObject.status)}</span></div><button type="button" onClick={onExitObjectDiscussion} aria-label="退出对象讨论">× 退出对象讨论</button></div> : contextCandidate ? <div className="sino-context-object-banner"><div><small>正在讨论候选变更</small><strong>{contextCandidate.proposed_name || "目标对象待确认"}</strong><span>{contextCandidate.intent_type} · {statusLabel(contextCandidate.review_status)}</span></div></div> : null}{activeStage === "goal" && !snapshot?.sino_brain?.current_action && !snapshot?.sino_brain?.constitution_understanding ? <GoalBriefConfirmationCard brain={snapshot?.sino_brain} busy={busy} onConfirm={onConfirmGoal} onReviseGoal={onReviseGoal} /> : null}<StageSummary stage={selectedStage} brain={snapshot?.sino_brain} currentStage={currentStage} onSelect={selectStage} />{visibleMessages.length ? visibleMessages.map((item) => {
      if (item.role === "assistant" && ["council", "auto_deliberation"].includes(item.message_type)) return null;
      if (item.role === "assistant" && ["goal_brief", "decision", "discussion_package"].includes(item.message_type)) return null;
      if (item.role === "assistant" && item.message_type === "capability_lifecycle") return null;
      const run = (!hasStageProjection || activeStage === "strategy") && item.role === "founder" && ["council", "auto_deliberation"].includes(item.message_type) ? latestRuns.get(item.content) : null;
      const longform = String(item.content || "").length > 800 || String(item.content || "").includes("\n\n");
      const collapsible = longformSource(item.content, item.role);
      const processedSource = item.message_id === constitutionSourceMessage?.message_id && Boolean(constitutionDerivedContent);
      const expanded = longMessageExpansion[item.message_id] ?? !processedSource;
      const cognitiveOutcomeId = item.grounding?.cognitive_work?.cognitive_outcome_id;
      const draft = drafts.find((entry) => entry.source_message_refs?.at?.(-1) === item.message_id || (!entry.source_message_refs?.length && entry.source_cognitive_outcome_ref === cognitiveOutcomeId));
      return <div key={item.message_id} className="sino-message-group"><article data-role={item.role} className={longform ? "is-longform" : ""}><strong>{item.role === "founder" ? "Founder" : "* Sino"}</strong>{collapsible && !expanded ? <div className="sino-long-source-summary"><b>{longformTitle(item.content)}</b><span>长文本 · {processedSource ? "已进入后续处理" : "已收起"}</span><button type="button" onClick={() => setLongMessageExpansion((current) => ({ ...current, [item.message_id]: true }))}>展开原文</button></div> : <><MessageBody>{item.content}</MessageBody>{collapsible ? <button type="button" className="sino-long-source-toggle" onClick={() => setLongMessageExpansion((current) => ({ ...current, [item.message_id]: false }))}>收起原文</button> : null}</>}{item.attachment_refs?.length ? <div className="sino-message-images">{item.attachment_refs.map((attachment) => <a key={attachment.attachment_id} href={founderImageUrl(conversationId, attachment.attachment_id)} target="_blank" rel="noreferrer"><img src={founderImageUrl(conversationId, attachment.attachment_id)} alt={attachment.original_filename || "Founder 截图"} /></a>)}</div> : null}</article>{draft ? <aside className="sino-cognitive-draft-ref" aria-label="本轮成果"><span>本轮成果</span><strong>{draft.title}</strong><small>{draft.draft_type === "system_definition" ? "System Definition Draft" : draft.draft_type} · {draft.status === "refining" ? "完善中" : draft.status}</small><button type="button" onClick={() => onOpenDraft?.(draft)}>查看草案</button></aside> : null}{run ? (item.message_type === "auto_deliberation" ? <AutoDeliberationConversation run={run} /> : <CouncilConversation run={run} />) : null}{item.message_id === constitutionSourceMessage?.message_id ? constitutionDerivedContent : null}</div>;
    }) : null}{constitutionDerivedContent && !constitutionSourceMessage ? constitutionDerivedContent : null}{(!hasStageProjection || activeStage === "strategy") && !visibleMessages.some((item) => ["council", "auto_deliberation"].includes(item.message_type)) ? (snapshot?.council_runs || []).map((run) => run.discussion_mode === "auto_deliberation" ? <AutoDeliberationConversation key={run.council_run_id} run={run} /> : <CouncilConversation key={run.council_run_id} run={run} />) : null}{timelineAction}</div></div>
    {showReturnToLatest ? <div className="sino-return-latest"><button type="button" onClick={scrollToLatest}>↓ 最新</button></div> : null}
    {latestLifecycleEvent ? <section className="sino-capability-event" aria-label="能力状态更新"><span>Capability Update</span><p>{latestLifecycleEvent.content}</p></section> : null}
    <div className="sino-conversation-composer-dock">{mode === "auto" && currentStage !== "strategy" ? <p className="sino-auto-mode-gate">自动多轮只用于 Strategy Workspace。请先完成并确认 Goal Brief。</p> : null}<GlobalSecretaryComposer value={message} onChange={onMessage} onSubmit={submit} busy={busy} healthy={healthy} mode={mode} onModeChange={onModeChange} disabledModes={currentStage === "strategy" ? [] : ["auto"]} toolbar={contextControls} toolbarIncludesStatus attachments={pendingAttachments} onAddImages={onAddImages} onRemoveImage={onRemoveImage} /></div>
    <div className="sino-conversation-workspace-safe-area" aria-hidden="true" />
  </section>;
}
