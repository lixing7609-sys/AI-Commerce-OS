import { useMemo, useState } from "react";
import { useApiState } from "@sinofut/ui";
import { api, contentLifecycleLabel } from "@sinofut/domain";

export function Library() {
  const { state, refresh } = useApiState();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("全部");
  const [tagDraft, setTagDraft] = useState({});

  const contentTypes = useMemo(() => {
    if (!state) return ["全部"];
    const types = new Set(state.content.map((c) => c.contentType || "短视频"));
    return ["全部", ...types];
  }, [state]);

  if (!state) return <p>加载中…</p>;

  const filtered = state.content.filter((c) => {
    const matchesType = typeFilter === "全部" || (c.contentType || "短视频") === typeFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.title.toLowerCase().includes(q) ||
      (c.tags || []).some((t) => t.toLowerCase().includes(q));
    return matchesType && matchesSearch;
  });

  const archive = async (id) => {
    await api.updateContent(id, { stage: "archived" });
    refresh();
  };

  const addReference = async (id) => {
    await api.incrementReference(id);
    refresh();
  };

  const addTag = async (id) => {
    const draft = (tagDraft[id] || "").trim();
    if (!draft) return;
    const content = state.content.find((c) => c.id === id);
    const nextTags = [...(content.tags || []), draft];
    await api.updateContent(id, { tags: nextTags });
    setTagDraft((prev) => ({ ...prev, [id]: "" }));
    refresh();
  };

  return (
    <div>
      <div className="sf-page-header">
        <h1>内容资产库</h1>
        <p>所有已生产的图文/图片/视频/脚本/分镜/音频统一在此搜索、分类、打标签、归档——审批只是其中一个状态。</p>
      </div>

      <div className="sf-form-row">
        <input placeholder="搜索标题或标签…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          {contentTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="sf-grid sf-grid-2">
        {filtered.map((c) => (
          <div key={c.id} className="sf-card">
            <h3>{c.title}</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              类型：{c.contentType || "短视频"} · 状态：
              <span className="studio-lifecycle-pill">{contentLifecycleLabel(c.stage)}</span> · 引用 {c.referenceCount || 0} 次
            </p>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              创建于 {new Date(c.createdAt).toLocaleString("zh-CN")}
            </p>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "8px 0" }}>
              {(c.tags || []).map((tag) => (
                <span key={tag} className="sf-badge">
                  {tag}
                </span>
              ))}
            </div>
            <div className="sf-form-row" style={{ marginBottom: 8 }}>
              <input
                placeholder="添加标签…"
                value={tagDraft[c.id] || ""}
                onChange={(e) => setTagDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
              />
              <button type="button" className="sf-icon-button" onClick={() => addTag(c.id)}>
                添加
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="sf-icon-button" onClick={() => addReference(c.id)}>
                引用 +1
              </button>
              {c.stage !== "archived" && (
                <button type="button" className="sf-icon-button" onClick={() => archive(c.id)}>
                  归档
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>没有匹配的内容</p>}
      </div>
    </div>
  );
}
