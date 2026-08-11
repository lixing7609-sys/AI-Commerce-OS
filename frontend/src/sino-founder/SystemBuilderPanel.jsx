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
    <section className="sino-system-builder" id="system-builder" aria-label="AI 系统构建器面板">
      <header><div><span className="sino-kicker">AI 系统构建器</span><h2>创建 AI 应用系统</h2></div><span>仅生成蓝图 · 需要审批</span></header>
      <form onSubmit={submit}><input aria-label="AI 系统目标" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="例如：创建 Operator AI，负责电商运营…" /><button className="sino-button" disabled={busy || !goal.trim()}>{busy ? "规划中…" : "生成系统蓝图"}</button></form>
      {error && <p className="sino-error" role="alert">{error}</p>}
      <div className="sino-builder-flow">
        <article data-ready={Boolean(blueprint)}><small>01 · 系统蓝图</small><strong>{blueprint?.system_name || "创建 AI 系统"}</strong><p>{blueprint?.purpose || "定义目标、目标用户、连接器与记忆需求。"}</p></article>
        <article data-ready={Boolean(generated)}><small>02 · 能力</small><strong>{generated?.capabilities?.length || 0} 项能力</strong><p>{generated?.skills?.slice(0, 2).join(" · ") || "自动生成能力、技能与工作流。"}</p></article>
        <article data-ready={Boolean(plan?.agent_architecture)}><small>03 · 智能体</small><strong>{plan?.agent_architecture?.roles?.length || 0} 个智能体角色</strong><p>{generated?.agents?.join(" · ") || "设计角色、职责、技能与工具。"}</p></article>
        <article data-ready={Boolean(plan?.execution_package)}><small>04 · 执行计划</small><strong>{plan?.execution_package ? "等待 Founder 授权" : "尚未准备"}</strong><p>{plan?.execution_package?.commit_requirement || "生成 TaskAsset 草稿与不可执行的 Execution Package。"}</p></article>
      </div>
    </section>
  );
}
