import { useCallback, useEffect, useState } from "react";
import { approveFounderExecution, buildSystemBlueprint, confirmCandidateGoal, createFounderConversation, createFounderExecution, decideExecutionDelta, discussWithSino, getConversationWorkspace, getFounderBriefing, getFounderExecution, getFounderStrategy, reasonConfirmedGoal, resumeFounderExecution, submitExecutionDelta } from "../services/founderAiApi.js";
import { createTaskAsset } from "../services/taskAssetApi.js";
import { AnalysisCard } from "./AnalysisCard.jsx";
import { ApprovalPanel } from "./ApprovalPanel.jsx";
import { ArtifactPanel } from "./ArtifactPanel.jsx";
import { AssetMemoryCenter } from "./AssetMemoryCenter.jsx";
import { CapabilityMapPanel } from "./CapabilityMapPanel.jsx";
import { CapabilityNavigation } from "./CapabilityNavigation.jsx";
import { DiscussionWorkspace } from "./DiscussionWorkspace.jsx";
import { EvidenceCard } from "./EvidenceCard.jsx";
import { ExecutionCard } from "./ExecutionCard.jsx";
import { ExecutionDeltaPanel } from "./ExecutionDeltaPanel.jsx";
import { ExecutionTimeline } from "./ExecutionTimeline.jsx";
import { MemoryPanel } from "./MemoryPanel.jsx";
import { NextStrategicActionsPanel } from "./NextStrategicActionsPanel.jsx";
import { RoadmapPanel } from "./RoadmapPanel.jsx";
import { SecretarySidebar } from "./SecretarySidebar.jsx";
import { SecretarySummary } from "./SecretarySummary.jsx";
import { SolutionCard } from "./SolutionCard.jsx";
import { StrategicOverviewCard } from "./StrategicOverviewCard.jsx";
import { SystemBuilderPanel } from "./SystemBuilderPanel.jsx";
import { TaskPlanCard } from "./TaskPlanCard.jsx";

const CONVERSATION_KEY = "sino-founder-active-conversation";
const EXECUTION_KEY = "sino-founder-active-execution";
const stored = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const remember = (key, value) => { try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch { /* unavailable */ } };

export function ConversationWorkspace() {
  const [conversationId, setConversationId] = useState(() => stored(CONVERSATION_KEY));
  const [snapshot, setSnapshot] = useState(null);
  const [message, setMessage] = useState("");
  const [goal, setGoal] = useState(null);
  const [result, setResult] = useState(null);
  const [executionId, setExecutionId] = useState(() => stored(EXECUTION_KEY));
  const [execution, setExecution] = useState(null);
  const [approved, setApproved] = useState(false);
  const [briefing, setBriefing] = useState(null);
  const [strategy, setStrategy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const restoreWorkspace = useCallback(async (id) => {
    if (!id) return;
    const restored = await getConversationWorkspace(id);
    setSnapshot(restored);
    const restoredGoal = restored.goals?.find((item) => ["goal_confirmed", "planning"].includes(item.status)) || restored.goals?.[0];
    if (restoredGoal) setGoal(restoredGoal);
    if (restored.active_execution) {
      setExecution(restored.active_execution); setExecutionId(restored.active_execution.id); setApproved(Boolean(restored.active_execution.execution_allowed)); remember(EXECUTION_KEY, restored.active_execution.id);
    }
  }, []);

  useEffect(() => {
    if (!conversationId) return undefined;
    let active = true;
    getConversationWorkspace(conversationId).then((restored) => {
      if (!active) return;
      setSnapshot(restored);
      const restoredGoal = restored.goals?.find((item) => ["goal_confirmed", "planning"].includes(item.status)) || restored.goals?.[0];
      if (restoredGoal) setGoal(restoredGoal);
      if (restored.active_execution) { setExecution(restored.active_execution); setExecutionId(restored.active_execution.id); setApproved(Boolean(restored.active_execution.execution_allowed)); remember(EXECUTION_KEY, restored.active_execution.id); }
    }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [conversationId]);
  useEffect(() => { Promise.all([getFounderBriefing(), getFounderStrategy()]).then(([nextBriefing, nextStrategy]) => { setBriefing(nextBriefing); setStrategy(nextStrategy); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!executionId || execution) return;
    getFounderExecution(executionId).then((item) => { setExecution(item); setApproved(Boolean(item.execution_allowed)); }).catch(() => { remember(EXECUTION_KEY, null); setExecutionId(null); });
  }, [executionId, execution]);
  useEffect(() => {
    if (!executionId || !["queued", "executing", "testing"].includes(execution?.status)) return undefined;
    const timer = window.setInterval(() => getFounderExecution(executionId).then(setExecution).catch((requestError) => setError(requestError.message)), 1000);
    return () => window.clearInterval(timer);
  }, [executionId, execution?.status]);

  const mode = execution?.status === "paused" ? "paused" : ["queued", "executing", "testing"].includes(execution?.status) ? "running" : "discussion";

  async function send(event) {
    event.preventDefault();
    const content = message.trim(); if (!content || busy) return;
    setBusy(true); setError("");
    try {
      let id = conversationId;
      if (!id) { const conversation = await createFounderConversation(content.slice(0, 120)); id = conversation.id; setConversationId(id); remember(CONVERSATION_KEY, id); }
      if (mode !== "discussion" && execution && goal) {
        const delta = await submitExecutionDelta(execution.id, { conversation_id: id, goal_id: goal.goal_id, task_id: execution.task_asset_id, content });
        const nextExecution = await getFounderExecution(execution.id);
        setExecution({ ...nextExecution, deltas: [...(nextExecution.deltas || []), ...(nextExecution.deltas?.some((item) => item.delta_id === delta.delta_id) ? [] : [delta])] });
        await restoreWorkspace(id);
      } else {
        const nextSnapshot = await discussWithSino(id, content);
        setSnapshot(nextSnapshot);
        const explicitGoal = nextSnapshot.goals?.find((item) => item.status === "goal_confirmed");
        if (explicitGoal) await prepareGoal(explicitGoal);
      }
      setMessage("");
    } catch (requestError) { setError(requestError.message || "Sino 讨论失败"); }
    finally { setBusy(false); }
  }

  async function prepareGoal(formalGoal) {
    setGoal(formalGoal);
    const reasoning = await reasonConfirmedGoal(formalGoal.goal_id);
    const draft = reasoning.task_asset_draft;
    const task = await createTaskAsset({ title: draft.title, description: draft.description, scope: { ...draft.scope, goal_id: formalGoal.goal_id }, conversation_id: formalGoal.conversation_id || conversationId });
    const nextExecution = await createFounderExecution(task.id, reasoning.execution_package, formalGoal.goal_id);
    setResult(reasoning); setExecution(nextExecution); setExecutionId(nextExecution.id); setApproved(false); remember(EXECUTION_KEY, nextExecution.id);
  }

  async function confirm(candidate) {
    if (busy) return; setBusy(true); setError("");
    try {
      const formalGoal = await confirmCandidateGoal(conversationId, candidate.goal_id);
      await prepareGoal(formalGoal); await restoreWorkspace(conversationId);
    } catch (requestError) { setError(requestError.message || "目标确认失败"); }
    finally { setBusy(false); }
  }

  async function approve() { if (!executionId || busy) return; setBusy(true); try { const item = await approveFounderExecution(executionId); setExecution(item); setApproved(true); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  async function resume() { if (!executionId || busy) return; setBusy(true); try { setExecution(await resumeFounderExecution(executionId)); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  async function decideDelta(delta, action) { setBusy(true); try { await decideExecutionDelta(execution.id, delta.delta_id, action); setExecution(await getFounderExecution(execution.id)); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  async function prepareSystem(systemGoal) { const id = conversationId || (await createFounderConversation(systemGoal.slice(0, 120))).id; if (!conversationId) { setConversationId(id); remember(CONVERSATION_KEY, id); } await discussWithSino(id, `讨论系统蓝图：${systemGoal}`); return buildSystemBlueprint(systemGoal, id); }

  return <><SecretarySidebar digest={snapshot?.digest} /><main className="sino-workspace" tabIndex={0} aria-label="Founder AI 工作区内容"><header className="sino-topbar"><div><span className="sino-topbar__mark">S</span><span>创始人指挥中心</span></div><CapabilityNavigation /><div><span className="sino-online">Sino 在线</span></div></header><DiscussionWorkspace snapshot={snapshot} message={message} onMessage={setMessage} onSend={send} busy={busy} mode={mode} />{error && <p className="sino-error" role="alert">{error}</p>}<SecretarySummary digest={snapshot?.digest} onContinue={(candidate) => setMessage(candidate.description)} onConfirm={confirm} /><section className="sino-section" id="strategy"><header className="sino-section__header"><div><span className="sino-kicker">战略与方向</span><h2>战略与路线</h2></div></header><div className="sino-strategy-grid"><StrategicOverviewCard strategy={strategy} /><RoadmapPanel roadmap={strategy?.roadmap} /><CapabilityMapPanel capabilityStatus={strategy?.capability_status} /><NextStrategicActionsPanel actions={briefing?.recommendations || strategy?.recommendations} /></div></section><section className="sino-section" id="system-builder"><SystemBuilderPanel onPrepare={prepareSystem} /></section><section className="sino-section sino-reasoning" id="goal-reasoning"><header className="sino-section__header"><div><span className="sino-kicker">正式目标</span><h2>目标推理</h2></div><p>{goal ? goal.title : "确认候选目标后，Sino 才会生成推理与任务计划。"}</p></header>{result ? <section className="sino-reasoning-grid"><AnalysisCard analysis={result.analysis} /><EvidenceCard evidence={result.evidence} /><SolutionCard solution={result.solution} /><TaskPlanCard draft={result.task_asset_draft} plan={result.task_plan} /><ExecutionCard requirement={result.execution_requirement} executionPackage={result.execution_package} risk={result.risk} /></section> : <p className="sino-empty-reasoning">普通讨论不会自动生成 Task Plan。</p>}</section><section className="sino-section" id="execution"><header className="sino-section__header"><div><span className="sino-kicker">执行控制</span><h2>执行中心</h2></div><p>执行过程中仍可通过主输入框补充要求。</p></header><ExecutionTimeline status={execution?.status} timeline={execution?.timeline} events={execution?.events} failureReason={execution?.failure_reason} pauseReason={execution?.pause_reason} recoverable={execution?.recoverable} lastEvent={execution?.last_event} onResume={resume} /><ExecutionDeltaPanel deltas={execution?.deltas || snapshot?.execution_deltas} onDecision={decideDelta} /><div className="sino-detail-grid"><ApprovalPanel ready={Boolean(executionId)} approved={approved} busy={busy} status={execution?.status} onApprove={approve} /><ArtifactPanel execution={execution} /><MemoryPanel result={execution || result} /></div></section><AssetMemoryCenter refreshKey={execution?.status === "completed" ? execution.completed_at || execution.id : "history"} /></main></>;
}
