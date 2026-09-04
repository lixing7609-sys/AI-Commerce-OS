/**
 * 业务结果详情的经营者可读视图（阶段：产品原型）。
 *
 * 根据成果类型渲染不同的经营者视角结构；只渲染纯文本节点，不使用
 * dangerouslySetInnerHTML。这是本次原型最核心的重构点——原系统
 * 点击任务后直接展示原始 JSON，本组件替换为分类型的业务视图，
 * 原始 JSON 改为通过 DevInfoCollapse 折叠展示。
 */

function Section({ title, children }) {
  return (
    <div className="op-result-section">
      <h5>{title}</h5>
      {children}
    </div>
  );
}

function ListSection({ title, items, tone }) {
  if (!items || items.length === 0) return null;
  return (
    <Section title={title}>
      <ul className={tone ? `op-result-list ${tone}` : "op-result-list"}>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </Section>
  );
}

function CeoResultView({ content }) {
  return (
    <div className="op-result-view">
      {content.summary && <p className="op-result-summary">{content.summary}</p>}
      <ListSection title="关键发现" items={content.findings} />
      <ListSection title="风险" items={content.risks} tone="warning" />
      <ListSection title="优先事项" items={content.priorities} />
      <ListSection title="今日行动" items={content.todayActions} />
      <ListSection title="委派工作" items={content.delegations} />
      <ListSection title="需要老板决定的事情" items={content.decisionsNeeded} tone="warning" />
    </div>
  );
}

function SalesResultView({ content }) {
  return (
    <div className="op-result-view">
      <ListSection title="已知事实" items={content.knownFacts} />
      <ListSection title="数据缺口" items={content.dataGaps} tone="warning" />
      <ListSection title="销售机会" items={content.opportunities} />
      {content.targetCustomers && (
        <Section title="目标客户">
          <p>{content.targetCustomers}</p>
        </Section>
      )}
      {content.strategy && (
        <Section title="销售策略">
          <p>{content.strategy}</p>
        </Section>
      )}
      <ListSection title="行动计划" items={content.actionPlan} />
      <ListSection title="风险提示" items={content.risks} tone="warning" />
    </div>
  );
}

function ProductResultView({ content }) {
  return (
    <div className="op-result-view">
      {(content.verdict || content.reason) && (
        <Section title="商品评估结论">
          {content.verdict && (
            <p>
              <strong>推荐：</strong>
              {content.verdict}
            </p>
          )}
          {content.reason && <p>{content.reason}</p>}
        </Section>
      )}
      <ListSection title="已知事实" items={content.knownFacts} />
      <ListSection title="合理假设" items={content.assumptions} />
      <ListSection title="数据缺口" items={content.dataGaps} tone="warning" />
      <ListSection title="商品机会" items={content.opportunities} />
      <ListSection title="商品组合" items={content.assortment} />
      {content.minimumViableTest && (
        <Section title="最小测试方案">
          <p>{content.minimumViableTest}</p>
        </Section>
      )}
      <ListSection title="上架准备" items={content.listingChecklist} />
      <ListSection title="供应商待确认问题" items={content.supplierQuestions} />
      <ListSection title="下一步" items={content.nextActions} />
      <ListSection title="风险提示" items={content.risks} tone="warning" />
    </div>
  );
}

const VIEW_BY_TYPE = {
  ceo_analysis: CeoResultView,
  sales_analysis: SalesResultView,
  product_analysis: ProductResultView,
};

function BusinessResultView({ type, content }) {
  const View = VIEW_BY_TYPE[type];

  if (!View || !content) {
    return <p className="op-result-summary">该业务结果暂无可展示的结构化内容。</p>;
  }

  return <View content={content} />;
}

export default BusinessResultView;
