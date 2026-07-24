import { useMemo, useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { Modal } from "../../kit/Modal.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { DEMO_STORES } from "../../mock/storesMock.js";
import {
  exportOrdersToCsv,
  getOrderPlatformLabel,
  getOrderStatusLabel,
  getOrders,
  getPaymentStatusLabel,
  getShippingStatusLabel,
  getStoreOrderStats,
  markOrderShipped,
} from "../../mock/orderMock.js";

const ALL_STORES = "all";

const ORDER_STATUS_TONE = {
  pending_shipment: "warning",
  shipped: "info",
  completed: "success",
  cancelled: "neutral",
  refund_after_sales: "danger",
};

const COURIERS = ["顺丰速运", "中通快递", "圆通速递", "韵达快递"];

function ShippingLabelModal({ orders, open, onClose }) {
  if (!orders || orders.length === 0) return null;
  return (
    <Modal open={open} title={`快递面单预览（${orders.length} 单）`} onClose={onClose} footer={<Button variant="primary" onClick={() => window.print()}>打印</Button>}>
      {orders.map((o) => (
        <div key={o.id} className="fdr-card" style={{ background: "var(--bg)" }}>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, margin: 0, fontSize: 13 }}>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>收件人</dt><dd style={{ margin: 0 }}>{o.recipient}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>联系电话</dt><dd style={{ margin: 0 }}>{o.buyerPhone}</dd></div>
            <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>收货地址</dt><dd style={{ margin: 0 }}>{o.deliveryAddress}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>商品 / SKU</dt><dd style={{ margin: 0 }}>{o.product} / {o.sku}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>数量</dt><dd style={{ margin: 0 }}>{o.quantity}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>快递公司</dt><dd style={{ margin: 0 }}>{o.courierCompany ?? "未分配"}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>运单号</dt><dd style={{ margin: 0 }}>{o.trackingNumber ?? "未分配"}</dd></div>
          </dl>
        </div>
      ))}
    </Modal>
  );
}

function ShipModal({ order, open, onClose, onConfirm }) {
  const [courier, setCourier] = useState(COURIERS[0]);
  const [tracking, setTracking] = useState("");
  if (!order) return null;
  return (
    <Modal
      open={open}
      title={`标记发货 · ${order.orderNumber}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!tracking} onClick={() => onConfirm(courier, tracking)}>确认发货</Button>
        </>
      }
    >
      <div className="fdr-field">
        <label className="fdr-field__label">快递公司</label>
        <select className="fdr-select" value={courier} onChange={(e) => setCourier(e.target.value)}>
          {COURIERS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">运单号</label>
        <input className="fdr-input" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="请输入运单号" />
      </div>
    </Modal>
  );
}

function OrderDetailModal({ order, open, onClose }) {
  if (!order) return null;
  return (
    <Modal open={open} title={`订单详情 · ${order.orderNumber}`} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, margin: 0, fontSize: 13 }}>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>平台</dt><dd style={{ margin: 0 }}>{getOrderPlatformLabel(order.platform)}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>店铺</dt><dd style={{ margin: 0 }}>{order.storeName}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>买家</dt><dd style={{ margin: 0 }}>{order.buyer}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>联系电话</dt><dd style={{ margin: 0 }}>{order.buyerPhone}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>收货地址</dt><dd style={{ margin: 0 }}>{order.deliveryAddress}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>商品 / SKU</dt><dd style={{ margin: 0 }}>{order.product} / {order.sku}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>数量</dt><dd style={{ margin: 0 }}>{order.quantity}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>订单金额</dt><dd style={{ margin: 0 }}>¥{order.amount}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>支付状态</dt><dd style={{ margin: 0 }}>{getPaymentStatusLabel(order.paymentStatus)}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>订单状态</dt><dd style={{ margin: 0 }}>{getOrderStatusLabel(order.orderStatus)}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>物流状态</dt><dd style={{ margin: 0 }}>{getShippingStatusLabel(order.shippingStatus)}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>快递</dt><dd style={{ margin: 0 }}>{order.courierCompany ?? "—"} {order.trackingNumber ?? ""}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>下单时间</dt><dd style={{ margin: 0 }}>{new Date(order.orderTime).toLocaleString("zh-CN")}</dd></div>
      </dl>
    </Modal>
  );
}

export function OrderCenterModule() {
  const { subView, navigate } = useConsoleNavContext();
  const toast = useToast();
  const [orders, setOrders] = useState(() => getOrders());
  const [selectedIds, setSelectedIds] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [dateRange, setDateRange] = useState("30d");
  const [detailOrder, setDetailOrder] = useState(null);
  const [shipOrder, setShipOrder] = useState(null);
  const [labelOrders, setLabelOrders] = useState(null);

  const scope = subView ?? ALL_STORES;
  // 挂载时刻的时间戳，不在每次渲染里重新读取——渲染函数本身必须
  // 是纯函数，"现在几点"这种会变的值只能在挂载时读一次。
  const [nowTs] = useState(() => Date.now());

  const dateRangeHours = { today: 24, "7d": 24 * 7, "30d": 24 * 30 }[dateRange] ?? 24 * 30;
  const cutoff = nowTs - dateRangeHours * 3600000;

  const filteredOrders = useMemo(() => {
    let list = scope === ALL_STORES ? orders : orders.filter((o) => o.storeId === scope);
    list = list.filter((o) => new Date(o.orderTime).getTime() >= cutoff);
    if (statusFilter) list = list.filter((o) => o.orderStatus === statusFilter);
    if (platformFilter) list = list.filter((o) => o.platform === platformFilter);
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(kw) ||
          o.buyer.toLowerCase().includes(kw) ||
          o.product.toLowerCase().includes(kw) ||
          (o.trackingNumber ?? "").toLowerCase().includes(kw)
      );
    }
    return list;
  }, [orders, scope, statusFilter, platformFilter, keyword, cutoff]);

  const stats = useMemo(() => getStoreOrderStats(scope === ALL_STORES ? null : scope), [orders, scope]);

  function handleStoreChange(nextScope) {
    setSelectedIds([]);
    navigate("orderCenter", { subView: nextScope === ALL_STORES ? undefined : nextScope });
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleShipConfirm(courier, tracking) {
    setOrders(markOrderShipped(shipOrder.id, courier, tracking));
    toast(`订单 ${shipOrder.orderNumber} 已标记发货`, "success");
    setShipOrder(null);
  }

  return (
    <div>
      <PageHeader
        title="订单中心"
        subtitle={scope === ALL_STORES ? "跨店铺汇总视图" : `${DEMO_STORES.find((s) => s.id === scope)?.name} 店铺明细`}
        actions={<DemoBadge />}
      />

      <Tabs
        tabs={[{ key: ALL_STORES, label: "全部店铺汇总" }, ...DEMO_STORES.map((s) => ({ key: s.id, label: s.name }))]}
        activeTab={scope}
        onChange={handleStoreChange}
      />

      <StatGrid>
        <StatCard label="订单总数" value={stats.totalOrders} />
        <StatCard label="已支付" value={stats.paidOrders} />
        <StatCard label="待发货" value={stats.pendingShipment} />
        <StatCard label="已发货" value={stats.shipped} />
        <StatCard label="已完成" value={stats.completed} />
        <StatCard label="已取消" value={stats.cancelled} />
        <StatCard label="退款 / 售后" value={stats.refundAfterSales} />
        <StatCard label="今日 GMV" value={`¥${stats.todayGmv.toLocaleString()}`} />
        <StatCard label="客单价" value={`¥${stats.avgOrderValue}`} />
        <StatCard label="异常订单" value={stats.abnormalOrders} />
      </StatGrid>

      <div className="fdr-card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="fdr-input"
            style={{ maxWidth: 260 }}
            placeholder="搜索订单号 / 买家 / 商品 / 运单号"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select className="fdr-select" style={{ maxWidth: 140 }} value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
            <option value="today">今天</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
          </select>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部订单状态</option>
            <option value="pending_shipment">待发货</option>
            <option value="shipped">已发货</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
            <option value="refund_after_sales">退款/售后</option>
          </select>
          <select className="fdr-select" style={{ maxWidth: 140 }} value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            <option value="">全部平台</option>
            <option value="douyin">抖音</option>
            <option value="xiaohongshu">小红书</option>
            <option value="taobao">淘宝</option>
            <option value="shopify">Shopify</option>
            <option value="amazon">Amazon</option>
          </select>
        </div>
      </div>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>订单列表（{filteredOrders.length}）</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedIds.length === 0}
              onClick={() => setLabelOrders(filteredOrders.filter((o) => selectedIds.includes(o.id)))}
            >
              批量打印快递面单（{selectedIds.length}）
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedIds.length === 0}
              onClick={() => {
                exportOrdersToCsv(filteredOrders.filter((o) => selectedIds.includes(o.id)), `订单导出-已选-${Date.now()}.csv`);
                toast("已导出所选订单", "success");
              }}
            >
              导出所选订单
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                exportOrdersToCsv(filteredOrders, `订单导出-当前筛选-${Date.now()}.csv`);
                toast("已导出当前筛选结果", "success");
              }}
            >
              导出当前筛选结果
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayOrders = orders.filter((o) => (scope === ALL_STORES || o.storeId === scope) && new Date(o.orderTime) >= today);
                exportOrdersToCsv(todayOrders, `每日订单报表-${new Date().toISOString().slice(0, 10)}.csv`);
                toast("已导出每日订单报表", "success");
              }}
            >
              导出每日订单报表
            </Button>
          </div>
        </div>

        <DataTable
          columns={[
            {
              key: "select",
              label: "",
              render: (row) => (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(row.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSelect(row.id);
                  }}
                />
              ),
            },
            { key: "orderNumber", label: "订单号" },
            { key: "platform", label: "平台", render: (r) => getOrderPlatformLabel(r.platform) },
            { key: "storeName", label: "店铺" },
            { key: "buyer", label: "买家" },
            { key: "product", label: "商品" },
            { key: "sku", label: "SKU" },
            { key: "quantity", label: "数量" },
            { key: "amount", label: "订单金额", render: (r) => `¥${r.amount}` },
            { key: "paymentStatus", label: "支付状态", render: (r) => getPaymentStatusLabel(r.paymentStatus) },
            {
              key: "orderStatus",
              label: "订单状态",
              render: (r) => <StatusPill tone={ORDER_STATUS_TONE[r.orderStatus] ?? "neutral"}>{getOrderStatusLabel(r.orderStatus)}{r.abnormal ? " ⚠" : ""}</StatusPill>,
            },
            { key: "shippingStatus", label: "物流状态", render: (r) => getShippingStatusLabel(r.shippingStatus) },
            { key: "courierCompany", label: "快递公司", render: (r) => r.courierCompany ?? "—" },
            { key: "trackingNumber", label: "运单号", render: (r) => r.trackingNumber ?? "—" },
            { key: "orderTime", label: "下单时间", render: (r) => new Date(r.orderTime).toLocaleString("zh-CN") },
            {
              key: "actions",
              label: "操作",
              render: (r) => (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button className="fdr-btn fdr-btn--ghost fdr-btn--sm" onClick={(e) => { e.stopPropagation(); setDetailOrder(r); }}>查看订单</button>
                  <button className="fdr-btn fdr-btn--ghost fdr-btn--sm" onClick={(e) => { e.stopPropagation(); setLabelOrders([r]); }}>打印面单</button>
                  {r.orderStatus === "pending_shipment" ? (
                    <button className="fdr-btn fdr-btn--ghost fdr-btn--sm" onClick={(e) => { e.stopPropagation(); setShipOrder(r); }}>标记发货</button>
                  ) : null}
                  {r.trackingNumber ? (
                    <button className="fdr-btn fdr-btn--ghost fdr-btn--sm" onClick={(e) => { e.stopPropagation(); toast(`（演示）运单 ${r.trackingNumber} 当前状态：${getShippingStatusLabel(r.shippingStatus)}`, "success"); }}>查看物流</button>
                  ) : null}
                  {r.orderStatus === "refund_after_sales" ? (
                    <button className="fdr-btn fdr-btn--ghost fdr-btn--sm" onClick={(e) => { e.stopPropagation(); navigate("approvalCenter"); }}>处理退款/售后</button>
                  ) : null}
                </div>
              ),
            },
          ]}
          rows={filteredOrders}
          emptyMessage="当前筛选条件下暂无订单"
        />
      </div>

      <OrderDetailModal order={detailOrder} open={!!detailOrder} onClose={() => setDetailOrder(null)} />
      <ShipModal order={shipOrder} open={!!shipOrder} onClose={() => setShipOrder(null)} onConfirm={handleShipConfirm} />
      <ShippingLabelModal orders={labelOrders} open={!!labelOrders} onClose={() => setLabelOrders(null)} />
    </div>
  );
}
