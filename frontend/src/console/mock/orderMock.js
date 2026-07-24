import { createLocalRepository, nextMockId, tagDemo } from "./mockUtils.js";
import { DEMO_STORES } from "./storesMock.js";

/**
 * 订单中心演示数据（阶段 Founder UX Review V3，P0-8 新增模块）。
 * 没有真实订单后端，orderNumber/buyer/product 等全部是演示数据，
 * 但主要交互（筛选、标记发货、打印面单、导出）必须真实可用。
 */

const PAYMENT_STATUS_LABEL = { paid: "已支付", unpaid: "未支付", refunding: "退款中" };
const ORDER_STATUS_LABEL = {
  pending_shipment: "待发货",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
  refund_after_sales: "退款/售后",
};
const SHIPPING_STATUS_LABEL = { not_shipped: "未发货", in_transit: "运输中", delivered: "已签收" };

export function getPaymentStatusLabel(status) {
  return PAYMENT_STATUS_LABEL[status] ?? status;
}
export function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABEL[status] ?? status;
}
export function getShippingStatusLabel(status) {
  return SHIPPING_STATUS_LABEL[status] ?? status;
}

const PLATFORM_LABEL = { douyin: "抖音", xiaohongshu: "小红书", taobao: "淘宝", shopify: "Shopify", amazon: "Amazon" };
export function getOrderPlatformLabel(platform) {
  return PLATFORM_LABEL[platform] ?? platform;
}

function maskPhone(phone) {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

const COURIERS = ["顺丰速运", "中通快递", "圆通速递", "韵达快递"];

function buildOrder({ idx, storeId, platform, product, sku, amount, orderStatus, paymentStatus, shippingStatus, hoursAgo, abnormal }) {
  const store = DEMO_STORES.find((s) => s.id === storeId);
  const hasTracking = shippingStatus !== "not_shipped";
  return {
    id: nextMockId("ord"),
    orderNumber: `${platform.slice(0, 2).toUpperCase()}${Date.now().toString().slice(-6)}${idx}`,
    platform,
    storeId,
    storeName: store.name,
    buyer: `买家${1000 + idx}`,
    buyerPhone: maskPhone(`138${String(10000000 + idx).slice(0, 8)}`),
    recipient: `买家${1000 + idx}`,
    deliveryAddress: `${["广东省深圳市", "浙江省杭州市", "上海市"][idx % 3]}示范路 ${idx} 号`,
    product,
    sku,
    quantity: 1 + (idx % 3),
    amount,
    paymentStatus,
    orderStatus,
    shippingStatus,
    courierCompany: hasTracking ? COURIERS[idx % COURIERS.length] : null,
    trackingNumber: hasTracking ? `SF${100000000000 + idx}` : null,
    orderTime: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
    abnormal: !!abnormal,
  };
}

function seedOrders() {
  const s1 = DEMO_STORES[0].id;
  const s2 = DEMO_STORES[1].id;
  const s3 = DEMO_STORES[2].id;
  return [
    buildOrder({ idx: 1, storeId: s1, platform: "douyin", product: "夏季轻薄防晒衣", sku: "SKU-SUN-001", amount: 129, orderStatus: "completed", paymentStatus: "paid", shippingStatus: "delivered", hoursAgo: 60 }),
    buildOrder({ idx: 2, storeId: s1, platform: "douyin", product: "夏季轻薄防晒衣", sku: "SKU-SUN-001", amount: 258, orderStatus: "shipped", paymentStatus: "paid", shippingStatus: "in_transit", hoursAgo: 20 }),
    buildOrder({ idx: 3, storeId: s1, platform: "douyin", product: "LED灯带套装 3米", sku: "SKU-LED-005", amount: 45, orderStatus: "pending_shipment", paymentStatus: "paid", shippingStatus: "not_shipped", hoursAgo: 30, abnormal: true }),
    buildOrder({ idx: 4, storeId: s1, platform: "taobao", product: "便携折叠加湿器", sku: "SKU-HUM-002", amount: 89, orderStatus: "pending_shipment", paymentStatus: "paid", shippingStatus: "not_shipped", hoursAgo: 4 }),
    buildOrder({ idx: 5, storeId: s1, platform: "douyin", product: "夏季百搭帆布鞋", sku: "SKU-SHO-004", amount: 159, orderStatus: "cancelled", paymentStatus: "unpaid", shippingStatus: "not_shipped", hoursAgo: 50 }),
    buildOrder({ idx: 6, storeId: s1, platform: "douyin", product: "夏季轻薄防晒衣", sku: "SKU-SUN-001", amount: 129, orderStatus: "refund_after_sales", paymentStatus: "refunding", shippingStatus: "delivered", hoursAgo: 70 }),
    buildOrder({ idx: 7, storeId: s2, platform: "taobao", product: "男士休闲皮鞋", sku: "SKU-SHO-101", amount: 279, orderStatus: "completed", paymentStatus: "paid", shippingStatus: "delivered", hoursAgo: 90 }),
    buildOrder({ idx: 8, storeId: s2, platform: "taobao", product: "男士休闲皮鞋", sku: "SKU-SHO-101", amount: 558, orderStatus: "shipped", paymentStatus: "paid", shippingStatus: "in_transit", hoursAgo: 15 }),
    buildOrder({ idx: 9, storeId: s2, platform: "taobao", product: "四件套家纺套件", sku: "SKU-HOM-102", amount: 199, orderStatus: "pending_shipment", paymentStatus: "paid", shippingStatus: "not_shipped", hoursAgo: 26, abnormal: true }),
    buildOrder({ idx: 10, storeId: s2, platform: "taobao", product: "四件套家纺套件", sku: "SKU-HOM-102", amount: 199, orderStatus: "pending_shipment", paymentStatus: "paid", shippingStatus: "not_shipped", hoursAgo: 2 }),
    buildOrder({ idx: 11, storeId: s3, platform: "xiaohongshu", product: "保湿精华面霜", sku: "SKU-BEA-201", amount: 219, orderStatus: "completed", paymentStatus: "paid", shippingStatus: "delivered", hoursAgo: 100 }),
    buildOrder({ idx: 12, storeId: s3, platform: "xiaohongshu", product: "保湿精华面霜", sku: "SKU-BEA-201", amount: 438, orderStatus: "shipped", paymentStatus: "paid", shippingStatus: "in_transit", hoursAgo: 10 }),
    buildOrder({ idx: 13, storeId: s3, platform: "xiaohongshu", product: "无线降噪耳机 Pro", sku: "SKU-AUD-003", amount: 399, orderStatus: "pending_shipment", paymentStatus: "paid", shippingStatus: "not_shipped", hoursAgo: 3 }),
    buildOrder({ idx: 14, storeId: s3, platform: "xiaohongshu", product: "保湿精华面霜", sku: "SKU-BEA-201", amount: 219, orderStatus: "refund_after_sales", paymentStatus: "refunding", shippingStatus: "delivered", hoursAgo: 40 }),
  ];
}

const repository = createLocalRepository("orderCenter.orders", seedOrders);

export function getOrders() {
  return repository.get();
}

export function getStoreOrderStats(storeId) {
  const orders = storeId ? repository.get().filter((o) => o.storeId === storeId) : repository.get();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOrders = orders.filter((o) => new Date(o.orderTime) >= today);
  const stats = {
    totalOrders: orders.length,
    paidOrders: orders.filter((o) => o.paymentStatus === "paid").length,
    pendingShipment: orders.filter((o) => o.orderStatus === "pending_shipment").length,
    shipped: orders.filter((o) => o.orderStatus === "shipped").length,
    completed: orders.filter((o) => o.orderStatus === "completed").length,
    cancelled: orders.filter((o) => o.orderStatus === "cancelled").length,
    refundAfterSales: orders.filter((o) => o.orderStatus === "refund_after_sales").length,
    todayGmv: todayOrders.filter((o) => o.paymentStatus === "paid").reduce((sum, o) => sum + o.amount, 0),
    abnormalOrders: orders.filter((o) => o.abnormal).length,
  };
  const paidOrders = orders.filter((o) => o.paymentStatus === "paid");
  stats.avgOrderValue = paidOrders.length ? Math.round(paidOrders.reduce((sum, o) => sum + o.amount, 0) / paidOrders.length) : 0;
  return tagDemo(stats);
}

export function markOrderShipped(orderId, courierCompany, trackingNumber) {
  return repository.update((orders) =>
    orders.map((o) =>
      o.id === orderId
        ? { ...o, orderStatus: "shipped", shippingStatus: "in_transit", courierCompany, trackingNumber }
        : o
    )
  );
}

const CSV_COLUMNS = [
  ["orderNumber", "订单号"],
  ["platform", "平台"],
  ["storeName", "店铺"],
  ["buyer", "买家"],
  ["product", "商品"],
  ["sku", "SKU"],
  ["quantity", "数量"],
  ["amount", "订单金额"],
  ["paymentStatus", "支付状态"],
  ["orderStatus", "订单状态"],
  ["shippingStatus", "物流状态"],
  ["courierCompany", "快递公司"],
  ["trackingNumber", "运单号"],
  ["orderTime", "下单时间"],
];

function toCsvValue(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * 生成 CSV 并触发浏览器真实下载——不是只弹一个"导出成功"提示。
 */
export function exportOrdersToCsv(orders, filename) {
  const header = CSV_COLUMNS.map(([, label]) => label).join(",");
  const rows = orders.map((o) =>
    CSV_COLUMNS.map(([key]) => {
      if (key === "platform") return toCsvValue(getOrderPlatformLabel(o.platform));
      if (key === "paymentStatus") return toCsvValue(getPaymentStatusLabel(o.paymentStatus));
      if (key === "orderStatus") return toCsvValue(getOrderStatusLabel(o.orderStatus));
      if (key === "shippingStatus") return toCsvValue(getShippingStatusLabel(o.shippingStatus));
      if (key === "orderTime") return toCsvValue(new Date(o.orderTime).toLocaleString("zh-CN"));
      return toCsvValue(o[key]);
    }).join(",")
  );
  const csv = "﻿" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

