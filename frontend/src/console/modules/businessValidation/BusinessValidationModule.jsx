import { useState } from "react";
import {
  PageHeader,
  StatGrid,
  StatCard,
  DataTable,
  StatusPill,
  DemoBadge,
  Button,
  Select,
  FilterBar,
  ErrorState,
  Drawer,
  KeyValueList,
} from "../../kit/index.js";
import { getBusinessValidation } from "../founderWorkspace/workspaceEntities.js";
import { getFeaturedOrder, getFeaturedProduct, getFeaturedCustomer } from "../../../demoData/founderDemoData.js";
import { getProducts } from "../../mock/productMock.js";
import { getOrders, getPaymentStatusLabel } from "../../mock/orderMock.js";
import {
  DrillDownLink,
  WorkspaceLoadingSkeleton,
  RestrictedAction,
} from "../founderWorkspace/WorkspaceKit.jsx";
import { useDemoLoading, useDemoRefreshFailure } from "../founderWorkspace/useWorkspaceDemoState.js";
import { useToast } from "../../kit/useToast.js";

const MODE_LABEL = { real: "真实经营", demo: "演示数据" };
const MODE_TONE = { real: "success", demo: "neutral" };
const MODE_OPTIONS = [
  { value: "all", label: "全部店铺" },
  { value: "real", label: "仅真实经营" },
  { value: "demo", label: "仅演示数据" },
];

function productCheck(p) {
  if (p.stock === 0) return { label: "库存异常，需复核", tone: "warning" };
  if (!p.publishStatus?.douyin?.status && !p.publishStatus?.taobao?.status) return { label: "尚未发布，待校验", tone: "neutral" };
  return { label: "已校验通过", tone: "success" };
}

function orderCheck(o) {
  if (o.paymentStatus === "unpaid") return { label: "支付异常", tone: "danger" };
  if (o.paymentStatus === "refunding") return { label: "待复核（退款中）", tone: "warning" };
  return { label: "已校验通过", tone: "success" };
}

/**
 * Founder Workspace · 经营验证 — is Operator Lab producing real
 * commerce outcomes, not just a convincing demo? Charter §3.1:
 * distinct from Operator Lab itself (which runs the business) — this
 * page is Founder's read-only validation lens on top of it, split by
 * 商品/订单/客户/广告/利润 per the review spec, anchored to the same
 * featured order/product/customer used elsewhere in Founder so this
 * page and Operator Lab's detail pages read as one story.
 */
export function BusinessValidationModule() {
  const loading = useDemoLoading();
  const { failed, triggerRefresh } = useDemoRefreshFailure();
  const showToast = useToast();

  const data = getBusinessValidation();
  const featuredOrder = getFeaturedOrder();
  const featuredProduct = getFeaturedProduct();
  const featuredCustomer = getFeaturedCustomer();
  const sampleProducts = getProducts().slice(0, 5);
  const sampleOrders = getOrders().slice(0, 5);

  const [modeFilter, setModeFilter] = useState("all");
  const [detailShop, setDetailShop] = useState(null);

  function handleRefresh() {
    const willSucceed = failed;
    triggerRefresh();
    if (willSucceed) showToast("经营验证数据已刷新", "success");
  }

  const shops = data.shops.filter((s) => (modeFilter === "all" ? true : s.mode === modeFilter));

  if (loading) {
    return <WorkspaceLoadingSkeleton title="经营验证" subtitle={data.summary} />;
  }

  return (
    <div>
      <PageHeader
        title="经营验证"
        subtitle={data.summary}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <DemoBadge />
            <Button variant="primary" size="sm" onClick={handleRefresh}>刷新验证数据</Button>
            <DrillDownLink module="operatorLab" subView="workbench">进入 Operator 实验室 →</DrillDownLink>
          </div>
        }
      />
      <StatGrid>
        {data.metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} delta={m.delta} />
        ))}
      </StatGrid>

      {failed ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState message="经营验证数据刷新失败（演示环境模拟）" detail="GET /api/founder/business-validation -> 503" onRetry={handleRefresh} />
        </div>
      ) : (
        <>
          <div className="fdr-card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>店铺经营概览</h3>
              <FilterBar
                activeFilters={modeFilter !== "all" ? [{ key: "m", label: MODE_OPTIONS.find((o) => o.value === modeFilter)?.label, onRemove: () => setModeFilter("all") }] : []}
                onClearAll={() => setModeFilter("all")}
              >
                <Select label="按状态筛选" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} options={MODE_OPTIONS} />
              </FilterBar>
            </div>
            <DataTable
              columns={[
                { key: "name", label: "店铺" },
                { key: "mode", label: "状态", render: (r) => <StatusPill tone={MODE_TONE[r.mode]}>{MODE_LABEL[r.mode]}</StatusPill> },
                { key: "gmv", label: "GMV（30天）", render: (r) => `¥${r.gmv.toLocaleString()}` },
                { key: "orders", label: "订单数" },
                { key: "note", label: "说明" },
              ]}
              rows={shops}
              onRowClick={setDetailShop}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 16, marginTop: 16 }}>
            <div className="fdr-card">
              <h3 style={{ marginTop: 0 }}>商品验证</h3>
              {featuredProduct ? (
                <p className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>
                  验证锚点商品：《{featuredProduct.title}》（SKU {featuredProduct.sku}）— 与商品中心为同一条记录
                </p>
              ) : null}
              <DataTable
                columns={[
                  { key: "title", label: "商品" },
                  { key: "stock", label: "库存" },
                  { key: "price", label: "售价", render: (r) => `¥${r.price}` },
                  { key: "check", label: "校验结果", render: (r) => { const c = productCheck(r); return <StatusPill tone={c.tone}>{c.label}</StatusPill>; } },
                ]}
                rows={sampleProducts}
              />
              <div style={{ marginTop: 8, textAlign: "right" }}>
                <DrillDownLink module="productCenter">前往商品中心 →</DrillDownLink>
              </div>
            </div>

            <div className="fdr-card">
              <h3 style={{ marginTop: 0 }}>订单验证</h3>
              {featuredOrder ? (
                <p className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>
                  验证锚点订单：{featuredOrder.orderNumber}（{getPaymentStatusLabel(featuredOrder.paymentStatus)}）— 与订单中心为同一条记录
                </p>
              ) : null}
              <DataTable
                columns={[
                  { key: "orderNumber", label: "订单号" },
                  { key: "product", label: "商品" },
                  { key: "amount", label: "金额", render: (r) => `¥${r.amount}` },
                  { key: "check", label: "校验结果", render: (r) => { const c = orderCheck(r); return <StatusPill tone={c.tone}>{c.label}</StatusPill>; } },
                ]}
                rows={sampleOrders}
              />
              <div style={{ marginTop: 8, textAlign: "right" }}>
                <DrillDownLink module="orderCenter">前往订单中心 →</DrillDownLink>
              </div>
            </div>

            <div className="fdr-card">
              <h3 style={{ marginTop: 0 }}>客户验证</h3>
              {featuredCustomer ? (
                <KeyValueList
                  items={[
                    { label: "验证锚点买家", value: featuredCustomer.name },
                    { label: "手机号", value: featuredCustomer.phone ?? "—" },
                    { label: "关联订单", value: featuredOrder?.orderNumber ?? "—" },
                    { label: "说明", value: "该买家信息取自锚点订单，与订单验证为同一笔交易" },
                  ]}
                />
              ) : (
                <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>暂无可验证的客户记录</p>
              )}
            </div>

            <div className="fdr-card">
              <h3 style={{ marginTop: 0 }}>广告验证 <span className="fdr-type-caption" style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>（演示数据）</span></h3>
              <KeyValueList
                items={[
                  { label: "投放中广告", value: "3 组" },
                  { label: "30 天花费", value: "¥6,420（演示）" },
                  { label: "ROI", value: "2.8" },
                  { label: "归因订单占比", value: "34%" },
                ]}
              />
              <div style={{ marginTop: 8, textAlign: "right" }}>
                <DrillDownLink module="adCenter">前往广告中心 →</DrillDownLink>
              </div>
            </div>

            <div className="fdr-card">
              <h3 style={{ marginTop: 0 }}>利润验证 <span className="fdr-type-caption" style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>（演示数据）</span></h3>
              <KeyValueList
                items={[
                  { label: "毛利率", value: "38.6%（演示）" },
                  { label: "净利润（30天）", value: "¥19,240（演示）" },
                  { label: "主要成本项", value: "货品成本 61% · 广告 22% · Token 9%" },
                ]}
              />
              <RestrictedAction label="导出利润明细" />
            </div>
          </div>
        </>
      )}

      <Drawer open={!!detailShop} title={detailShop?.name} onClose={() => setDetailShop(null)}
        footer={<DrillDownLink module="operatorLab" subView="workbench">前往 Operator 实验室查看该店铺</DrillDownLink>}
      >
        {detailShop ? (
          <KeyValueList
            items={[
              { label: "状态", value: MODE_LABEL[detailShop.mode] },
              { label: "GMV（30天）", value: `¥${detailShop.gmv.toLocaleString()}` },
              { label: "订单数", value: detailShop.orders },
              { label: "说明", value: detailShop.note },
            ]}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
