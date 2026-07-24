import { PRIORITY_LABELS } from "./analysisViewLabels";

/**
 * AI CEO 结构化经营分析结果的可读展示（阶段 8E，成果中心专用）。
 * 只渲染纯文本节点（不使用 dangerouslySetInnerHTML），复用销售/
 * 产品 Agent 结果展示的 CSS 类名，保持同一套卡片/徽章样式。
 */
function CeoAnalysisView({ data }) {
  const delegations = data.delegations || [];

  return (
    <div className="sales-analysis-view">
      {data.summary && <p className="sales-analysis-summary">{data.summary}</p>}

      {(data.findings || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>发现</h5>
          <ul>
            {data.findings.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.risks || []).length > 0 && (
        <div className="sales-analysis-block sales-analysis-warning">
          <h5>风险</h5>
          <ul>
            {data.risks.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.actions || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>行动建议</h5>
          <ul>
            {data.actions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {delegations.length > 0 && (
        <div className="sales-analysis-block">
          <h5>委派</h5>
          <div className="sales-action-list">
            {delegations.map((item, index) => (
              <div className="sales-action-item" key={index}>
                <span className={`sales-priority-badge ${item.priority}`}>
                  {PRIORITY_LABELS[item.priority] ?? item.priority}
                </span>
                <div>
                  <strong>
                    【{item.assigned_agent}】{item.task}
                  </strong>
                  {item.reason && <small>{item.reason}</small>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CeoAnalysisView;
