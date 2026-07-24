import { tagDemo } from "./mockUtils.js";

/**
 * 演示店铺列表——供 Agent 工作室（Store 级配置隔离）、商品中心
 * （店铺→类目→商品层级）、订单中心、AI 秘书建议等多个模块共用同
 * 一份"店铺"上下文（阶段 Founder UX Review V3）。这是独立于真实
 * 店铺中心后端（services/shopApi.js）的演示数据——真实店铺中心
 * 管理的是实际连接的平台账号，这里刻意用固定命名的演示店铺，方便
 * 稳定地展示"不同店铺的 Agent 配置/商品/订单相互隔离"这一核心
 * 要求，不依赖开发环境里真实后端当前恰好有哪些店铺。
 */
export const DEMO_STORES = [
  { id: "store-1", name: "抖音店A", platform: "douyin" },
  { id: "store-2", name: "淘宝店A", platform: "taobao" },
  { id: "store-3", name: "小红书店A", platform: "xiaohongshu" },
];

export function getDemoStores() {
  return tagDemo(DEMO_STORES);
}

export function getStoreName(storeId) {
  return DEMO_STORES.find((s) => s.id === storeId)?.name ?? storeId;
}

export const ALL_STORES_ID = "all";
