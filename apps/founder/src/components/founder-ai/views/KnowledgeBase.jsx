import { useMemo, useState } from "react";
import { useFounderAI } from "../useFounderAI.js";

export function KnowledgeBase() {
  const { knowledgeItems, markKnowledgeCore } = useFounderAI();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [selected, setSelected] = useState([]);

  const categories = ["全部", ...new Set(knowledgeItems.map((k) => k.category))];

  const recentlyReferenced = useMemo(
    () => [...knowledgeItems].sort((a, b) => (a.lastReferencedAt < b.lastReferencedAt ? 1 : -1)).slice(0, 3),
    [knowledgeItems]
  );

  const filtered = knowledgeItems.filter((k) => {
    const matchesCategory = category === "全部" || k.category === category;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || k.title.toLowerCase().includes(q) || k.summary.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  function toggleSelect(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  return (
    <div className="founder-ai-view-shell">
      <div className="sf-form-row">
        <input placeholder="搜索知识库…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="studio-channel-chips">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={`sf-icon-button${c === category ? " is-active" : ""}`}
            style={c === category ? { borderColor: "var(--ai-accent)", color: "var(--ai-accent)" } : undefined}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <h2 className="founder-ai-section-title">最近引用</h2>
      <div className="founder-ai-stack">
        {recentlyReferenced.map((k) => (
          <p key={k.id} className="founder-ai-meta">
            {k.title} · {k.lastReferencedAt}
          </p>
        ))}
      </div>

      <h2 className="founder-ai-section-title">全部知识</h2>
      <div className="founder-ai-stack">
        {filtered.map((k) => (
          <div key={k.id} className="sf-card">
            <div className="founder-ai-row-header">
              <h3>{k.title}</h3>
              <span className={`sf-badge${k.isCore ? " success" : ""}`}>{k.isCore ? "核心知识" : k.category}</span>
            </div>
            <p className="founder-ai-meta">{k.category} · 最近引用于 {k.lastReferencedAt}</p>
            <p>{k.summary}</p>
            <div className="founder-ai-actions">
              <button type="button" className="sf-icon-button" onClick={() => toggleSelect(k.id)}>
                {selected.includes(k.id) ? "已选择引用" : "选择本次对话引用"}
              </button>
              <button type="button" className="sf-icon-button" onClick={() => markKnowledgeCore(k.id)}>
                {k.isCore ? "取消核心标记" : "标记为核心知识"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="founder-ai-empty">没有匹配的知识条目</p>}
      </div>
    </div>
  );
}
