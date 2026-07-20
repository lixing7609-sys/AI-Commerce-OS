import { useEffect } from "react";

import {
  formatDateTime,
  getTaskDetailStatusLabel,
  sanitizeTaskDetail,
} from "./taskDetailHelpers";

const CONFIDENCE_LABELS = { high: "高", medium: "中", low: "低" };
const PRIORITY_LABELS = { high: "高", normal: "普通", low: "低" };
const RECOMMENDATION_LABELS = {
  test: "建议测试",
  hold: "建议观望",
  reject: "建议放弃",
  need_more_data: "需要更多数据",
};
const CHECKLIST_STATUS_LABELS = { ready: "已就绪", missing: "待补充" };

/**
 * 销售 Agent 结构化结果的可读展示（阶段 8C）。只渲染纯文本节点
 * （不使用 dangerouslySetInnerHTML，不解析 Markdown/HTML），
 * 字段本身已经在后端完成白名单校验和长度/条数限制。
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

/**
 * 产品 Agent 结构化结果的可读展示（阶段 8D）。只渲染纯文本节点
 * （不使用 dangerouslySetInnerHTML，不解析 Markdown/HTML），
 * 字段本身已经在后端完成白名单校验和长度/条数限制。复用销售
 * Agent 结果展示的 CSS 类名（纯结构性布局样式，不含"销售"专属
 * 语义），避免重复定义同一套卡片/徽章样式。
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

/**
 * 从右侧滑出的任务详情抽屉。
 *
 * 只接收已经过 sanitizeTaskDetail() 处理（或原始 task 由本组件内部
 * 处理）的数据；不展示 payload/context，不使用
 * dangerouslySetInnerHTML，result/error 均为限长纯文本。
 *
 * 抽屉本身不发起任何请求、不做轮询——内容完全由父组件
 * （TaskCenter）传入的 task 驱动，TaskCenter 现有 5 秒 polling
 * 刷新任务列表后，只要把最新的任务对象重新传入即可让抽屉内容
 * 自动同步更新。
 */
function TaskDetailDrawer({
  open,
  task,
  loading = false,
  notFound = false,
  onClose = () => {},
  onNavigateToTask = () => {},
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const detail = sanitizeTaskDetail(task);

  function handleOverlayClick() {
    onClose();
  }

  return (
    <div className="task-drawer-overlay" onClick={handleOverlayClick}>
      <aside
        className="task-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="任务详情"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="task-drawer-header">
          <span>任务详情</span>
          <button
            type="button"
            className="task-drawer-close"
            onClick={onClose}
            aria-label="关闭任务详情"
          >
            ✕
          </button>
        </div>

        <div className="task-drawer-body">
          {loading && !detail && (
            <div className="task-drawer-placeholder">
              正在加载任务详情…
            </div>
          )}

          {!loading && notFound && !detail && (
            <div className="task-drawer-placeholder">
              该任务暂未出现在当前列表中，请稍后刷新。
            </div>
          )}

          {detail && (
            <>
              <div className="task-drawer-status-row">
                <span
                  className={`task-drawer-status ${detail.status}`}
                >
                  {getTaskDetailStatusLabel(detail.status)}
                </span>
                <span className="task-drawer-id">{detail.id}</span>
              </div>

              <dl className="task-drawer-meta">
                <div>
                  <dt>AI 员工</dt>
                  <dd>{detail.assignedAgent ?? "—"}</dd>
                </div>
                <div>
                  <dt>任务类型</dt>
                  <dd>{detail.taskType || "—"}</dd>
                </div>
                <div>
                  <dt>优先级</dt>
                  <dd>{detail.priority}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{formatDateTime(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt>开始时间</dt>
                  <dd>{formatDateTime(detail.startedAt)}</dd>
                </div>
                <div>
                  <dt>完成时间</dt>
                  <dd>{formatDateTime(detail.completedAt)}</dd>
                </div>
                <div>
                  <dt>最近更新时间</dt>
                  <dd>{formatDateTime(detail.updatedAt)}</dd>
                </div>
              </dl>

              {detail.parentSummary && (
                <div className="task-drawer-delegation-section">
                  <h4>父任务</h4>
                  {detail.createdByAgent && (
                    <p className="task-delegation-note">
                      由 {detail.createdByAgent} 委派
                    </p>
                  )}
                  <button
                    type="button"
                    className="task-drawer-link-button"
                    onClick={() => onNavigateToTask(detail.parentSummary.id)}
                  >
                    <span className={`task-status ${detail.parentSummary.status}`}>
                      {getTaskDetailStatusLabel(detail.parentSummary.status)}
                    </span>
                    <span>{detail.parentSummary.id}</span>
                    <span>{detail.parentSummary.task_type}</span>
                  </button>
                </div>
              )}

              {detail.children.length > 0 && (
                <div className="task-drawer-delegation-section">
                  <h4>已委派子任务（{detail.children.length}）</h4>
                  <div className="task-drawer-children-list">
                    {detail.children.map((child) => {
                      const delegationItem = detail.delegationItems.find(
                        (item) => item.child_task_id === child.id
                      );

                      return (
                        <button
                          type="button"
                          key={child.id}
                          className="task-drawer-link-button"
                          onClick={() => onNavigateToTask(child.id)}
                        >
                          <span className={`task-status ${child.status}`}>
                            {getTaskDetailStatusLabel(child.status)}
                          </span>
                          <span>{child.assigned_agent ?? "—"}</span>
                          <span>{child.task_type}</span>
                          {delegationItem?.reason && (
                            <small>{delegationItem.reason}</small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {detail.salesAnalysis && (
                <div className="task-drawer-delegation-section">
                  <h4>销售分析</h4>
                  {detail.salesAnalysis.format === "text" ? (
                    <p className="sales-analysis-text">
                      {detail.salesAnalysis.data.text || "暂无内容"}
                    </p>
                  ) : (
                    <SalesAnalysisView data={detail.salesAnalysis.data} />
                  )}
                </div>
              )}

              {detail.productAnalysis && (
                <div className="task-drawer-delegation-section">
                  <h4>产品分析</h4>
                  {detail.productAnalysis.format === "text" ? (
                    <p className="sales-analysis-text">
                      {detail.productAnalysis.data.text || "暂无内容"}
                    </p>
                  ) : (
                    <ProductAnalysisView data={detail.productAnalysis.data} />
                  )}
                </div>
              )}

              <h4>执行结果</h4>
              <pre className="task-drawer-json">{detail.resultText}</pre>

              <h4>错误信息</h4>
              <pre className="task-drawer-json">{detail.errorText}</pre>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

export default TaskDetailDrawer;
