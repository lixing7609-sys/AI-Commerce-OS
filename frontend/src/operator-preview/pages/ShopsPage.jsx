import { useState } from "react";

import { usePreview } from "../helpers/previewContextCore";
import { getShopHealthLabel, NOT_CONNECTED_LABEL, DEMO_BADGE_LABEL } from "../helpers/formatters";
import { demoAdvice } from "../previewData";

const DETAIL_TABS = [
  { key: "overview", label: "经营概览" },
  { key: "products", label: "商品" },
  { key: "orders", label: "订单" },
  { key: "inventory", label: "库存" },
  { key: "afterSales", label: "售后" },
  { key: "advice", label: "AI建议" },
  { key: "auth", label: "授权与设置" },
];

function ShopListView({ shops, isDemo, onOpenShop, showPrototypeNotice }) {
  if (shops.length === 0) {
    return (
      <div className="op-empty-state large">
        <p>尚未添加店铺。</p>
        <button type="button" className="op-btn primary" onClick={() => showPrototypeNotice("添加店铺")}>
          添加店铺
        </button>
      </div>
    );
  }

  return (
    <div className="op-shop-list">
      {shops.map((shop) => {
        const id = shop.id ?? shop.shop_code;
        const name = shop.name ?? shop.shop_name;
        const health = shop.health ?? (shop.connection_status === "connected" ? "normal" : "not_connected");
        return (
          <article className="op-shop-list-row" key={id}>
            <div className="op-shop-list-main">
              <strong>{name}</strong>
              <span className="op-shop-list-meta">
                {shop.platformLabel ?? shop.platform} · {shop.legalEntity ?? shop.legal_entity_name ?? "主体未填写"}
              </span>
            </div>
            <div className="op-shop-list-stats">
              <div>
                <span>授权状态</span>
                <strong>{shop.authStatus ?? (shop.connection_status === "not_configured" ? "尚未接入" : shop.connection_status)}</strong>
              </div>
              <div>
                <span>经营状态</span>
                <strong className={`op-health-text ${health}`}>{shop.healthLabel ?? getShopHealthLabel(health)}</strong>
              </div>
              <div>
                <span>今日销售</span>
                <strong>
                  {shop.todaySales !== undefined ? `¥${shop.todaySales.toLocaleString()}` : NOT_CONNECTED_LABEL}
                </strong>
              </div>
              <div>
                <span>今日订单</span>
                <strong>{shop.todayOrders !== undefined ? shop.todayOrders : NOT_CONNECTED_LABEL}</strong>
              </div>
              <div>
                <span>待处理异常</span>
                <strong>{shop.currentIssue && shop.currentIssue !== "无" ? 1 : 0}</strong>
              </div>
              <div>
                <span>待批准成果</span>
                <strong>{shop.deliverable_count ?? (isDemo ? 1 : NOT_CONNECTED_LABEL)}</strong>
              </div>
            </div>
            <div className="op-shop-list-actions">
              <button type="button" className="op-btn" onClick={() => showPrototypeNotice("更新授权")}>
                更新授权
              </button>
              <button type="button" className="op-btn" onClick={() => showPrototypeNotice("开始运营")}>
                开始运营
              </button>
              <button type="button" className="op-btn primary" onClick={() => onOpenShop(id)}>
                进入店铺
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ShopDetailView({ shop, isDemo, onBack, showPrototypeNotice }) {
  const [activeTab, setActiveTab] = useState("overview");
  const name = shop.name ?? shop.shop_name;
  const relatedAdvice = demoAdvice.filter((advice) => advice.shopId === (shop.id ?? shop.shop_code));

  return (
    <div className="op-shop-detail">
      <button type="button" className="op-link-button" onClick={onBack}>
        ← 返回店铺列表
      </button>

      <h2>{name}</h2>
      <p className="op-shop-detail-sub">
        所有经营数据和AI工作都以店铺为范围。
      </p>

      <div className="op-tab-bar">
        {DETAIL_TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            className={`op-tab-button${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="op-panel">
          <h3>今天发生了什么</h3>
          <p>
            今日销售 {shop.todaySales !== undefined ? `¥${shop.todaySales.toLocaleString()}` : NOT_CONNECTED_LABEL}
            {isDemo && shop.todaySales !== undefined && <em className="op-demo-badge">{DEMO_BADGE_LABEL}</em>}
            ，订单 {shop.todayOrders !== undefined ? shop.todayOrders : NOT_CONNECTED_LABEL}。
          </p>
          <h3>AI发现了什么</h3>
          <p>{shop.currentIssue && shop.currentIssue !== "无" ? shop.currentIssue : "暂无需要关注的异常。"}</p>
          <h3>接下来做什么</h3>
          <p>{shop.aiSuggestion ?? "暂无建议。"}</p>
        </div>
      )}

      {["products", "orders", "inventory", "afterSales"].includes(activeTab) && (
        <div className="op-panel">
          <div className="op-empty-state">
            <p>{NOT_CONNECTED_LABEL}</p>
            <p className="op-empty-hint">完成店铺授权并接入平台数据后，这里将显示真实{DETAIL_TABS.find((t) => t.key === activeTab)?.label}信息。</p>
          </div>
        </div>
      )}

      {activeTab === "advice" && (
        <div className="op-panel">
          {relatedAdvice.length === 0 ? (
            <div className="op-empty-state">
              <p>该店铺暂无AI建议。</p>
            </div>
          ) : (
            <div className="op-advice-list">
              {relatedAdvice.map((advice) => (
                <article className="op-advice-card" key={advice.id}>
                  <h4>{advice.title}</h4>
                  <p className="op-advice-source">来源：{advice.source}</p>
                  <div className="op-card-actions">
                    {advice.actions.map((action) => (
                      <button type="button" key={action} className="op-btn" onClick={() => showPrototypeNotice(action)}>
                        {action}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "auth" && (
        <div className="op-panel">
          <dl className="op-detail-meta">
            <div>
              <dt>授权状态</dt>
              <dd>{shop.authStatus ?? "尚未接入"}</dd>
            </div>
            <div>
              <dt>主体公司</dt>
              <dd>{shop.legalEntity ?? shop.legal_entity_name ?? "未填写"}</dd>
            </div>
          </dl>
          <button type="button" className="op-btn primary" onClick={() => showPrototypeNotice("更新授权")}>
            更新授权
          </button>
        </div>
      )}
    </div>
  );
}

function ShopsPage() {
  const { shops, isDemo, showPrototypeNotice } = usePreview();
  const [selectedShopId, setSelectedShopId] = useState(null);

  const selectedShop = shops.find((shop) => (shop.id ?? shop.shop_code) === selectedShopId) ?? null;

  return (
    <div className="op-page">
      <header className="op-page-header">
        <div>
          <h1>我的店铺</h1>
          <p>所有经营数据和AI工作都以店铺为范围。</p>
        </div>
        {!selectedShop && (
          <button type="button" className="op-btn primary" onClick={() => showPrototypeNotice("添加店铺")}>
            添加店铺
          </button>
        )}
      </header>

      {selectedShop ? (
        <ShopDetailView
          shop={selectedShop}
          isDemo={isDemo}
          onBack={() => setSelectedShopId(null)}
          showPrototypeNotice={showPrototypeNotice}
        />
      ) : (
        <ShopListView
          shops={shops}
          isDemo={isDemo}
          onOpenShop={setSelectedShopId}
          showPrototypeNotice={showPrototypeNotice}
        />
      )}
    </div>
  );
}

export default ShopsPage;
