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
  const boundaries = blueprint?.system_boundaries || [];
  const modules = blueprint?.core_modules || [];
  const relationships = blueprint?.system_relationships || [];
  const implementation = blueprint?.implementation_plan || [];
  return (
    <section className="sino-system-builder" id="system-builder" aria-label="AI 系统构建器面板">
      <header><div><span className="sino-kicker">系统构建器</span><h2>应用系统架构</h2></div><span>仅生成应用系统架构提案</span></header>
      <form onSubmit={submit}><input aria-label="应用系统目标" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="描述你希望创建或修改的应用系统……" /><button className="sino-button" disabled={busy || !goal.trim()}>{busy ? "规划中…" : "生成系统蓝图"}</button></form>
      {error && <p className="sino-error" role="alert">{error}</p>}
      <div className="sino-builder-flow">
        <article data-ready={Boolean(blueprint)}><small>01 · 系统目标</small><strong>{blueprint?.system_name || "应用系统目标"}</strong><p>{blueprint?.system_goal || "定义希望创建或修改的应用系统。"}</p></article>
        <article data-ready={Boolean(boundaries.length)}><small>02 · 系统边界</small><strong>{boundaries.length ? `${boundaries.length} 条边界` : "待生成"}</strong><p>{boundaries.slice(0, 2).join(" · ") || "明确系统范围、约束与非目标。"}</p></article>
        <article data-ready={Boolean(modules.length)}><small>03 · 核心模块</small><strong>{modules.length ? `${modules.length} 个模块` : "待生成"}</strong><p>{modules.join(" · ") || "定义应用系统的核心模块。"}</p></article>
        <article data-ready={Boolean(relationships.length)}><small>04 · 系统关系</small><strong>{relationships.length ? `${relationships.length} 条关系` : "待生成"}</strong><p>{relationships.slice(0, 2).join(" · ") || "定义模块与数据之间的关系。"}</p></article>
        <article data-ready={Boolean(implementation.length)}><small>05 · 实施计划</small><strong>{implementation.length ? "等待 Founder 确认蓝图" : "待生成"}</strong><p>{implementation.slice(0, 2).join(" · ") || "确认蓝图后再生成任务与实施计划。"}</p></article>
      </div>
    </section>
  );
}
