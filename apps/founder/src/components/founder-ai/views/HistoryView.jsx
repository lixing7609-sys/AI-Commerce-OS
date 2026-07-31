import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";

const TYPES = ["全部", "功能论证", "模型会议", "技术情报", "系统异常", "审批决策", "执行任务", "文件分析"];

const NAV_BY_TYPE = { 功能论证: "functional-argumentation", 模型会议: "model-meeting", 技术情报: "tech-radar" };

export function HistoryView({ onNavigate }) {
  const { history, addDecisionMemory, addExecutionTask, toggleFavorite, isFavorite } = useFounderAI();
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
              {NAV_BY_TYPE[h.type] && (
                <button type="button" className="sf-icon-button" onClick={() => onNavigate(NAV_BY_TYPE[h.type])}>
                  继续讨论 / 重新论证
                </button>
              )}
              <button
                type="button"
                className="sf-icon-button"
                onClick={() =>
                  addExecutionTask({
                    name: h.title,
                    source: `历史记录（${h.type}）`,
                    executor: "Founder",
                    stage: "执行中",
                    progress: 0,
                    doneSummary: "刚从历史转成",
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
                onClick={() => addDecisionMemory({ content: `${h.title} —— ${h.summary}`, source: `历史记录（${h.type}）`, scope: "历史" })}
              >
                加入决策记忆
              </button>
              <button type="button" className="sf-icon-button" onClick={() => toggleFavorite({ id: h.id, type: h.type, title: h.title })}>
                {isFavorite(h.id) ? "取消收藏" : "收藏"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="founder-ai-empty">该分类下暂无历史记录</p>}
      </div>
    </div>
  );
}
