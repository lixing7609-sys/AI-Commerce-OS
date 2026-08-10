import { useState } from "react";

import { analyzeFounderConversation, createFounderConversation } from "../../../services/founderAiApi";

export function FounderSinoPanel() {
  const [conversationId, setConversationId] = useState(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const goal = message.trim();
    if (!goal || loading) return;
    setLoading(true);
    setError(null);
    try {
      const conversation = conversationId
        ? { id: conversationId }
        : await createFounderConversation(goal.slice(0, 200));
      setConversationId(conversation.id);
      const next = await analyzeFounderConversation(conversation.id, goal);
      setResult(next);
      setMessage("");
    } catch (requestError) {
      setError(requestError.message || "Founder AI 分析失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="founder-sino-panel" aria-label="Sino Founder AI 协调器">
      <header className="founder-sino-panel__header">
        <div>
          <h2>Sino Founder AI</h2>
          <p>把 Founder 目标整理为可审核的任务草稿与执行包</p>
        </div>
        <span className="founder-sino-panel__badge">协调模式</span>
      </header>
      <form className="founder-sino-panel__form" onSubmit={handleSubmit}>
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="输入你的开发、迁移、研究或决策目标…"
          aria-label="Founder 目标"
        />
        <button type="submit" disabled={loading || !message.trim()}>{loading ? "分析中…" : "分析目标"}</button>
      </form>
      {error && <p className="founder-sino-panel__error" role="alert">{error}</p>}
      {result && (
        <div className="founder-sino-panel__result">
          <article><h3>目标分类</h3><p>{result.goal_classification.goal_type}</p></article>
          <article><h3>TaskAsset Draft</h3><p>{result.task_asset_draft.title}</p><small>{result.task_asset_draft.description}</small></article>
          <article><h3>Execution Package</h3><p>{result.execution_package.commit_requirement}</p><small>等待 Founder 授权 · 不会自动执行</small></article>
        </div>
      )}
    </section>
  );
}
