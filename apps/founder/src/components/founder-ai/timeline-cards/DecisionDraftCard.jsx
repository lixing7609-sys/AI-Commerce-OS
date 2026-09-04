const RESOLVED_LABEL = { approved: "已批准", rejected: "已驳回", continue: "已选择继续讨论", revise: "已选择修改结论" };

export function DecisionDraftCard({ entry, onAction }) {
  const { decision } = entry;
  return (
    <div className="sf-card timeline-card">
      <div className="founder-ai-row-header">
        <h4>待决策：{decision.title}</h4>
        <span className={`sf-badge ${decision.risk === "高" ? "danger" : decision.risk === "中" ? "warn" : "success"}`}>
          风险：{decision.risk}
        </span>
      </div>
      <dl className="founder-ai-definition-grid">
        <dt>背景</dt>
        <dd>{decision.background}</dd>
        <dt>当前结论</dt>
        <dd>{decision.conclusion.length ? decision.conclusion.join("；") : "暂无"}</dd>
        <dt>备选方案</dt>
        <dd>{decision.alternatives.length ? decision.alternatives.join("；") : "暂无"}</dd>
        <dt>已否决方案</dt>
        <dd>{decision.rejected.length ? decision.rejected.join("；") : "暂无"}</dd>
        <dt>关键约束</dt>
        <dd>{decision.constraints.length ? decision.constraints.join("；") : "暂无"}</dd>
        <dt>Sino 建议</dt>
        <dd>{decision.sinoSuggestion}</dd>
        <dt>批准后下一步</dt>
        <dd>{decision.nextStepAfterApproval}</dd>
      </dl>
      {!entry.resolved ? (
        <div className="founder-ai-actions">
          <button type="button" className="sf-button-primary" onClick={() => onAction(entry.id, "approve")}>
            批准
          </button>
          <button type="button" className="sf-icon-button" onClick={() => onAction(entry.id, "reject")}>
            驳回
          </button>
          <button type="button" className="sf-icon-button" onClick={() => onAction(entry.id, "continue")}>
            继续讨论
          </button>
          <button type="button" className="sf-icon-button" onClick={() => onAction(entry.id, "revise")}>
            修改结论
          </button>
        </div>
      ) : (
        <p className="founder-ai-saved-note">{RESOLVED_LABEL[entry.resolved]}</p>
      )}
    </div>
  );
}
