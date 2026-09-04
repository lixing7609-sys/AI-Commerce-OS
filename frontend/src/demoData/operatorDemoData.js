/**
 * Operator 实验室（13 页）演示数据入口。店铺/商品/客户/订单/广告的
 * 完整列表继续读各自原有 mock（console/mock/storesMock.js、
 * productMock.js、orderMock.js 等，已经互相共享 storeId），这里只
 * 导出跨页面审查锚点（同一笔订单要在订单中心/财务与利润/数据中心/
 * Operator秘书/风险中心显示一致）。
 */
export {
  DEMO_STORES,
  getDemoStores,
  getFeaturedOrder,
  getFeaturedProduct,
  getFeaturedCustomer,
} from "./sharedDemoEntities.js";

/** Operator 经营设置只展示经营者能理解的平台名称——不得出现 API/
 * Webhook/NAS/数据库连接串等技术信息（Charter Connector Principle）。 */
export const OPERATOR_FACING_PLATFORMS = [
  { key: "taobao", label: "淘宝" },
  { key: "tmall", label: "天猫" },
  { key: "douyin", label: "抖音电商" },
  { key: "xiaohongshu", label: "小红书" },
  { key: "pinduoduo", label: "拼多多" },
  { key: "jd", label: "京东" },
];
