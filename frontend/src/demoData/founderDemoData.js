/**
 * Founder 工作台（8 页）演示数据入口——统一从 sharedDemoEntities 转出
 * 审查锚点，加上 founderWorkspace/workspaceEntities.js 已有的决策/
 * 风险/内容验证/经营验证/通知统一实体模型（同一份 status 词表：
 * pending / in-review / approved / blocked / resolved）。
 */
export {
  getFeaturedOrder,
  getFeaturedProduct,
  getFeaturedCustomer,
  getFeaturedContentProject,
  getFeaturedDevice,
  getFeaturedOperatorFleetEntry,
} from "./sharedDemoEntities.js";

export {
  getDecisions,
  getRisks,
  getNotifications,
  getBusinessValidation,
  getContentValidation,
  getCloudStatusSummary,
  STATUS_LABEL,
  STATUS_TONE,
} from "../console/modules/founderWorkspace/workspaceEntities.js";
