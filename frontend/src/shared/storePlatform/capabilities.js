import { AccessMode, CapabilityClass } from "./types.js";

/**
 * StorePlatformAdapter 每个方法对应的能力分类——唯一真相来源，
 * 页面/Store Connection Center/Real Operation Workbench 都从这里
 * 读取，不允许各页面各自判断"这个操作是不是写操作"。
 */
export const ADAPTER_METHOD_CAPABILITY = Object.freeze({
  connect: CapabilityClass.READ,
  disconnect: CapabilityClass.READ,
  validateCredentials: CapabilityClass.READ,
  refreshAuthorization: CapabilityClass.READ,
  getStoreProfile: CapabilityClass.READ,
  listProducts: CapabilityClass.READ,
  getProduct: CapabilityClass.READ,
  listOrders: CapabilityClass.READ,
  getOrder: CapabilityClass.READ,
  listCustomers: CapabilityClass.READ,
  getCustomer: CapabilityClass.READ,
  getInventory: CapabilityClass.READ,
  getMetrics: CapabilityClass.READ,
  createProductDraft: CapabilityClass.WRITE,
  updateProductDraft: CapabilityClass.WRITE,
  publishProduct: CapabilityClass.APPROVAL_REQUIRED,
  updatePrice: CapabilityClass.APPROVAL_REQUIRED,
  updateInventory: CapabilityClass.WRITE,
  createCampaignDraft: CapabilityClass.WRITE,
});

export function capabilityClassFor(methodName) {
  return ADAPTER_METHOD_CAPABILITY[methodName] ?? CapabilityClass.UNSUPPORTED;
}

/**
 * 某个接入模式下，某个能力分类是否允许直接执行（不代表"允许自动
 * 执行"——WRITE/APPROVAL_REQUIRED 在 LIVE_APPROVAL 模式下永远只能
 * 走"生成草稿 + 人工确认"，不存在自动直接执行的路径）。
 * @param {string} accessMode
 * @param {string} capabilityClass
 */
export function isCapabilityAllowedInMode(accessMode, capabilityClass) {
  if (capabilityClass === CapabilityClass.UNSUPPORTED) return false;
  if (capabilityClass === CapabilityClass.READ) {
    return accessMode !== undefined && accessMode !== null;
  }
  if (accessMode === AccessMode.MOCK || accessMode === AccessMode.SANDBOX) {
    return true;
  }
  if (accessMode === AccessMode.LIVE_READONLY) {
    return false;
  }
  if (accessMode === AccessMode.LIVE_APPROVAL) {
    return true;
  }
  if (accessMode === AccessMode.LIVE_AUTOMATED) {
    return capabilityClass === CapabilityClass.WRITE;
  }
  return false;
}

/**
 * 某次写操作在当前模式下，是否必须先经过人工审批才能真正执行到
 * 平台侧。LIVE_APPROVAL 模式下一切写操作都要审批；LIVE_AUTOMATED
 * 模式下 APPROVAL_REQUIRED 类别（如发布商品、改价）仍然强制审批。
 * @param {string} accessMode
 * @param {string} capabilityClass
 */
export function requiresApproval(accessMode, capabilityClass) {
  if (capabilityClass === CapabilityClass.READ || capabilityClass === CapabilityClass.UNSUPPORTED) {
    return false;
  }
  if (accessMode === AccessMode.MOCK || accessMode === AccessMode.SANDBOX) {
    return false;
  }
  if (accessMode === AccessMode.LIVE_APPROVAL) {
    return true;
  }
  if (accessMode === AccessMode.LIVE_AUTOMATED) {
    return capabilityClass === CapabilityClass.APPROVAL_REQUIRED;
  }
  return true;
}
