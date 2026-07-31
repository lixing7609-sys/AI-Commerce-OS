import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";

export function DecisionMemory() {
  const { decisionMemories, addDecisionMemory, invalidateDecisionMemory } = useFounderAI();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("全部");
  const [draft, setDraft] = useState("");

  const scopes = ["全部", ...new Set(decisionMemories.map((m) => m.scope))];

  const filtered = decisionMemories.filter((m) => {
    const matchesScope = scope === "全部" || m.scope === scope;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || m.content.toLowerCase().includes(q);
    return matchesScope && matchesSearch;
  });

  function createMemory(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    addDecisionMemory({ content: draft.trim(), source: "Founder 手动创建", scope: "Founder" });
    setDraft("");
  }

  return (
    <div className="founder-ai-view-shell">
      <div className="sf-card">
        <h3>创建新记忆</h3>
        <form className="sf-form-row" onSubmit={createMemory}>
          <input placeholder="记录一条长期决策…" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="sf-button-primary">保存</button>
        </form>
      </div>

      <div className="sf-form-row">
        <input placeholder="搜索决策记忆…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="studio-channel-chips">
        {scopes.map((s) => (
          <button
            key={s}
            type="button"
            className={`sf-icon-button${s === scope ? " is-active" : ""}`}
            style={s === scope ? { borderColor: "var(--ai-accent)", color: "var(--ai-accent)" } : undefined}
            onClick={() => setScope(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="founder-ai-stack" style={{ marginTop: 12 }}>
        {filtered.map((m) => (
          <div key={m.id} className="sf-card">
            <div className="founder-ai-row-header">
              <h3>{m.content}</h3>
              <span className={`sf-badge${m.isValid ? " success" : " danger"}`}>{m.isValid ? "有效" : "已失效"}</span>
            </div>
            <p className="founder-ai-meta">
              决策时间：{m.decidedAt} · 来源：{m.source} · 适用范围：{m.scope}
            </p>
            {m.isValid && (
              <div className="founder-ai-actions">
                <button type="button" className="sf-icon-button" onClick={() => invalidateDecisionMemory(m.id)}>
                  标记失效
                </button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="founder-ai-empty">没有匹配的决策记忆</p>}
      </div>
    </div>
  );
}
