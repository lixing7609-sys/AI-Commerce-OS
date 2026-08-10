import { useState } from "react";

export function SystemBuilderPanel({ onPrepare }) {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const nextGoal = goal.trim();
    if (!nextGoal || busy) return;
    setBusy(true); setError("");
    try { const nextPlan = await onPrepare(nextGoal); setPlan(nextPlan); setGoal(""); }
    catch (requestError) { setError(requestError.message || "System Blueprint 生成失败"); }
    finally { setBusy(false); }
  }

  const blueprint = plan?.system_blueprint;
  const generated = plan?.generated_capabilities;
  return (
    <section className="sino-system-builder" id="system-builder" aria-label="System Builder Panel">
      <header><div><span className="sino-kicker">AI System Builder</span><h2>Create AI Application System</h2></div><span>Blueprint only · Approval required</span></header>
      <form onSubmit={submit}><input aria-label="AI System Goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="例如：创建 Operator AI，负责电商运营…" /><button className="sino-button" disabled={busy || !goal.trim()}>{busy ? "规划中…" : "生成 Blueprint"}</button></form>
      {error && <p className="sino-error" role="alert">{error}</p>}
      <div className="sino-builder-flow">
        <article data-ready={Boolean(blueprint)}><small>01 · Blueprint</small><strong>{blueprint?.system_name || "Create AI System"}</strong><p>{blueprint?.purpose || "定义 purpose、target user、connectors 与 memory。"}</p></article>
        <article data-ready={Boolean(generated)}><small>02 · Capabilities</small><strong>{generated?.capabilities?.length || 0} capabilities</strong><p>{generated?.skills?.slice(0, 2).join(" · ") || "自动生成 Capabilities、Skills 与 Workflows。"}</p></article>
        <article data-ready={Boolean(plan?.agent_architecture)}><small>03 · Agents</small><strong>{plan?.agent_architecture?.roles?.length || 0} agent roles</strong><p>{generated?.agents?.join(" · ") || "设计 roles、responsibilities、skills 与 tools。"}</p></article>
        <article data-ready={Boolean(plan?.execution_package)}><small>04 · Execution Plan</small><strong>{plan?.execution_package ? "等待 Founder 授权" : "Not prepared"}</strong><p>{plan?.execution_package?.commit_requirement || "生成 TaskAsset Draft 与不可执行的 Execution Package。"}</p></article>
      </div>
    </section>
  );
}
