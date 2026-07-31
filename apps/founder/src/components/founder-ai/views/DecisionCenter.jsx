import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";

const ACTIONS = [
  { key: "approve", label: "同意" },
  { key: "reject", label: "驳回" },
  { key: "more-argument", label: "要求补充论证" },
  { key: "model-meeting", label: "交给模型会议" },
];

export function DecisionCenter({ onNavigate }) {
  const { pendingDecisions, majorAnomalies, techOpportunities, executionTasks, resolvePendingDecision, addHistory } =
    useFounderAI();
  const [input, setInput] = useState("");

  const pendingArgumentCount = techOpportunities.filter((t) => t.suggestion === "立即测试").length;

  function handleAction(id, action) {
    resolvePendingDecision(id, action);
    if (action === "model-meeting") onNavigate("model-meeting");
    if (action === "more-argument") onNavigate("functional-argumentation");
  }

  function submitCommand(e) {
    e.preventDefault();
    if (!input.trim()) return;
    addHistory({ type: "审批决策", title: input, summary: "已记录 Founder 指令（演示状态）" });
    setInput("");
  }

  return (
    <div className="founder-ai-decision-center">
      <div className="founder-ai-view-scroll">
        <div className="founder-ai-overview-cards">
          <div className="sf-card founder-ai-overview-card">
            <span className="founder-ai-overview-value">{pendingDecisions.length}</span>
            <span className="founder-ai-overview-label">待审批</span>
          </div>
          <div className="sf-card founder-ai-overview-card">
            <span className="founder-ai-overview-value">{majorAnomalies.length}</span>
            <span className="founder-ai-overview-label">重大异常</span>
          </div>
          <div className="sf-card founder-ai-overview-card">
            <span className="founder-ai-overview-value">{techOpportunities.length}</span>
            <span className="founder-ai-overview-label">新技术</span>
          </div>
          <div className="sf-card founder-ai-overview-card">
            <span className="founder-ai-overview-value">{pendingArgumentCount}</span>
            <span className="founder-ai-overview-label">待论证</span>
          </div>
        </div>

        <h2 className="founder-ai-section-title">今日需要决策</h2>
        <div className="founder-ai-stack">
          {pendingDecisions.map((d) => (
            <div key={d.id} className="sf-card">
              <div className="founder-ai-row-header">
                <h3>{d.title}</h3>
                <span className={`sf-badge ${d.riskLevel === "高" ? "danger" : d.riskLevel === "中" ? "warn" : "success"}`}>
                  风险：{d.riskLevel}
                </span>
              </div>
              <p className="founder-ai-meta">来源系统：{d.source} · 影响范围：{d.impact}</p>
              <p className="founder-ai-ai-suggestion">AI 建议：{d.aiSuggestion}</p>
              <div className="founder-ai-actions">
                {ACTIONS.map((a) => (
                  <button key={a.key} type="button" className="sf-icon-button" onClick={() => handleAction(d.id, a.key)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {pendingDecisions.length === 0 && <p className="founder-ai-empty">暂无需要决策的事项</p>}
        </div>

        <h2 className="founder-ai-section-title">重大异常</h2>
        <div className="founder-ai-stack">
          {majorAnomalies.map((a) => (
            <div key={a.id} className="sf-card">
              <div className="founder-ai-row-header">
                <h3>{a.content}</h3>
                <span className="sf-badge">{a.source}</span>
              </div>
              <p className="founder-ai-meta">影响：{a.impact}</p>
              <p className="founder-ai-ai-suggestion">AI 初步判断：{a.aiJudgement}</p>
              <p className="founder-ai-meta">建议动作：{a.suggestedAction}</p>
            </div>
          ))}
          {majorAnomalies.length === 0 && <p className="founder-ai-empty">暂无重大异常</p>}
        </div>

        <h2 className="founder-ai-section-title">今日技术机会</h2>
        <div className="founder-ai-stack">
          {techOpportunities.slice(0, 3).map((t) => (
            <div key={t.id} className="sf-card">
              <div className="founder-ai-row-header">
                <h3>{t.title}</h3>
                <span className="sf-badge success">{t.suggestion}</span>
              </div>
              <p className="founder-ai-meta">来源：{t.source} · 与 AI Commerce OS 的关系：{t.relation}</p>
            </div>
          ))}
        </div>

        <h2 className="founder-ai-section-title">执行进度</h2>
        <div className="founder-ai-stack">
          {executionTasks.map((t) => (
            <div key={t.id} className="sf-card">
              <div className="founder-ai-row-header">
                <h3>{t.name}</h3>
                <span className="sf-badge">{t.stage}</span>
              </div>
              <p className="founder-ai-meta">
                执行者：{t.executor} · 进度 {t.progress}% · 阻塞项：{t.blockers}
              </p>
              <div className="founder-ai-progress-track">
                <div className="founder-ai-progress-fill" style={{ width: `${t.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <form className="founder-ai-command-bar" onSubmit={submitCommand}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="向 Founder AI 提出问题、发起论证或下达决策"
        />
        <button type="submit" className="sf-button-primary">发送</button>
      </form>
    </div>
  );
}
