import { useCallback, useEffect, useState } from "react";
import { analyzeWithSinoBrain, approveFounderExecution, buildSystemBlueprint, createFounderConversation, createFounderExecution, getFounderBriefing, getFounderExecution, getFounderStrategy, resumeFounderExecution } from "../services/founderAiApi.js";
import { createTaskAsset } from "../services/taskAssetApi.js";
import { ApprovalPanel } from "./ApprovalPanel.jsx";
import { ArtifactPanel } from "./ArtifactPanel.jsx";
import { AnalysisCard } from "./AnalysisCard.jsx";
import { EvidenceCard } from "./EvidenceCard.jsx";
import { ExecutionCard } from "./ExecutionCard.jsx";
import { ExecutionTimeline } from "./ExecutionTimeline.jsx";
import { MemoryPanel } from "./MemoryPanel.jsx";
import { SolutionCard } from "./SolutionCard.jsx";
import { TaskPlanCard } from "./TaskPlanCard.jsx";
import { SinoDailyBriefingCard } from "./SinoDailyBriefingCard.jsx";
import { ProjectStatePanel } from "./ProjectStatePanel.jsx";
import { RecommendedActionsPanel } from "./RecommendedActionsPanel.jsx";
import { StrategicOverviewCard } from "./StrategicOverviewCard.jsx";
import { RoadmapPanel } from "./RoadmapPanel.jsx";
import { CapabilityMapPanel } from "./CapabilityMapPanel.jsx";
import { NextStrategicActionsPanel } from "./NextStrategicActionsPanel.jsx";
import { SystemBuilderPanel } from "./SystemBuilderPanel.jsx";

const EXECUTION_STORAGE_KEY = "sino-founder-active-execution";

function storedExecutionId() {
  try { return window.localStorage.getItem(EXECUTION_STORAGE_KEY); }
  catch { return null; }
}

function rememberExecutionId(executionId) {
  try {
    if (executionId) window.localStorage.setItem(EXECUTION_STORAGE_KEY, executionId);
    else window.localStorage.removeItem(EXECUTION_STORAGE_KEY);
  } catch { /* Storage can be unavailable in privacy-restricted contexts. */ }
}

export function ConversationWorkspace() {
  const [conversationId, setConversationId] = useState(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [executionId, setExecutionId] = useState(storedExecutionId);
  const [approved, setApproved] = useState(false);
  const [execution, setExecution] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState("");
  const [strategy, setStrategy] = useState(null);

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true); setBriefingError("");
    try { const [nextBriefing, nextStrategy] = await Promise.all([getFounderBriefing(), getFounderStrategy()]); setBriefing(nextBriefing); setStrategy(nextStrategy); }
    catch (requestError) { setBriefingError(requestError.message || "项目简报加载失败"); }
    finally { setBriefingLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getFounderBriefing(), getFounderStrategy()])
      .then(([nextBriefing, nextStrategy]) => { if (active) { setBriefing(nextBriefing); setStrategy(nextStrategy); } })
      .catch((requestError) => { if (active) setBriefingError(requestError.message || "项目简报加载失败"); })
      .finally(() => { if (active) setBriefingLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!executionId || execution) return undefined;
    let active = true;
    getFounderExecution(executionId)
      .then((restored) => {
        if (!active) return;
        setExecution(restored);
        setApproved(Boolean(restored.execution_allowed));
      })
      .catch((requestError) => {
        if (!active) return;
        if (String(requestError.message).includes("404")) {
          rememberExecutionId(null);
          setExecutionId(null);
        } else setError(requestError.message || "执行会话恢复失败");
      });
    return () => { active = false; };
  }, [executionId, execution]);

  useEffect(() => {
    if (!executionId || !["queued", "executing", "testing"].includes(execution?.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const nextExecution = await getFounderExecution(executionId);
        setExecution(nextExecution);
        if (["completed", "failed"].includes(nextExecution.status)) loadBriefing();
      } catch (requestError) { setError(requestError.message || "执行状态更新失败"); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [executionId, execution?.status, loadBriefing]);

  async function analyze(event) {
    event.preventDefault();
    const goal = message.trim();
    if (!goal || busy) return;
    setBusy(true); setError("");
    try {
      const conversation = conversationId ? { id: conversationId } : await createFounderConversation(goal.slice(0, 200));
      setConversationId(conversation.id);
      const nextResult = await analyzeWithSinoBrain(conversation.id, goal);
      const draft = nextResult.task_asset_draft;
      const taskAsset = await createTaskAsset({
        title: draft.title,
        description: draft.description,
        scope: draft.scope,
        conversation_id: conversation.id,
      });
      const nextExecution = await createFounderExecution(taskAsset.id, nextResult.execution_package);
      rememberExecutionId(nextExecution.id);
      setResult(nextResult); setExecutionId(nextExecution.id); setApproved(false); setExecution(nextExecution); setMessage("");
      loadBriefing();
    } catch (requestError) { setError(requestError.message || "Sino 分析失败"); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!executionId || busy) return;
    setBusy(true); setError("");
    try { const response = await approveFounderExecution(executionId); setApproved(Boolean(response.execution_allowed)); setExecution(response); }
    catch (requestError) { setError(requestError.message || "授权失败"); }
    finally { setBusy(false); }
  }

  async function resume() {
    if (!executionId || busy) return;
    setBusy(true); setError("");
    try { setExecution(await resumeFounderExecution(executionId)); }
    catch (requestError) { setError(requestError.message || "恢复执行失败"); }
    finally { setBusy(false); }
  }

  async function prepareSystem(systemGoal) {
    const conversation = conversationId ? { id: conversationId } : await createFounderConversation(systemGoal.slice(0, 200));
    setConversationId(conversation.id);
    const plan = await buildSystemBlueprint(systemGoal, conversation.id);
    const draft = plan.task_asset_draft;
    const taskAsset = await createTaskAsset({ title: draft.title, description: draft.description, scope: draft.scope, conversation_id: conversation.id });
    const nextExecution = await createFounderExecution(taskAsset.id, plan.execution_package);
    rememberExecutionId(nextExecution.id);
    setExecutionId(nextExecution.id); setApproved(false); setExecution(nextExecution);
    loadBriefing();
    return plan;
  }

  const activeTasks = briefing?.project_state?.active_tasks?.length || 0;
  const blockedItems = briefing?.project_state?.blocked_items?.length || 0;
  const progress = briefing?.progress?.percent || 0;
  const executionStatus = execution?.status || "standby";
  const quickGoals = ["梳理当前最高优先级任务", "评估下一阶段的能力缺口", "把这个想法拆成可执行计划"];

  return (
    <main className="sino-workspace" tabIndex={0} aria-label="Founder AI workspace content">
      <header className="sino-topbar"><div><span className="sino-topbar__mark">S</span><span>Founder Command Center</span></div><div><span className="sino-online">Sino 在线</span><span className="sino-topbar__date">AI Commerce OS</span></div></header>

      <section className="sino-overview" id="overview">
        <div className="sino-hero"><div><span className="sino-kicker">Founder intelligence · Daily focus</span><h1>早上好，Founder。<br /><em>今天推进什么？</em></h1><p>Sino 已汇总项目状态、长期记忆与路线图。先看全局，再把一个关键目标变成可审批、可追踪的执行计划。</p></div><div className="sino-hero__signal"><span>当前战略阶段</span><strong>{strategy?.current_phase || "读取中"}</strong><small>{strategy?.recommended_next_phase ? `下一阶段 · ${strategy.recommended_next_phase}` : "正在校准下一阶段"}</small></div></div>
        <div className="sino-metric-grid" aria-label="项目关键指标"><article><span>总体进度</span><strong>{progress}<small>%</small></strong><i><b style={{ width: `${progress}%` }} /></i></article><article><span>活动任务</span><strong>{activeTasks}</strong><small>正在执行队列中</small></article><article data-tone={blockedItems ? "warning" : "clear"}><span>阻塞事项</span><strong>{blockedItems}</strong><small>{blockedItems ? "需要 Founder 关注" : "当前推进顺畅"}</small></article><article><span>执行状态</span><strong className="sino-metric-grid__status">{executionStatus}</strong><small>{approved ? "已获 Founder 授权" : "审批边界生效中"}</small></article></div>
        <div className="sino-briefing-grid"><SinoDailyBriefingCard briefing={briefing} loading={briefingLoading} error={briefingError} /><ProjectStatePanel state={briefing?.project_state} /><RecommendedActionsPanel actions={briefing?.recommendations} /></div>
      </section>

      <section className="sino-section" id="strategy"><header className="sino-section__header"><div><span className="sino-kicker">Strategy & direction</span><h2>战略与路线</h2></div><p>让每个局部动作都服务于长期方向。</p></header><div className="sino-strategy-grid"><StrategicOverviewCard strategy={strategy} /><RoadmapPanel roadmap={strategy?.roadmap} /><CapabilityMapPanel capabilityStatus={strategy?.capability_status} /><NextStrategicActionsPanel actions={strategy?.recommendations} /></div></section>
      <section className="sino-section"><SystemBuilderPanel onPrepare={prepareSystem} /></section>

      <section className="sino-section sino-reasoning" id="conversation"><header className="sino-section__header"><div><span className="sino-kicker">Think with Sino</span><h2>从目标到执行方案</h2></div><p>输入意图，Sino 会先给证据与计划，不会直接执行。</p></header>
        <form className="sino-composer" onSubmit={analyze}><label htmlFor="sino-goal"><span>你现在最想推进什么？</span><small>⌘ + Enter 快速提交</small></label><div><textarea id="sino-goal" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit(); }} placeholder="描述目标、约束或一个需要判断的问题…" rows="3" /><button className="sino-button" disabled={busy || !message.trim()}>{busy && !approved ? "分析中…" : "开始推理 →"}</button></div><div className="sino-quick-goals" aria-label="快捷目标">{quickGoals.map((goal) => <button type="button" key={goal} onClick={() => setMessage(goal)}>{goal}</button>)}</div></form>
        {error && <p className="sino-error" role="alert">{error}</p>}
        <section className="sino-reasoning-grid" id="tasks"><AnalysisCard analysis={result?.analysis} /><EvidenceCard evidence={result?.evidence} /><SolutionCard solution={result?.solution} /><TaskPlanCard draft={result?.task_asset_draft} plan={result?.task_plan} /><ExecutionCard requirement={result?.execution_requirement} executionPackage={result?.execution_package} risk={result?.risk} /></section>
      </section>

      <section className="sino-section" id="execution"><header className="sino-section__header"><div><span className="sino-kicker">Execution control</span><h2>执行中心</h2></div><p>授权、运行、测试和结果都保持可见。</p></header><ExecutionTimeline status={execution?.status} timeline={execution?.timeline} events={execution?.events} error={execution?.result?.error || execution?.error_message} failureReason={execution?.failure_reason} pauseReason={execution?.pause_reason} recoverable={execution?.recoverable} lastEvent={execution?.last_event} onResume={resume} /><div className="sino-detail-grid" id="knowledge"><ApprovalPanel ready={Boolean(executionId)} approved={approved} busy={busy} status={execution?.status} onApprove={approve} /><ArtifactPanel execution={execution} /><MemoryPanel result={execution || result} /></div></section>
    </main>
  );
}
