import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";

const CATEGORIES = [
  "大模型更新",
  "开源模型",
  "Agent Framework",
  "MCP / Tool",
  "Computer Use",
  "图像 / 视频 / 语音",
  "电商平台 AI 能力",
  "基础设施与成本",
];

export function TechRadar({ onNavigate }) {
  const { techOpportunities, addExecutionTask, toggleFavorite, isFavorite } = useFounderAI();
  const [category, setCategory] = useState("全部");

  const filtered =
    category === "全部" ? techOpportunities : techOpportunities.filter((t) => t.category === category);

  function createTestTask(item) {
    addExecutionTask({
      name: `测试任务：${item.title}`,
      source: "技术雷达",
      executor: "Founder",
      stage: "执行中",
      progress: 0,
      doneSummary: "刚创建",
      blockers: "无",
      nextStep: "安排技术预研",
      needsReauthorization: false,
    });
  }

  return (
    <div className="founder-ai-view-shell">
      <div className="studio-channel-chips">
        <button
          type="button"
          className={`sf-icon-button${category === "全部" ? " is-active" : ""}`}
          onClick={() => setCategory("全部")}
        >
          全部
        </button>
        {CATEGORIES.map((c) => (
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

      <div className="founder-ai-stack" style={{ marginTop: 12 }}>
        {filtered.map((item) => (
          <div key={item.id} className="sf-card">
            <div className="founder-ai-row-header">
              <h3>{item.title}</h3>
              <span
                className={`sf-badge ${
                  item.suggestion === "立即测试" ? "success" : item.suggestion === "暂不采用" ? "danger" : "warn"
                }`}
              >
                {item.suggestion}
              </span>
            </div>
            <p className="founder-ai-meta">
              {item.category} · 来源：{item.source} · 发布时间：{item.publishedAt}
            </p>
            <p>{item.summary}</p>
            <p className="founder-ai-meta">
              与 AI Commerce OS 的关系：{item.relation} · 可替代能力：{item.replaceableCapability}
            </p>
            <p className="founder-ai-meta">
              预计成本：{item.estimatedCost} · 风险：{item.risk}
            </p>
            <div className="founder-ai-actions">
              <button type="button" className="sf-icon-button" onClick={() => onNavigate("functional-argumentation")}>
                发起功能论证
              </button>
              <button type="button" className="sf-icon-button" onClick={() => onNavigate("model-meeting")}>
                加入模型会议
              </button>
              <button type="button" className="sf-icon-button" onClick={() => createTestTask(item)}>
                创建测试任务
              </button>
              <button
                type="button"
                className="sf-icon-button"
                onClick={() => toggleFavorite({ id: item.id, type: "技术情报", title: item.title })}
              >
                {isFavorite(item.id) ? "取消收藏" : "收藏"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="founder-ai-empty">该分类暂无技术情报</p>}
      </div>
    </div>
  );
}
