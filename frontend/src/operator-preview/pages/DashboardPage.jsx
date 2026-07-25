import { useEffect, useState } from "react";

import TopScopeBar from "../components/TopScopeBar";
import StartOperatingModal from "../components/StartOperatingModal";
import SalesTrendChart from "../components/charts/SalesTrendChart";
import { DonutChart, BarListChart } from "../components/charts/DonutChart";
import { usePreview, ALL_SHOPS_SCOPE, UNASSIGNED_SHOP_SCOPE } from "../helpers/previewContextCore";
import {
  demoAdvice,
  demoPendingItems,
  demoSalesTrend,
  demoTimeline,
  demoTodayMetricsPrimary,
  demoTodayMetricsSecondary,
  DEMO_DATA_LABEL,
} from "../previewData";
import { getShopHealthLabel, formatChangeVsYesterday, NOT_CONNECTED_LABEL } from "../helpers/formatters";
import { buildShopSalesSegments, groupCountsByKey } from "../helpers/chartData";
import { fetchRealSystemSnapshot } from "../helpers/realDataApi";

function MetricRow({ items, isDemo }) {
  return (
    <section className="op-metric-grid">
      {items.map((item) => (
        <article className="op-metric-card" key={item.key}>
          <span className="op-metric-label">{item.label}</span>
          <strong className="op-metric-value">{item.value}</strong>
          {isDemo && item.value !== NOT_CONNECTED_LABEL && (
            <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
          )}
        </article>
      ))}
    </section>
  );
}

function ShopHealthSection({ shops, isDemo, onNavigate }) {
  if (shops.length === 0) {
    return (
      <section className="op-panel">
        <h3>店铺健康</h3>
        <div className="op-empty-state">
          <p>尚未添加店铺。</p>
          <button type="button" className="op-btn primary" onClick={() => onNavigate("shops")}>
            添加第一家店铺
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="op-panel">
      <div className="op-panel-heading">
        <h3>店铺健康</h3>
        <button type="button" className="op-link-button" onClick={() => onNavigate("shops")}>
          查看全部店铺 →
        </button>
      </div>

      <div className="op-shop-health-grid">
        {shops.slice(0, 6).map((shop) => {
          const name = shop.name ?? shop.shop_name;
          const health = shop.health ?? (shop.connection_status === "connected" ? "normal" : "not_connected");
          const healthLabel = shop.healthLabel ?? getShopHealthLabel(health);
          return (
            <article className="op-shop-health-card" key={shop.id ?? shop.shop_code}>
              <div className="op-shop-health-header">
                <strong>{name}</strong>
                <span className={`op-health-badge ${health}`}>{healthLabel}</span>
              </div>
              <dl>
                <div>
                  <dt>今日销售</dt>
                  <dd>
                    {shop.todaySales !== undefined ? `¥${shop.todaySales.toLocaleString()}` : NOT_CONNECTED_LABEL}
                    {isDemo && shop.todaySales !== undefined && <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>}
                  </dd>
                </div>
                <div>
                  <dt>订单</dt>
                  <dd>{shop.todayOrders !== undefined ? shop.todayOrders : NOT_CONNECTED_LABEL}</dd>
                </div>
                <div>
                  <dt>较昨日</dt>
                  <dd>{shop.changeVsYesterday !== undefined ? formatChangeVsYesterday(shop.changeVsYesterday) : NOT_CONNECTED_LABEL}</dd>
                </div>
              </dl>
              {shop.currentIssue && shop.currentIssue !== "无" && (
                <p className="op-shop-issue">当前异常：{shop.currentIssue}</p>
              )}
              {shop.aiSuggestion && <p className="op-shop-suggestion">AI建议：{shop.aiSuggestion}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ChartsSection({ isDemo, salesTrend, shops }) {
  if (!isDemo) {
    return (
      <section className="op-charts-grid">
        <div className="op-panel op-chart-panel wide">
          <h3>近7日销售趋势</h3>
          <div className="op-empty-state">
            <p>需要接入真实订单数据后才能生成趋势图，尚未接入。</p>
          </div>
        </div>
        <div className="op-panel op-chart-panel">
          <h3>店铺销售占比</h3>
          <div className="op-empty-state">
            <p>尚未接入真实店铺销售数据。</p>
          </div>
        </div>
      </section>
    );
  }

  const shopSegments = buildShopSalesSegments(shops);
  const totalSales = shopSegments.reduce((sum, item) => sum + item.value, 0);

  return (
    <section className="op-charts-grid">
      <div className="op-panel op-chart-panel wide">
        <div className="op-panel-heading">
          <h3>近7日销售趋势</h3>
          <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
        </div>
        <SalesTrendChart data={salesTrend} />
      </div>
      <div className="op-panel op-chart-panel">
        <div className="op-panel-heading">
          <h3>店铺销售占比</h3>
          <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
        </div>
        <DonutChart
          segments={shopSegments}
          centerValue={totalSales}
          centerLabel="今日总销售额"
          valueFormatter={(value) => `¥${value.toLocaleString()}`}
        />
      </div>
    </section>
  );
}

function BreakdownSection({ isDemo, pendingItems, advice }) {
  if (!isDemo) {
    return (
      <section className="op-charts-grid">
        <div className="op-panel">
          <h3>待处理事项分布</h3>
          <div className="op-empty-state">
            <p>暂无需要你处理的事项。</p>
          </div>
        </div>
        <div className="op-panel op-chart-panel">
          <h3>AI建议来源分布</h3>
          <div className="op-empty-state">
            <p>该内容需要完成一次真实AI运营分析才能生成，尚未接入。</p>
          </div>
        </div>
      </section>
    );
  }

  const pendingRows = groupCountsByKey(pendingItems, (item) => item.type);
  const adviceSegments = groupCountsByKey(advice, (item) => item.source).map((row) => ({
    name: row.label,
    value: row.value,
  }));

  return (
    <section className="op-charts-grid">
      <div className="op-panel">
        <div className="op-panel-heading">
          <h3>待处理事项分布</h3>
          <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
        </div>
        <BarListChart rows={pendingRows} />
      </div>
      <div className="op-panel op-chart-panel">
        <div className="op-panel-heading">
          <h3>AI建议来源分布</h3>
          <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
        </div>
        <DonutChart segments={adviceSegments} centerValue={advice.length} centerLabel="今日建议数" />
      </div>
    </section>
  );
}

function AdviceSection({ isDemo, showPrototypeNotice }) {
  if (!isDemo) {
    return (
      <section className="op-panel">
        <h3>AI今日建议</h3>
        <div className="op-empty-state">
          <p>该内容需要完成一次真实AI运营分析才能生成，尚未接入。</p>
          <p className="op-empty-hint">可切换到"演示经营数据"体验界面效果。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="op-panel">
      <div className="op-panel-heading">
        <h3>AI今日建议</h3>
        <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
      </div>

      <div className="op-advice-list">
        {demoAdvice.map((advice) => (
          <article className="op-advice-card" key={advice.id}>
            <h4>{advice.title}</h4>
            <p className="op-advice-source">来源：{advice.source}</p>
            <p className="op-advice-reason-label">理由：</p>
            <ul>
              {advice.reasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
            <div className="op-card-actions">
              {advice.actions.map((action) => (
                <button
                  type="button"
                  key={action}
                  className="op-btn"
                  onClick={() => showPrototypeNotice(action)}
                >
                  {action}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PendingSection({ isDemo, showPrototypeNotice, shopNameById }) {
  if (!isDemo) {
    return (
      <section className="op-panel">
        <h3>等待我处理</h3>
        <div className="op-empty-state">
          <p>暂无需要你处理的事项。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="op-panel">
      <div className="op-panel-heading">
        <h3>等待我处理</h3>
        <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
      </div>

      <div className="op-pending-list">
        {demoPendingItems.map((item) => (
          <article className="op-pending-card" key={item.id}>
            <div className="op-pending-header">
              <span className="op-pending-type">{item.type}</span>
              <span className="op-pending-due">{item.dueLabel}</span>
            </div>
            <h4>{item.title}</h4>
            <p className="op-pending-meta">
              {item.shopId ? shopNameById(item.shopId) : "全部店铺"} · {item.proposedBy} 提出
            </p>
            <p className="op-pending-reason">{item.reason}</p>
            <div className="op-card-actions">
              {item.actions.map((action) => (
                <button
                  type="button"
                  key={action}
                  className="op-btn"
                  onClick={() => showPrototypeNotice(action)}
                >
                  {action}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TimelineSection({ isDemo, onNavigate }) {
  if (!isDemo) {
    return (
      <section className="op-panel">
        <h3>今日工作动态</h3>
        <div className="op-empty-state">
          <p>暂无今日工作动态。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="op-panel">
      <div className="op-panel-heading">
        <h3>今日工作动态</h3>
        <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
      </div>

      <ol className="op-timeline">
        {demoTimeline.map((item, index) => (
          <li
            key={index}
            className={item.kind}
            onClick={() => onNavigate("secretary")}
          >
            <span className="op-timeline-time">{item.time}</span>
            <span className="op-timeline-text">{item.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DashboardPage({ onNavigate }) {
  const { dataMode, isDemo, shops, shopScope, showPrototypeNotice } = usePreview();
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [realSnapshot, setRealSnapshot] = useState({ connected: false, taskStats: null, shopStats: null, deliverableStats: null });

  useEffect(() => {
    if (dataMode !== "real") return undefined;
    let cancelled = false;
    fetchRealSystemSnapshot().then((snapshot) => {
      if (!cancelled) setRealSnapshot(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [dataMode, lastUpdated]);

  function shopNameById(shopId) {
    const shop = shops.find((item) => (item.id ?? item.shop_code) === shopId);
    return shop ? shop.name ?? shop.shop_name : "未知店铺";
  }

  function handleRefresh() {
    setLastUpdated(new Date());
  }

  const primaryMetrics = isDemo
    ? demoTodayMetricsPrimary
    : demoTodayMetricsPrimary.map((item) => ({ ...item, value: NOT_CONNECTED_LABEL }));

  const secondaryMetrics = isDemo
    ? demoTodayMetricsSecondary
    : demoTodayMetricsSecondary.map((item) => {
        if (item.key === "pendingDeliverables" && realSnapshot.connected && realSnapshot.deliverableStats) {
          return { ...item, value: String(realSnapshot.deliverableStats.pending_review ?? 0) };
        }
        return { ...item, value: NOT_CONNECTED_LABEL };
      });

  const notConnectedAreas = ["销售数据", "订单数据", "库存数据", "财务数据"];

  const connectedShopsCount = shops.filter((shop) => shop.authStatus === "已授权" || shop.status === "active").length;

  return (
    <div className="op-page">
      <header className="op-page-header">
        <div>
          <h1>一人公司经营驾驶舱</h1>
          <p>今天公司怎么样，AI建议先做什么。</p>
        </div>
        <button type="button" className="op-system-status-pill ok" onClick={() => onNavigate("settings")}>
          系统正常
        </button>
      </header>

      <TopScopeBar
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
        onStartOperating={() => setModalOpen(true)}
      />

      {!isDemo && !realSnapshot.connected && (
        <div className="op-inline-alert">
          真实系统数据暂时无法获取，已安全降级为"尚未接入"展示，不影响页面浏览。
        </div>
      )}

      <MetricRow items={primaryMetrics} isDemo={isDemo} />
      <MetricRow items={secondaryMetrics} isDemo={isDemo} />

      <ChartsSection isDemo={isDemo} salesTrend={demoSalesTrend} shops={shops} />
      <BreakdownSection isDemo={isDemo} pendingItems={demoPendingItems} advice={demoAdvice} />

      <ShopHealthSection shops={shops} isDemo={isDemo} onNavigate={onNavigate} />
      <AdviceSection isDemo={isDemo} showPrototypeNotice={showPrototypeNotice} />
      <PendingSection isDemo={isDemo} showPrototypeNotice={showPrototypeNotice} shopNameById={shopNameById} />
      <TimelineSection isDemo={isDemo} onNavigate={onNavigate} />

      {modalOpen && (
        <StartOperatingModal
          scopeLabel={
            shopScope === ALL_SHOPS_SCOPE
              ? "全部店铺"
              : shopScope === UNASSIGNED_SHOP_SCOPE
              ? "未绑定店铺"
              : shopNameById(shopScope)
          }
          connectedShopsCount={connectedShopsCount}
          notConnectedAreas={notConnectedAreas}
          onClose={() => setModalOpen(false)}
          onViewAdvice={() => {
            const target = document.querySelector(".op-advice-list");
            target?.scrollIntoView({ behavior: "smooth" });
          }}
          onGoSecretary={() => onNavigate("secretary")}
        />
      )}
    </div>
  );
}

export default DashboardPage;
