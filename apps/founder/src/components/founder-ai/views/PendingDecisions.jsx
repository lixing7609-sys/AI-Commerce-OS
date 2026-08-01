import { useFounderAI } from "../useFounderAI.js";

const ACTIONS = [
  { key: "approve", label: "同意" },
  { key: "reject", label: "驳回" },
  { key: "defer", label: "延后处理" },
];

export function PendingDecisions() {
  const { pendingDecisions, resolvePendingDecision } = useFounderAI();

  return (
    <div className="founder-ai-view-shell">
      <div className="founder-ai-stack">
        {pendingDecisions.map((d) => (
          <div key={d.id} className="sf-card">
            <div className="founder-ai-row-header">
              <h3>{d.title}</h3>
              <span className={`sf-badge ${d.riskLevel === "高" ? "danger" : d.riskLevel === "中" ? "warn" : "success"}`}>
                风险：{d.riskLevel}
              </span>
            </div>
            <dl className="founder-ai-definition-grid">
              <dt>来源</dt>
              <dd>{d.source}</dd>
              <dt>原因</dt>
              <dd>{d.reason || "—"}</dd>
              <dt>影响范围</dt>
              <dd>{d.impact}</dd>
              <dt>预期收益</dt>
              <dd>{d.expectedBenefit || "—"}</dd>
              <dt>AI 建议</dt>
              <dd>{d.aiSuggestion}</dd>
              <dt>截止时间</dt>
              <dd>{d.deadline || "未设定"}</dd>
            </dl>
            <div className="founder-ai-actions">
              {ACTIONS.map((a) => (
                <button key={a.key} type="button" className="sf-icon-button" onClick={() => resolvePendingDecision(d.id, a.key)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {pendingDecisions.length === 0 && <p className="founder-ai-empty">暂无待决策事项</p>}
      </div>
    </div>
  );
}
