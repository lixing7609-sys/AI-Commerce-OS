import { useLayoutEffect, useRef, useState } from "react";
import { GlobalSecretaryComposer } from "./GlobalSecretaryComposer.jsx";
import { FounderActionCard } from "./FounderActionCard.jsx";
import { CapabilityLifecycleCard } from "./CapabilityLifecycleCard.jsx";
import { AssetCommitWorkspace } from "./AssetCommitWorkspace.jsx";
import { founderConversationTitle } from "./founderConversationTitle.js";
import { objectTypeLabel, statusLabel } from "./founderTerminology.js";

const PROJECT_SOURCE_KEYS = new Set(["project_summary", "current_position", "living_prompt", "confirmed_decisions", "knowledge", "constraints", "terminology", "pending_questions", "goals"]);

function GroundingDetails({ grounding }) {
  const sources = Array.isArray(grounding?.sources) ? grounding.sources : [];
  if (!sources.length) return null;
  const hasProjectContext = sources.some((item) => PROJECT_SOURCE_KEYS.has(item.key) && (item.available || item.used));
  const visibleSources = sources.filter((item) => hasProjectContext || !PROJECT_SOURCE_KEYS.has(item.key));
  const used = visibleSources.filter((item) => item.used);
  const summary = used.map((item) => `${item.label}${item.version ? ` ${item.version}` : ""}`).join(" · ");
  const participatingModels = Array.isArray(grounding?.participating_models) ? grounding.participating_models : [];
  return <details className="sino-answer-grounding">
    <summary><span>本次依据</span>{summary ? `：${summary}` : ""}</summary>
    <dl>{visibleSources.map((item) => <div key={item.key}>
      <dt>{item.label}</dt>
      <dd>{item.used ? (item.version || (typeof item.count === "number" && item.count > 0 ? `${item.count} 条` : "已引用")) : "未引用"}</dd>
      {item.references?.length ? <ul>{item.references.map((reference, index) => <li key={`${reference.source_id || reference.title || item.key}-${index}`}>{reference.title || reference.source_id}</li>)}</ul> : null}
    </div>)}</dl>{participatingModels.length ? <p className="sino-grounding-models">参与模型：{participatingModels.map((item) => item.label || item.provider).join(" · ")}</p> : null}
  </details>;
}

const MODEL_NAMES = { claude: "Claude", gpt: "GPT", deepseek: "DeepSeek" };
const HUMAN_FIELDS = ["text", "content", "message", "title", "summary", "description", "reason", "recommendation", "value"];

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
  if (!ordered.length && run?.status === "running") return <article className={messageClass} data-role="assistant" data-message-type="system_status"><strong>* Sino</strong><p>正在组织多模型讨论…</p></article>;
  return <div className="sino-council-conversation">
    {ordered.map((item, index) => { const text = proposalText(item.proposal); const modelName = normalizeDisplayText(item.model_display_name) || MODEL_NAMES[item.provider] || normalizeDisplayText(item.model) || "模型"; const providerName = normalizeDisplayText(item.provider_display_name); return <article className={messageClass} key={`${run.council_run_id}-${identityKey(item) || index}`} data-role="assistant" data-message-type="model_proposal"><strong>* {modelName}{providerName ? ` · ${providerName}` : ""}</strong>{item.status === "completed" ? <p>{text || "返回内容暂时无法完整展示"}</p> : item.status === "running" ? <p>思考中…</p> : <p>暂时不可用</p>}</article>; })}
    {run.status === "running" ? <article className={messageClass} data-role="assistant" data-message-type="system_status"><strong>* Sino</strong><p>{ordered.some((item) => item.status === "completed") ? "正在提炼共识与分歧…" : "正在组织多模型讨论…"}</p></article> : synthesisLines.length ? <article className={messageClass} data-role="assistant" data-message-type="sino_synthesis"><strong>* Sino</strong><p>{synthesisLines.join("\n")}</p></article> : null}
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
      <div className="sino-deliberation-round__messages">{items.map((item, index) => <article className="sino-council-message" key={item.model_run_id || `${roundNumber}-${index}`} data-message-type="model_proposal"><strong>* {identity(item)}</strong><p>{item.status === "completed" ? (proposalText(item.proposal) || "返回内容暂时无法完整展示") : "本轮暂时未返回"}</p></article>)}</div>
      <article className="sino-council-message" data-message-type="sino_round_summary"><strong>* Sino</strong><p>{trace ? roundSummaryText(trace.sino_round_summary) : "正在整理本轮共识、分歧与新增信息…"}</p></article>
    </details>; })}
    {run?.status === "running" ? <article className="sino-council-message" data-role="assistant" data-message-type="system_status"><strong>* Sino</strong><p>Sino 正在主持自动多轮讨论…</p></article> : ["completed", "completed_partial"].includes(run?.status) ? <>
      <article className="sino-council-message" data-message-type="stop_reason"><strong>* Sino</strong><p>{normalizeDisplayText(run?.deliberation?.stop_explanation) || "讨论已基本形成结论，本轮结束。"}</p></article>
      <article className="sino-council-message" data-role="assistant" data-message-type="sino_synthesis" data-source-count={run?.deliberation?.source_refs?.length || 0}><strong>* Sino · 最终综合</strong><p>{finalContent || "本轮自动讨论已完成。"}</p></article>
    </> : null}
  </div>;
}

function GoalBriefConfirmationCard({ brain, busy, onConfirm, onRevise }) {
  if (brain?.stage !== "goal_review") return null;
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

export function ConversationThread({ snapshot, message, onMessage, onSend, busy, mode, onModeChange, healthy, contextControls, onExitObjectDiscussion, onConfirmGoal, onReviseGoal, onAdvanceStage, onReviewPackage, onContinueDiscussion, onViewAssets, onNewGoal, capabilityAction, capabilityAsset, capabilityError, onCapabilityAction, reuseSuggestions, onReuse }) {
  const logRef = useRef(null);
  const conversationRef = useRef(null);
  const scrollAfterSendRef = useRef(false);
  const conversationId = snapshot?.conversation?.id;
  const messageCount = snapshot?.messages?.length || 0;
  const stages = snapshot?.sino_brain?.stage_workspaces || FALLBACK_STAGES;
  const currentStage = snapshot?.sino_brain?.active_workspace_stage || "goal";
  const [selection, setSelection] = useState({ conversationId, currentStage, stage: currentStage });
  const activeStage = selection.conversationId === conversationId && selection.currentStage === currentStage ? selection.stage : currentStage;
  const selectStage = (stage) => setSelection({ conversationId, currentStage, stage });

  useLayoutEffect(() => {
    const restored = conversationId && conversationRef.current !== conversationId;
    if (logRef.current && (restored || scrollAfterSendRef.current)) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
      scrollAfterSendRef.current = false;
    }
    conversationRef.current = conversationId;
  }, [conversationId, messageCount]);

  useLayoutEffect(() => { if (logRef.current) logRef.current.scrollTop = 0; }, [activeStage]);

  function submit(event) {
    const log = logRef.current;
    scrollAfterSendRef.current = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
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
  return <section className="sino-conversation-thread" aria-label="Conversation">
    <header className="sino-conversation-header"><div><h1>{founderConversationTitle(snapshot?.conversation?.title, snapshot?.sino_brain?.goal_brief?.goal)}</h1><p>{selectedStage?.label || activeStage}</p></div><dl><div><dt>Status</dt><dd>{snapshot?.sino_brain?.current_action?.title || "讨论中"}</dd></div><div><dt>Confidence</dt><dd>{snapshot?.sino_brain?.decision?.confidence ? `${Math.round(snapshot.sino_brain.decision.confidence * 100)}%` : "—"}</dd></div></dl></header>
    <StageNavigator stages={stages} activeStage={activeStage} onSelect={selectStage} />
    <div ref={logRef} className="sino-conversation-log" aria-label="讨论记录" data-stage-workspace={selectedStage?.label || activeStage} tabIndex={0}><div className="sino-conversation-reading-column">{activeStage === currentStage && capabilityAction ? <CapabilityLifecycleCard asset={capabilityAsset} action={capabilityAction} candidates={snapshot?.sino_brain?.discussion_package?.asset_commit?.items || []} error={capabilityError} busy={busy} onAction={onCapabilityAction} onContinue={onContinueDiscussion} onOpenRepository={onViewAssets} /> : activeStage === currentStage ? <FounderActionCard action={snapshot?.sino_brain?.current_action} busy={busy} onCapabilityAction={onCapabilityAction} onConfirmGoal={onConfirmGoal} onReviseGoal={onReviseGoal} onAdvanceStage={onAdvanceStage} onReviewPackage={onReviewPackage} onContinueDiscussion={onContinueDiscussion} onViewAssets={onViewAssets} onNewGoal={onNewGoal} /> : null}<ReuseSuggestions items={reuseSuggestions} busy={busy} onReuse={onReuse} onDevelop={onCapabilityAction} />{activeStage === "asset_commit" ? <AssetCommitWorkspace commit={snapshot?.sino_brain?.discussion_package?.asset_commit} onViewAssets={onViewAssets} onReturnDiscussion={() => selectStage("package")} onNewGoal={onNewGoal} /> : null}{contextObject ? <div className="sino-context-object-banner"><div><small>正在讨论</small><strong>{contextObject.name}</strong><span>{objectTypeLabel(contextObject.object_type, contextObject.type_label)} · V{contextObject.version} · {statusLabel(contextObject.status)}</span></div><button type="button" onClick={onExitObjectDiscussion} aria-label="退出对象讨论">× 退出对象讨论</button></div> : contextCandidate ? <div className="sino-context-object-banner"><div><small>正在讨论候选变更</small><strong>{contextCandidate.proposed_name || "目标对象待确认"}</strong><span>{contextCandidate.intent_type} · {statusLabel(contextCandidate.review_status)}</span></div></div> : null}{activeStage === "goal" && !snapshot?.sino_brain?.current_action ? <GoalBriefConfirmationCard brain={snapshot?.sino_brain} busy={busy} onConfirm={onConfirmGoal} onRevise={onReviseGoal} /> : null}<StageSummary stage={selectedStage} brain={snapshot?.sino_brain} currentStage={currentStage} onSelect={selectStage} />{visibleMessages.length ? visibleMessages.map((item) => {
      if (item.role === "assistant" && ["council", "auto_deliberation"].includes(item.message_type)) return null;
      if (item.role === "assistant" && ["goal_brief", "decision", "discussion_package"].includes(item.message_type)) return null;
      if (item.role === "assistant" && item.message_type === "capability_lifecycle") return null;
      const run = (!hasStageProjection || activeStage === "strategy") && item.role === "founder" && ["council", "auto_deliberation"].includes(item.message_type) ? latestRuns.get(item.content) : null;
      return <div key={item.message_id} className="sino-message-group"><article data-role={item.role}><strong>{item.role === "founder" ? "Founder" : "* Sino"}</strong><p>{item.content}</p>{item.role === "assistant" ? <GroundingDetails grounding={item.grounding} /> : null}</article>{run ? (item.message_type === "auto_deliberation" ? <AutoDeliberationConversation run={run} /> : <CouncilConversation run={run} />) : null}</div>;
    }) : null}{(!hasStageProjection || activeStage === "strategy") && !visibleMessages.some((item) => ["council", "auto_deliberation"].includes(item.message_type)) ? (snapshot?.council_runs || []).map((run) => run.discussion_mode === "auto_deliberation" ? <AutoDeliberationConversation key={run.council_run_id} run={run} /> : <CouncilConversation key={run.council_run_id} run={run} />) : null}</div></div>
    {latestLifecycleEvent ? <section className="sino-capability-event" aria-label="能力状态更新"><span>Capability Update</span><p>{latestLifecycleEvent.content}</p></section> : null}
    <div className="sino-conversation-composer-dock">{mode === "auto" && currentStage !== "strategy" ? <p className="sino-auto-mode-gate">自动多轮只用于 Strategy Workspace。请先完成并确认 Goal Brief。</p> : null}<GlobalSecretaryComposer value={message} onChange={onMessage} onSubmit={submit} busy={busy} healthy={healthy} mode={mode} onModeChange={onModeChange} disabledModes={currentStage === "strategy" ? [] : ["auto"]} toolbar={contextControls} toolbarIncludesStatus /></div>
    <div className="sino-conversation-workspace-safe-area" aria-hidden="true" />
  </section>;
}
