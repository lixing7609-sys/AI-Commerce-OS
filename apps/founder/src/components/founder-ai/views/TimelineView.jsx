import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";

const TYPES = ["全部", "功能论证", "模型讨论", "技术情报", "系统异常", "审批决策", "执行任务", "复盘", "知识沉淀"];

export function TimelineView({ onStartConversation }) {
  const { history, addExecutionTask, addKnowledgeEntry, toggleFavorite, isFavorite } = useFounderAI();
  const [type, setType] = useState("全部");

  const filtered = type === "全部" ? history : history.filter((h) => h.type === type);

  return (
    <div className="founder-ai-view-shell">
      <div className="studio-channel-chips">
        {TYPES.map((t) => (
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
        {filtered.map((h) => (
          <div key={h.id} className="sf-card">
            <div className="founder-ai-row-header">
              <h3>{h.title}</h3>
              <span className="sf-badge">{h.type}</span>
            </div>
            <p className="founder-ai-meta">{h.date}</p>
            <p>{h.summary}</p>
            <div className="founder-ai-actions">
              <button type="button" className="sf-icon-button" onClick={() => onStartConversation(`继续讨论：${h.title}`)}>
                继续讨论
              </button>
              <button
                type="button"
                className="sf-icon-button"
                onClick={() =>
                  addExecutionTask({
                    name: h.title,
                    source: `时间线（${h.type}）`,
                    executor: "Founder",
                    stage: "执行中",
                    progress: 0,
                    doneSummary: "刚从时间线转成",
                    blockers: "无",
                    nextStep: "拆解具体任务",
                    needsReauthorization: false,
                  })
                }
              >
                转成任务
              </button>
              <button
                type="button"
                className="sf-icon-button"
                onClick={() =>
                  addKnowledgeEntry({
                    id: `kb-${Date.now()}`,
                    category: "时间线沉淀",
                    title: h.title,
                    summary: h.summary,
                    isCore: false,
                  })
                }
              >
                加入知识
              </button>
              <button type="button" className="sf-icon-button" onClick={() => toggleFavorite({ id: h.id, type: h.type, title: h.title })}>
                {isFavorite(h.id) ? "取消收藏" : "收藏"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="founder-ai-empty">该分类下暂无记录</p>}
      </div>
    </div>
  );
}
