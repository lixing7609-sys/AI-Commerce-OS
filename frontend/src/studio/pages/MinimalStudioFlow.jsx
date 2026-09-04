import { useEffect, useState } from "react";
import { createStudioConversation, getStudioConversation, listStudioConversations, submitStudioTask } from "../studioAiApi.js";

const statusLabel = (status) => ({ capability_missing: "Capability Missing", model_missing: "Model Missing", ready_for_execution: "Ready for Execution" }[status] || "Waiting for Input");

export function MinimalStudioFlow() {
  const [conversations, setConversations] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [input, setInput] = useState("生成一张商品主图");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const task = snapshot?.task;

  useEffect(() => { listStudioConversations().then(({ conversations: items }) => { setConversations(items); if (items[0]) getStudioConversation(items[0].conversation_id).then(setSnapshot); }).catch(() => setConversations([])); }, []);

  async function run(event) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const conversation = snapshot?.conversation || await createStudioConversation(input);
      const result = await submitStudioTask(conversation.conversation_id, input);
      setSnapshot(result);
      const { conversations: items } = await listStudioConversations(); setConversations(items);
    } catch (reason) { setError(String(reason.message || reason)); }
    finally { setBusy(false); }
  }

  async function select(id) { setSnapshot(await getStudioConversation(id)); }

  return <section className="st-minimal-flow" aria-label="Studio 最小生成流程">
    <aside className="st-minimal-flow__left"><span>Project</span><strong>Studio Local Project</strong><small>LOCAL · Content Production</small><h3>Conversations</h3>{conversations.map((item) => <button type="button" key={item.conversation_id} className={snapshot?.conversation?.conversation_id === item.conversation_id ? "is-active" : ""} onClick={() => select(item.conversation_id)}>{item.title}</button>)}</aside>
    <main className="st-minimal-flow__main"><header><span>Minimal Runnable Flow</span><h2>商品主图生成</h2><p>Input → Understanding → Capability → Model → Execution → Result → Asset</p></header><form onSubmit={run}><label htmlFor="studio-task-input">Studio Input</label><textarea id="studio-task-input" value={input} onChange={(event) => setInput(event.target.value)} /><button className="st-btn st-btn--primary" disabled={busy || !input.trim()}>{busy ? "检查中…" : "开始"}</button></form>{error ? <p role="alert">{error}</p> : null}<section className="st-minimal-result" aria-label="Studio Result"><h3>Result</h3>{snapshot?.messages?.map((item) => <article key={item.message_id} data-role={item.role}><strong>{item.role === "founder" ? "User" : "Studio"}</strong><p>{item.content}</p></article>)}{!snapshot?.messages?.length ? <p>输入任务后，Studio 会执行真实 Lookup；不会使用演示结果。</p> : null}</section></main>
    <aside className="st-minimal-flow__right"><h3>Task</h3><dl><div><dt>Type</dt><dd>{task?.task_type || "Image Generation"}</dd></div><div><dt>Status</dt><dd>{statusLabel(task?.status)}</dd></div><div><dt>Capability</dt><dd>{task?.capability_lookup?.capability?.name || "Missing"}</dd></div><div><dt>Model</dt><dd>{task?.model_lookup?.model?.model_id || "Missing / Unverified"}</dd></div><div><dt>Execution</dt><dd>{task?.execution_status || "not_started"}</dd></div><div><dt>Asset</dt><dd>{task?.asset ? "Created" : "None"}</dd></div></dl><h3>Next State</h3><p>{task?.next_action || "等待 Studio Input"}</p></aside>
  </section>;
}
