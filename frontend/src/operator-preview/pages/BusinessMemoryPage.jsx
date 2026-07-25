import { useState } from "react";

import { usePreview } from "../helpers/previewContextCore";
import { businessMemoryCategories, demoBusinessMemory, DEMO_DATA_LABEL } from "../previewData";

const ADD_BUTTONS = ["添加商品资料", "添加供应商", "添加规则", "从成果沉淀", "导入文件"];

function BusinessMemoryPage() {
  const { showPrototypeNotice } = usePreview();
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = demoBusinessMemory.filter(
    (item) => categoryFilter === "all" || item.category === categoryFilter
  );

  const recentlyUpdated = [...demoBusinessMemory].sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1)).slice(0, 3);
  const waitingToComplete = demoBusinessMemory.filter((item) => item.status === "待补充");
  const approved = demoBusinessMemory.filter((item) => item.status === "已批准");

  return (
    <div className="op-page">
      <header className="op-page-header">
        <div>
          <h1>业务记忆</h1>
          <p>让AI真正记住公司的商品、供应商、客户、规则和经营经验。</p>
        </div>
        <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
      </header>

      <p className="op-memory-hint">业务记忆将被AI员工用于后续分析和执行。</p>

      <section className="op-memory-summary-grid">
        <article className="op-panel">
          <h4>最近更新</h4>
          <ul className="op-memory-summary-list">
            {recentlyUpdated.map((item) => (
              <li key={item.id}>
                {item.title} <span>{item.lastUpdated}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="op-panel">
          <h4>AI最近使用</h4>
          <ul className="op-memory-summary-list">
            {demoBusinessMemory.slice(0, 3).map((item) => (
              <li key={item.id}>
                {item.title} <span>{item.usedBy.join("、")}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="op-panel">
          <h4>等待补充（{waitingToComplete.length}）</h4>
          <ul className="op-memory-summary-list">
            {waitingToComplete.length === 0 ? (
              <li className="op-empty-inline">暂无</li>
            ) : (
              waitingToComplete.map((item) => <li key={item.id}>{item.title}</li>)
            )}
          </ul>
        </article>
        <article className="op-panel">
          <h4>已批准知识（{approved.length}）</h4>
          <ul className="op-memory-summary-list">
            {approved.slice(0, 3).map((item) => (
              <li key={item.id}>{item.title}</li>
            ))}
          </ul>
        </article>
      </section>

      <div className="op-card-actions">
        {ADD_BUTTONS.map((label) => (
          <button type="button" key={label} className="op-btn" onClick={() => showPrototypeNotice(label)}>
            {label}
          </button>
        ))}
      </div>

      <div className="op-tab-bar wrap">
        <button
          type="button"
          className={`op-tab-button${categoryFilter === "all" ? " active" : ""}`}
          onClick={() => setCategoryFilter("all")}
        >
          全部分类
        </button>
        {businessMemoryCategories.map((category) => (
          <button
            type="button"
            key={category.key}
            className={`op-tab-button${categoryFilter === category.key ? " active" : ""}`}
            onClick={() => setCategoryFilter(category.key)}
          >
            {category.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="op-empty-state">该分类下暂无业务记忆。</div>
      ) : (
        <div className="op-memory-grid">
          {filtered.map((item) => (
            <article className="op-memory-card" key={item.id}>
              <div className="op-memory-card-header">
                <span>{businessMemoryCategories.find((c) => c.key === item.category)?.label}</span>
                <span className={`op-status-badge ${item.status === "已批准" ? "approved" : "pending_review"}`}>
                  {item.status}
                </span>
              </div>
              <h4>{item.title}</h4>
              <dl className="op-memory-meta">
                <div>
                  <dt>适用店铺</dt>
                  <dd>{item.shopScope}</dd>
                </div>
                <div>
                  <dt>最后更新</dt>
                  <dd>{item.lastUpdated}</dd>
                </div>
                <div>
                  <dt>哪些AI可以使用</dt>
                  <dd>{item.usedBy.join("、")}</dd>
                </div>
                <div>
                  <dt>来源</dt>
                  <dd>{item.source}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default BusinessMemoryPage;
