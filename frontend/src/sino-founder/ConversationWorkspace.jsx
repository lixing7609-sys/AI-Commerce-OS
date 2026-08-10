import { useState } from "react";
import { analyzeFounderConversation, approveFounderExecution, createFounderConversation, createFounderExecution, executeFounderExecution } from "../services/founderAiApi.js";
import { ApprovalPanel } from "./ApprovalPanel.jsx";
import { ArtifactPanel } from "./ArtifactPanel.jsx";
import { ExecutionPackageCard } from "./ExecutionPackageCard.jsx";
import { ExecutionTimeline } from "./ExecutionTimeline.jsx";
import { GoalAnalysisCard } from "./GoalAnalysisCard.jsx";
import { MemoryPanel } from "./MemoryPanel.jsx";
import { TaskDraftCard } from "./TaskDraftCard.jsx";

export function ConversationWorkspace() {
  const [conversationId, setConversationId] = useState(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [executionId, setExecutionId] = useState(null);
  const [approved, setApproved] = useState(false);
  const [execution, setExecution] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyze(event) {
    event.preventDefault();
    const goal = message.trim();
    if (!goal || busy) return;
    setBusy(true); setError("");
    try {
      const conversation = conversationId ? { id: conversationId } : await createFounderConversation(goal.slice(0, 200));
      setConversationId(conversation.id);
      const nextResult = await analyzeFounderConversation(conversation.id, goal);
      const nextExecution = await createFounderExecution(nextResult.task_asset_draft.title, nextResult.execution_package);
      setResult(nextResult); setExecutionId(nextExecution.id); setApproved(false); setExecution(null); setMessage("");
    } catch (requestError) { setError(requestError.message || "Sino 分析失败"); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!executionId || busy) return;
    setBusy(true); setError("");
    try { const response = await approveFounderExecution(executionId); setApproved(Boolean(response.execution_allowed)); }
    catch (requestError) { setError(requestError.message || "授权失败"); }
    finally { setBusy(false); }
  }

  async function execute() {
    if (!executionId || !approved || busy) return;
    setBusy(true); setError("");
    try { setExecution(await executeFounderExecution(executionId)); }
    catch (requestError) { setError(requestError.message || "执行失败"); }
    finally { setBusy(false); }
  }

  const stage = execution ? 5 : busy && approved ? 4 : approved ? 3 : result ? 2 : message ? 0 : 0;
  return (
    <main className="sino-workspace" id="conversation">
      <header className="sino-hero"><div><span className="sino-kicker">Development Orchestrator</span><h1>把目标变成可控的执行</h1><p>Sino 理解目标、组织上下文、生成任务与执行包。每一步都清晰，每次执行都需要授权。</p></div><span className="sino-online">在线</span></header>
      <form className="sino-composer" onSubmit={analyze}><label htmlFor="sino-goal">告诉 Sino 你想完成什么</label><div><textarea id="sino-goal" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="例如：重构 Founder 应用，并保留现有后端能力…" rows="3" /><button className="sino-button" disabled={busy || !message.trim()}>{busy && !approved ? "分析中…" : "分析目标"}</button></div></form>
      {error && <p className="sino-error" role="alert">{error}</p>}
      <section className="sino-card-grid" id="tasks"><GoalAnalysisCard analysis={result?.goal_classification} /><TaskDraftCard draft={result?.task_asset_draft} /><ExecutionPackageCard executionPackage={result?.execution_package} /></section>
      <ExecutionTimeline stage={stage} />
      <section className="sino-detail-grid"><ApprovalPanel ready={Boolean(executionId)} approved={approved} busy={busy} onApprove={approve} onExecute={execute} /><ArtifactPanel execution={execution} /><MemoryPanel result={result} /></section>
    </main>
  );
}
