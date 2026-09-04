import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";

const ACTION_RESULT = {
  reference: "已引用到当前论证草稿（演示状态）。",
  compare: "与历史版本相比，本次修改集中在 Founder AI 首页结构，无冲突。",
  summarize: "摘要：本文件记录了本轮改动的范围、动机与验证结果。",
  conflict: "未发现与其他文件的冲突。",
};

export function FileCenter() {
  const { files, addExecutionTask } = useFounderAI();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("全部");
  const [expandedId, setExpandedId] = useState(null);
  const [resultById, setResultById] = useState({});

  const types = ["全部", ...new Set(files.map((f) => f.type))];

  const filtered = files.filter((f) => {
    const matchesType = type === "全部" || f.type === type;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || f.name.toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  function runAction(file, action) {
    if (action === "dev-task") {
      addExecutionTask({
        name: `处理文件：${file.name}`,
        source: "文件中心",
        executor: "Founder",
        stage: "执行中",
        progress: 0,
        doneSummary: "刚创建",
        blockers: "无",
        nextStep: "拆解文件对应的开发任务",
        needsReauthorization: false,
      });
      setResultById((prev) => ({ ...prev, [file.id]: "已转成开发任务，可在「执行跟踪」查看。" }));
      return;
    }
    setResultById((prev) => ({ ...prev, [file.id]: ACTION_RESULT[action] }));
  }

  return (
    <div className="founder-ai-view-shell">
      <div className="sf-form-row">
        <input placeholder="搜索文件…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="studio-channel-chips">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            className={`sf-icon-button${t === type ? " is-active" : ""}`}
            style={t === type ? { borderColor: "var(--ai-accent)", color: "var(--ai-accent)" } : undefined}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="founder-ai-stack" style={{ marginTop: 12 }}>
        {filtered.map((f) => (
          <div key={f.id} className="sf-card">
            <div className="founder-ai-row-header" onClick={() => setExpandedId(expandedId === f.id ? null : f.id)} style={{ cursor: "pointer" }}>
              <h3>{f.name}</h3>
              <span className="sf-badge">{f.type}</span>
            </div>
            <p className="founder-ai-meta">
              上传于 {f.uploadedAt} · 标签：{f.tags.join("、")}
            </p>
            {expandedId === f.id && (
              <div className="founder-ai-actions">
                <button type="button" className="sf-icon-button" onClick={() => runAction(f, "reference")}>
                  引用到当前论证
                </button>
                <button type="button" className="sf-icon-button" onClick={() => runAction(f, "compare")}>
                  与历史版本比较
                </button>
                <button type="button" className="sf-icon-button" onClick={() => runAction(f, "summarize")}>
                  生成摘要
                </button>
                <button type="button" className="sf-icon-button" onClick={() => runAction(f, "conflict")}>
                  查找冲突
                </button>
                <button type="button" className="sf-button-primary" onClick={() => runAction(f, "dev-task")}>
                  转成开发任务
                </button>
              </div>
            )}
            {resultById[f.id] && <p className="founder-ai-ai-suggestion">{resultById[f.id]}</p>}
          </div>
        ))}
        {filtered.length === 0 && <p className="founder-ai-empty">没有匹配的文件</p>}
      </div>
    </div>
  );
}
