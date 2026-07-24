import {
  CHECKLIST_STATUS_LABELS,
  CONFIDENCE_LABELS,
  RECOMMENDATION_LABELS,
} from "./analysisViewLabels";

/**
 * 产品 Agent 结构化结果的可读展示（阶段 8D，阶段 8E 抽取为独立
 * 组件，供任务详情抽屉和成果详情页共用同一份渲染逻辑）。只渲染
 * 纯文本节点（不使用 dangerouslySetInnerHTML，不解析 Markdown/
 * HTML），字段本身已经在后端完成白名单校验和长度/条数限制。复用
 * 销售 Agent 结果展示的 CSS 类名（纯结构性布局样式，不含"销售"
 * 专属语义），避免重复定义同一套卡片/徽章样式。
 */
function ProductAnalysisView({ data }) {
  const verdict = data.selection_verdict || {};
  const hasVerdictContent =
    verdict.product || verdict.reason || verdict.recommendation;

  const assortment = data.assortment_plan || {};
  const hasAssortmentContent =
    (assortment.traffic_items || []).length > 0 ||
    (assortment.profit_items || []).length > 0 ||
    (assortment.filler_items || []).length > 0;

  const mvt = data.minimum_viable_test || {};
  const hasMvtContent =
    mvt.what_to_test ||
    mvt.quantity ||
    mvt.channel ||
    mvt.duration ||
    mvt.success_signal ||
    mvt.stop_condition ||
    (mvt.required_materials || []).length > 0 ||
    (mvt.follow_up_data || []).length > 0;

  return (
    <div className="sales-analysis-view">
      {data.summary && <p className="sales-analysis-summary">{data.summary}</p>}

      {hasVerdictContent && (
        <div className="sales-analysis-block">
          <h5>推荐结论</h5>
          {verdict.product && (
            <p>
              <strong>评估对象：</strong>
              {verdict.product}
            </p>
          )}
          <p>
            <strong>结论：</strong>
            {RECOMMENDATION_LABELS[verdict.recommendation] ??
              verdict.recommendation}
            {verdict.confidence && (
              <em className={`sales-confidence-badge ${verdict.confidence}`}>
                置信度：{CONFIDENCE_LABELS[verdict.confidence] ?? verdict.confidence}
              </em>
            )}
          </p>
          {verdict.reason && <p>{verdict.reason}</p>}
        </div>
      )}

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

      {(data.reasonable_assumptions || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>合理假设</h5>
          <ul>
            {data.reasonable_assumptions.map((item, index) => (
              <li key={index}>{item}</li>
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
          <h5>商品机会 / 选品方向</h5>
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

      {hasAssortmentContent && (
        <div className="sales-analysis-block">
          <h5>商品组合与角色</h5>
          {(assortment.traffic_items || []).length > 0 && (
            <>
              <small>引流款</small>
              <ul>
                {assortment.traffic_items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {(assortment.profit_items || []).length > 0 && (
            <>
              <small>利润款</small>
              <ul>
                {assortment.profit_items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {(assortment.filler_items || []).length > 0 && (
            <>
              <small>补充款</small>
              <ul>
                {assortment.filler_items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {hasMvtContent && (
        <div className="sales-analysis-block">
          <h5>最小测试方案</h5>
          {mvt.what_to_test && (
            <p>
              <strong>测试什么：</strong>
              {mvt.what_to_test}
            </p>
          )}
          {mvt.quantity && (
            <p>
              <strong>测试多少：</strong>
              {mvt.quantity}
            </p>
          )}
          {mvt.channel && (
            <p>
              <strong>测试渠道：</strong>
              {mvt.channel}
            </p>
          )}
          {mvt.duration && (
            <p>
              <strong>测试周期：</strong>
              {mvt.duration}
            </p>
          )}
          {(mvt.required_materials || []).length > 0 && (
            <>
              <small>所需素材</small>
              <ul>
                {mvt.required_materials.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {mvt.success_signal && (
            <p>
              <strong>成功信号：</strong>
              {mvt.success_signal}
            </p>
          )}
          {mvt.stop_condition && (
            <p>
              <strong>停止条件：</strong>
              {mvt.stop_condition}
            </p>
          )}
          {(mvt.follow_up_data || []).length > 0 && (
            <>
              <small>后续需采集的数据</small>
              <ul>
                {mvt.follow_up_data.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {(data.listing_checklist || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>上架准备清单</h5>
          <div className="sales-action-list">
            {data.listing_checklist.map((item, index) => (
              <div className="sales-action-item" key={index}>
                <span className={`sales-priority-badge ${item.status}`}>
                  {CHECKLIST_STATUS_LABELS[item.status] ?? item.status}
                </span>
                <div>
                  <strong>{item.item}</strong>
                  {item.note && <small>{item.note}</small>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data.supplier_questions || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>供应商待确认问题</h5>
          <ul>
            {data.supplier_questions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.next_actions || []).length > 0 && (
        <div className="sales-analysis-block">
          <h5>下一步行动</h5>
          <ul>
            {data.next_actions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
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

export default ProductAnalysisView;
