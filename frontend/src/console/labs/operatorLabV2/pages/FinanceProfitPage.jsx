import { useState } from "react";
import { Tabs } from "../../../kit/Tabs.jsx";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { TrendLineChart } from "../../../kit/ChartFrame.jsx";
import { CostTokenPage } from "../../../../operator-preview/pages/AIGrowthPage.jsx";
import { getFeaturedOrder, getFeaturedProduct } from "../../../../demoData/operatorDemoData.js";

const TABS = [
  { key: "profit", label: "利润" },
  { key: "costToken", label: "成本与 Token" },
];

/**
 * 按店铺的利润构成——收入-商品成本-平台费用-广告费用-Token成本-退款。
 * 毛利润 = 销售收入 - 商品成本；净经营利润 = 毛利润 - 平台费用 -
 * 广告费用 - Token成本 - 退款。
 */
const PROFIT_BY_SHOP = [
  { id: 719, name: "抖音店A", revenue: 61200, productCost: 28400, platformFee: 3060, adCost: 6800, tokenCost: 1860, refund: 2200 },
  { id: 731, name: "淘宝店A", revenue: 25220, productCost: 12800, platformFee: 1261, adCost: 2400, tokenCost: 940, refund: 980 },
  { id: 718, name: "小红书店A", revenue: 9600, productCost: 4200, platformFee: 480, adCost: 1500, tokenCost: 320, refund: 0 },
];

function withProfit(row) {
  const grossProfit = row.revenue - row.productCost;
  const netProfit = grossProfit - row.platformFee - row.adCost - row.tokenCost - row.refund;
  return { ...row, grossProfit, netProfit, grossMargin: row.revenue > 0 ? grossProfit / row.revenue : 0 };
}

const PROFIT_ROWS = PROFIT_BY_SHOP.map(withProfit);

const PROFIT_TREND = [
  { date: "07-24", grossProfit: 7200, netProfit: 4100 },
  { date: "07-25", grossProfit: 8100, netProfit: 4600 },
  { date: "07-26", grossProfit: 7600, netProfit: 4200 },
  { date: "07-27", grossProfit: 9200, netProfit: 5300 },
  { date: "07-28", grossProfit: 8800, netProfit: 4900 },
  { date: "07-29", grossProfit: 9600, netProfit: 5600 },
  { date: "07-30", grossProfit: 10200, netProfit: 6100 },
];

/**
 * Operator Lab · Finance & Profit (Charter §3.3) — Operator's own
 * P&L view (revenue − cost − platform fee − ad cost − token spend −
 * refund) alongside the existing cost/Token consumption page.
 * Cross-links to Cloud Center's Token for the underlying ledger, per
 * the charter's "clear relationships to other Founder modules"
 * requirement. 商品利润/订单利润引用跨页面锚点（同一个 SKU/订单在
 * 商品中心/订单中心/数据中心显示一致的数据）。
 */
export function FinanceProfitPage({ rootNavigate, activeKey }) {
  const [tab, setTab] = useState(activeKey === "costToken" ? "costToken" : "profit");
  const totalRevenue = PROFIT_ROWS.reduce((s, r) => s + r.revenue, 0);
  const totalGrossProfit = PROFIT_ROWS.reduce((s, r) => s + r.grossProfit, 0);
  const totalNetProfit = PROFIT_ROWS.reduce((s, r) => s + r.netProfit, 0);
  const totalRefund = PROFIT_ROWS.reduce((s, r) => s + r.refund, 0);

  const featuredOrder = getFeaturedOrder();
  const featuredProduct = getFeaturedProduct();
  const orderEstimatedCost = featuredOrder ? Math.round(featuredOrder.amount * 0.4) : 0;
  const orderEstimatedProfit = featuredOrder ? featuredOrder.amount - orderEstimatedCost : 0;

  return (
    <div>
      <PageHeader title="财务与利润" subtitle="按店铺/商品/订单核算的收入、成本与经营利润" actions={<DemoBadge />} />
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "costToken" ? <CostTokenPage /> : null}
      {tab === "profit" ? (
        <div>
          <StatGrid>
            <StatCard label="销售收入（30天）" value={`¥${totalRevenue.toLocaleString()}`} />
            <StatCard label="毛利润" value={`¥${totalGrossProfit.toLocaleString()}`} />
            <StatCard label="净经营利润" value={`¥${totalNetProfit.toLocaleString()}`} />
            <StatCard label="退款合计" value={`¥${totalRefund.toLocaleString()}`} />
          </StatGrid>

          <div className="fdr-card" style={{ marginTop: 16 }}>
            <h3 className="fdr-card__title">利润趋势（近7天）</h3>
            <TrendLineChart
              data={PROFIT_TREND}
              xKey="date"
              series={[
                { key: "grossProfit", label: "毛利润" },
                { key: "netProfit", label: "净经营利润" },
              ]}
            />
          </div>

          <div className="fdr-card" style={{ marginTop: 16 }}>
            <h3 className="fdr-card__title">店铺利润</h3>
            <DataTable
              columns={[
                { key: "name", label: "店铺" },
                { key: "revenue", label: "销售收入", render: (r) => `¥${r.revenue.toLocaleString()}` },
                { key: "productCost", label: "商品成本", render: (r) => `¥${r.productCost.toLocaleString()}` },
                { key: "platformFee", label: "平台费用", render: (r) => `¥${r.platformFee.toLocaleString()}` },
                { key: "adCost", label: "广告费用", render: (r) => `¥${r.adCost.toLocaleString()}` },
                { key: "tokenCost", label: "Token 成本", render: (r) => `¥${r.tokenCost.toLocaleString()}` },
                { key: "refund", label: "退款", render: (r) => `¥${r.refund.toLocaleString()}` },
                { key: "grossProfit", label: "毛利润", render: (r) => `¥${r.grossProfit.toLocaleString()}` },
                { key: "netProfit", label: "净经营利润", render: (r) => <StatusPill tone={r.netProfit >= 0 ? "success" : "danger"}>¥{r.netProfit.toLocaleString()}</StatusPill> },
                { key: "grossMargin", label: "毛利率", render: (r) => `${(r.grossMargin * 100).toFixed(1)}%` },
              ]}
              rows={PROFIT_ROWS}
            />
          </div>

          {featuredProduct ? (
            <div className="fdr-card" style={{ marginTop: 16 }}>
              <h3 className="fdr-card__title">商品利润</h3>
              <p style={{ fontSize: 13, margin: "0 0 8px" }}>
                以商品中心的锚点商品「{featuredProduct.title}」（{featuredProduct.sku}）为例——同一个 SKU 在商品中心与这里显示一致的售价/成本。
              </p>
              <DataTable
                columns={[
                  { key: "name", label: "商品" },
                  { key: "sku", label: "SKU" },
                  { key: "price", label: "售价", render: (r) => `¥${r.price}` },
                  { key: "cost", label: "成本", render: (r) => `¥${r.cost}` },
                  { key: "profit", label: "单件毛利", render: (r) => `¥${r.price - r.cost}` },
                  { key: "margin", label: "毛利率", render: (r) => `${(((r.price - r.cost) / r.price) * 100).toFixed(0)}%` },
                ]}
                rows={[featuredProduct]}
              />
            </div>
          ) : null}

          {featuredOrder ? (
            <div className="fdr-card" style={{ marginTop: 16 }}>
              <h3 className="fdr-card__title">订单利润</h3>
              <p style={{ fontSize: 13, margin: "0 0 8px" }}>
                以订单中心的锚点订单「{featuredOrder.orderNumber}」为例——该订单当前
                {featuredOrder.paymentStatus === "refunding" ? "处于退款中，会对本月利润造成负向影响。" : "已支付，计入本月利润。"}
              </p>
              <DataTable
                columns={[
                  { key: "orderNumber", label: "订单号" },
                  { key: "storeName", label: "店铺" },
                  { key: "amount", label: "订单金额", render: (r) => `¥${r.amount.toLocaleString()}` },
                  { key: "estimatedCost", label: "预估成本", render: () => `¥${orderEstimatedCost.toLocaleString()}` },
                  {
                    key: "profitImpact",
                    label: "利润影响",
                    render: (r) => (
                      <StatusPill tone={r.paymentStatus === "refunding" ? "danger" : "success"}>
                        {r.paymentStatus === "refunding" ? `-¥${r.amount.toLocaleString()}（退款）` : `+¥${orderEstimatedProfit.toLocaleString()}`}
                      </StatusPill>
                    ),
                  },
                ]}
                rows={[featuredOrder]}
              />
            </div>
          ) : null}

          <div style={{ marginTop: 12, textAlign: "right" }}>
            <button type="button" className="fdr-btn fdr-btn--ghost" onClick={() => rootNavigate("cloudToken")}>查看 Cloud Center · Token 明细 →</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
