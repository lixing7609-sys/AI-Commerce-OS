import { useState } from "react";

import BusinessResultDetail from "../components/BusinessResultDetail";
import { usePreview } from "../helpers/previewContextCore";
import { demoDeliverables, DEMO_DATA_LABEL } from "../previewData";

const STATUS_FILTERS = [
  { key: "all", label: "全部" },
  { key: "pending_review", label: "待审核" },
  { key: "approved", label: "已批准" },
  { key: "rejected", label: "已驳回" },
  { key: "converted_to_task", label: "已转工作" },
  { key: "archived", label: "已归档" },
];

function shopNameOf(shops, shopId) {
  if (!shopId) return "未绑定店铺";
  const shop = shops.find((item) => (item.id ?? item.shop_code) === shopId);
  return shop ? shop.name ?? shop.shop_name : "未知店铺";
}

function DeliverableDetailWithVersions({ deliverable, shopName, onBack }) {
  const versions = deliverable.versions ?? [{ version: deliverable.version, createdAt: deliverable.createdAt, note: "初始生成" }];

  return (
    <div className="op-deliverable-detail-layout">
      <BusinessResultDetail
        item={deliverable}
        shopName={shopName}
        onBack={onBack}
        backLabel="返回成果列表"
      />

      <aside className="op-version-sidebar">
        <h4>版本历史</h4>
        <p className="op-version-current">当前版本：v{deliverable.version}</p>
        <ul className="op-version-list">
          {[...versions].reverse().map((item) => (
            <li key={item.version} className={item.version === deliverable.version ? "current" : ""}>
              <strong>v{item.version}</strong>
              <span>{item.createdAt}</span>
              <p>{item.note}</p>
              {item.version !== deliverable.version && <em>历史版本只读</em>}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function DeliverablesPage({ initialDetail }) {
  const { shops, isDemo } = usePreview();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(initialDetail?.kind === "deliverable" ? initialDetail.id : null);

  const filtered = demoDeliverables.filter(
    (item) => statusFilter === "all" || item.status === statusFilter
  );

  const selected = demoDeliverables.find((item) => item.id === selectedId) ?? null;

  if (selected) {
    return (
      <div className="op-page">
        <DeliverableDetailWithVersions
          deliverable={selected}
          shopName={shopNameOf(shops, selected.shopId)}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  return (
    <div className="op-page">
      <header className="op-page-header">
        <div>
          <h1>经营成果</h1>
          <p>AI为公司形成的正式分析、方案、清单和决策记录。</p>
        </div>
        {isDemo && <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>}
      </header>

      <div className="op-tab-bar">
        {STATUS_FILTERS.map((filter) => (
          <button
            type="button"
            key={filter.key}
            className={`op-tab-button${statusFilter === filter.key ? " active" : ""}`}
            onClick={() => setStatusFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="op-empty-state">
          <p>当前还没有成果。AI 完成支持的工作后，成果会显示在这里。</p>
        </div>
      ) : (
        <div className="op-deliverable-grid">
          {filtered.map((item) => (
            <article className="op-deliverable-card" key={item.id} onClick={() => setSelectedId(item.id)}>
              <div className="op-deliverable-card-header">
                <span>{item.typeLabel}</span>
                <span className={`op-status-badge ${item.status}`}>{item.statusLabel}</span>
              </div>
              <h3>{item.title}</h3>
              <p className="op-deliverable-conclusion">{item.conclusion}</p>
              <dl className="op-deliverable-meta">
                <div>
                  <dt>所属店铺</dt>
                  <dd>{shopNameOf(shops, item.shopId)}</dd>
                </div>
                <div>
                  <dt>AI角色</dt>
                  <dd>{item.agent}</dd>
                </div>
                <div>
                  <dt>当前版本</dt>
                  <dd>v{item.version}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{item.createdAt}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default DeliverablesPage;
