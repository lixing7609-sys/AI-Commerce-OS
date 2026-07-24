import { CONFIDENCE_LABELS, PRIORITY_LABELS } from "./analysisViewLabels";

/**
 * 销售 Agent 结构化结果的可读展示（阶段 8C，阶段 8E 抽取为独立
 * 组件，供任务详情抽屉和成果详情页共用同一份渲染逻辑）。只渲染
 * 纯文本节点（不使用 dangerouslySetInnerHTML，不解析 Markdown/
 * HTML），字段本身已经在后端完成白名单校验和长度/条数限制。
 */
function SalesAnalysisView({ data }) {
  const strategy = data.strategy || {};
  const hasStrategyContent =
    strategy.target ||
    strategy.positioning ||
    (strategy.channel_plan || []).length > 0 ||
    (strategy.content_plan || []).length > 0 ||
    (strategy.conversion_plan || []).length > 0;

  return (
    <div className="sales-analysis-view">
      {data.summary && <p className="sales-analysis-summary">{data.summary}</p>}

      {(data.known_facts || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>已知事实</h5>
          <ul>
            {data.known_facts.map((fact, index) => (
              <li key={index}>{fact}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.data_gaps || []).length > 0 && (
        <div className="sales-analysis-block sales-analysis-warning">
          <h5>数据缺口</h5>
          <ul>
            {data.data_gaps.map((gap, index) => (
              <li key={index}>{gap}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.opportunities || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>销售机会</h5>
          <div className="sales-opportunity-list">
            {data.opportunities.map((item, index) => (
              <div className="sales-opportunity-card" key={index}>
                <div className="sales-opportunity-header">
                  <strong>{item.title}</strong>
                  <em className={`sales-confidence-badge ${item.confidence}`}>
                    置信度：{CONFIDENCE_LABELS[item.confidence] ?? item.confidence}
                  </em>
                </div>
                <p>{item.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasStrategyContent && (
        <div className="sales-analysis-block">
          <h5>销售策略</h5>
          {strategy.target && (
            <p>
              <strong>目标：</strong>
              {strategy.target}
            </p>
          )}
          {strategy.positioning && (
            <p>
              <strong>定位：</strong>
              {strategy.positioning}
            </p>
          )}
          {(strategy.channel_plan || []).length > 0 && (
            <>
              <small>渠道计划</small>
              <ul>
                {strategy.channel_plan.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {(strategy.content_plan || []).length > 0 && (
            <>
              <small>内容计划</small>
              <ul>
                {strategy.content_plan.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {(strategy.conversion_plan || []).length > 0 && (
            <>
              <small>转化计划</small>
              <ul>
                {strategy.conversion_plan.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {(data.actions_today || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>今日行动</h5>
          <div className="sales-action-list">
            {data.actions_today.map((item, index) => (
              <div className="sales-action-item" key={index}>
                <span className={`sales-priority-badge ${item.priority}`}>
                  {PRIORITY_LABELS[item.priority] ?? item.priority}
                </span>
                <div>
                  <strong>{item.action}</strong>
                  <small>
                    负责：{item.owner}
                    {item.expected_output ? ` · 预期产出：${item.expected_output}` : ""}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data.seven_day_plan || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>7 天计划</h5>
          <div className="sales-day-plan-list">
            {data.seven_day_plan.map((item) => (
              <div className="sales-day-plan-item" key={item.day}>
                <strong>第 {item.day} 天</strong>
                {(item.actions || []).length > 0 && (
                  <ul>
                    {item.actions.map((action, index) => (
                      <li key={index}>{action}</li>
                    ))}
                  </ul>
                )}
                {item.success_signal && (
                  <small>成功信号：{item.success_signal}</small>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(data.required_inputs || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>所需输入</h5>
          <ul>
            {data.required_inputs.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.warnings || []).length > 0 && (
        <div className="sales-analysis-block sales-analysis-warning">
          <h5>风险提醒</h5>
          <ul>
            {data.warnings.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SalesAnalysisView;
