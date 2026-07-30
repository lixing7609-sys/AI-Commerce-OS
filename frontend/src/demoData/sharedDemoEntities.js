/**
 * Founder Master Edition V1.0 中文框架审查版 —— 全局共享演示实体层。
 *
 * 目的：同一个实体（同一笔订单、同一台设备……）在不同页面出现时，
 * 必须显示相同的编号/金额/状态，产品负责人逐页检查时才能确认
 * "页面之间的关系是否合理"。
 *
 * 本文件不重新发明一套数据——仓库里已经有大量成熟、内部一致的
 * 演示数据模块（console/mock/*.js、studio/mock/*.js、cloud/mock/
 * cloudMock.js），这里只是把"哪个具体记录是跨页面锚点"显式定下来，
 * 并提供统一的 getter，其余模块自己的完整列表数据（比如订单中心的
 * 全部订单）继续从各自原来的 mock 文件读取，不受影响。
 */
import { DEMO_STORES, getDemoStores } from "../console/mock/storesMock.js";
import { getOrders } from "../console/mock/orderMock.js";
import { getProducts } from "../console/mock/productMock.js";
import { getStudioState } from "../studio/mock/studioMock.js";
import { SHARED_DEMO_DEVICE_ID, getCloudState } from "../cloud/mock/cloudMock.js";

/** 店铺 —— 跨 Founder/Operator 多个模块共用同一份店铺清单。 */
export { DEMO_STORES, getDemoStores };

/** 商品锚点：「便携折叠加湿器」SKU-HUM-002，抖音店A，库存 0。
 * 已经在今日总览的补货建议、商品中心里同时出现，这里只是把它标记
 * 为"审查锚点"，供经营验证/风险中心等新页面引用同一条记录。 */
export function getFeaturedProduct() {
  return getProducts().find((p) => p.sku === "SKU-HUM-002") ?? getProducts()[0] ?? null;
}

/** 订单锚点：取订单仓库里的第一条记录。订单仓库是有状态的本地
 * repository（console/mock/orderMock.js 的 createLocalRepository），
 * 同一次会话内多次调用 getOrders() 返回同一批对象，因此"锚点订单"
 * 在本次会话内的所有页面里都是同一条记录、同一个订单号。 */
export function getFeaturedOrder() {
  const orders = getOrders();
  return orders.find((o) => o.paymentStatus === "refunding") ?? orders[0] ?? null;
}

/** 客户锚点：从锚点订单反查买家，客户中心/数据中心/风险中心引用
 * 同一个买家信息，而不是各自生成一个不相关的示例客户。 */
export function getFeaturedCustomer() {
  const order = getFeaturedOrder();
  if (!order) return null;
  return { name: order.buyerName ?? order.buyer ?? "未知买家", storeId: order.storeId, phone: order.buyerPhone ?? null };
}

/** 内容项目锚点：红果短剧《重生后我接管了老板的公司》EP13-16
 * （proj-7）—— Studio 秘书、AI 短剧、内容验证等页面共用同一个项目。 */
export function getFeaturedContentProject() {
  const { contentProjects } = getStudioState();
  return contentProjects.find((p) => p.projectId === "proj-7") ?? contentProjects[0] ?? null;
}

/** 设备/Operator 锚点：mac-mini-op-0001 / 星辰家居贸易 —— 云端状态、
 * 设备管理、OTA更新、许可证、Token中心、系统监控、日志中心共用。 */
export function getFeaturedDevice() {
  const { devices } = getCloudState();
  return devices.find((d) => d.id === SHARED_DEMO_DEVICE_ID) ?? devices[0] ?? null;
}
export function getFeaturedOperatorFleetEntry() {
  const { operators } = getCloudState();
  const device = getFeaturedDevice();
  return operators.find((o) => o.id === device?.operatorId) ?? operators[0] ?? null;
}
export { SHARED_DEMO_DEVICE_ID };

/**
 * 以下实体在仓库里还没有独立的跨页面锚点来源，属于本轮中文框架
 * 审查新增——决策/风险/通知三类已经有 founderWorkspace/
 * workspaceEntities.js 统一模型（见该文件），这里补齐 Agent/
 * Workflow 两类的审查锚点，供 AI 能力中心引用。
 */
export const FEATURED_AGENT = {
  id: "agent-secretary-01",
  name: "补货建议 Agent",
  category: "经营决策",
  scope: "operator",
  status: "running",
  version: "v2.3.0",
  successRate: 0.94,
  costToday: 12.4,
};

export const FEATURED_WORKFLOW = {
  id: "workflow-restock-01",
  name: "库存预警 → 补货建议 → Founder 审批",
  scope: "operator",
  status: "active",
  lastRunAt: new Date(Date.now() - 3600_000).toISOString(),
  successRate: 0.98,
};
