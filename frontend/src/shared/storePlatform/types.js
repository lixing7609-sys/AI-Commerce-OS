/**
 * 第一家真实店铺接入的领域模型（阶段：M8 Founder First Real Store
 * Live Pilot）。JSDoc typedef only（本仓库无 TypeScript 构建），但
 * 字段形状是未来接入真实数据库/后端的边界——Founder Operator Lab
 * 只应该依赖这里定义的形状，不应该直接依赖某个具体平台的原始
 * 返回结构。
 *
 * 接入模式（AccessMode）严格分层，新接入店铺的默认值恒为
 * LIVE_READONLY（见 storeConnectionRepository.js 的 addStore()）：
 *   MOCK            用 Mock 数据，不连接任何真实/沙箱接口
 *   SANDBOX         调用平台沙箱/测试店铺
 *   LIVE_READONLY   连接真实店铺，只读，不执行任何写操作
 *   LIVE_APPROVAL   连接真实店铺，写操作必须人工审批后才执行
 *   LIVE_AUTOMATED  在预授权预算/风险策略范围内自动执行——本阶段
 *                   不对任何店铺开放，见 featureFlags 里的说明
 */
export const AccessMode = Object.freeze({
  MOCK: "MODE_MOCK",
  SANDBOX: "MODE_SANDBOX",
  LIVE_READONLY: "MODE_LIVE_READONLY",
  LIVE_APPROVAL: "MODE_LIVE_APPROVAL",
  LIVE_AUTOMATED: "MODE_LIVE_AUTOMATED",
});

export const DEFAULT_ACCESS_MODE_FOR_NEW_STORE = AccessMode.LIVE_READONLY;

/**
 * 能力分类——StorePlatformAdapter 的每一个方法都必须归到下面四类
 * 之一，UI 据此决定是否需要审批、是否直接禁用、是否根本不支持。
 * @readonly @enum {string}
 */
export const CapabilityClass = Object.freeze({
  READ: "read",                         // 只读，任何 LIVE_* 模式下都可执行
  WRITE: "write",                       // 写操作，仅 LIVE_APPROVAL/LIVE_AUTOMATED 且审批通过后可执行
  APPROVAL_REQUIRED: "approval_required", // 即使在 LIVE_AUTOMATED 下也强制要求人工审批（高风险写操作）
  UNSUPPORTED: "unsupported",           // 当前平台/适配器不支持
});

/**
 * @typedef {Object} PlatformAuthorization
 * 凭证状态——只暴露状态，永不包含真实密钥/Token/Cookie 原文。
 * @property {string} storeId
 * @property {string} platform
 * @property {"not_configured"|"configured"|"invalid"|"expired"} credentialStatus
 * @property {string[]} authorizedScopes
 * @property {string|null} expiresAt
 * @property {string|null} lastVerifiedAt
 * @property {string[]} missingRequirements   还需要用户提供哪些开放平台信息
 */

/**
 * @typedef {Object} SyncCursor
 * @property {string} resource            如 "products" | "orders" | "customers" | "inventory"
 * @property {string|null} cursor          平台分页游标，不透明字符串
 * @property {string|null} lastSyncedAt
 */

/**
 * @typedef {Object} SyncError
 * @property {string} errorId
 * @property {string} resource
 * @property {string} recordRef            出错记录的引用（不是完整原始数据）
 * @property {string} message
 * @property {number} retryCount
 * @property {string} occurredAt
 */

/**
 * @typedef {Object} SyncJob
 * @property {string} jobId
 * @property {string} storeId
 * @property {"full"|"incremental"} syncType
 * @property {string[]} resources
 * @property {"queued"|"running"|"partially_failed"|"succeeded"|"failed"} status
 * @property {number} recordsProcessed
 * @property {number} recordsFailed
 * @property {SyncCursor[]} cursors
 * @property {SyncError[]} errors
 * @property {string} startedAt
 * @property {string|null} completedAt
 */

/**
 * @typedef {Object} Store
 * 店铺接入/同步状态视图——`shared/domainTypes.js` 已有的 Store
 * typedef 是商域实体（storeId/businessUnitId/platform/name），这里
 * 的 Store 是同一家店铺在"平台接入"维度的状态投影（接入模式/连接
 * 状态/同步状态/写权限），两者用同一个 storeId 关联，不是重复定义。
 * @property {string} storeId
 * @property {string} name
 * @property {string} platform
 * @property {string} platformStoreId
 * @property {typeof AccessMode[keyof typeof AccessMode]} accessMode
 * @property {"disconnected"|"pending_authorization"|"connected"|"error"} connectionStatus
 * @property {string|null} lastSyncedAt
 * @property {"idle"|"syncing"|"error"|"paused"} syncStatus
 * @property {boolean} writeOperationsAllowed
 * @property {boolean} isRealData             false = 完全是演示数据；true = 至少 profile 来自真实/沙箱来源
 */

/**
 * @typedef {Object} Product
 * @property {string} productId
 * @property {string} storeId
 * @property {string} title
 * @property {string} category
 * @property {number} price
 * @property {number} cost
 * @property {"draft"|"active"|"inactive"} status
 * @property {string} sourceRecordRef        平台原始记录引用，不携带完整原始 payload
 */

/**
 * @typedef {Object} ProductVariant
 * @property {string} variantId
 * @property {string} productId
 * @property {string} sku
 * @property {number} price
 * @property {number} inventory
 */

/**
 * @typedef {Object} InventoryRecord
 * @property {string} productId
 * @property {string|null} variantId
 * @property {number} available
 * @property {number} reserved
 * @property {string} asOf
 */

/**
 * @typedef {Object} Order
 * @property {string} orderId
 * @property {string} storeId
 * @property {string} status
 * @property {number} totalAmount
 * @property {string} placedAt
 */

/**
 * @typedef {Object} OrderItem
 * @property {string} orderId
 * @property {string} productId
 * @property {number} quantity
 * @property {number} unitPrice
 */

/**
 * @typedef {Object} Customer
 * @property {string} customerId
 * @property {string} storeId
 * @property {string} displayName        脱敏展示名，不是完整 PII
 * @property {number} totalOrders
 * @property {number} totalSpend
 */

/**
 * @typedef {Object} StoreMetric
 * @property {string} storeId
 * @property {string} date
 * @property {number} gmv
 * @property {number} orderCount
 * @property {number} refundAmount
 */

/**
 * @typedef {Object} StorePlatformAdapter
 * 平台适配层契约——页面永远只依赖这个接口，不直接绑定某个具体
 * 平台。每个方法的能力分类见 capabilityClassFor()（capabilities.js）。
 * @property {(storeId: string) => Promise<PlatformAuthorization>} connect
 * @property {(storeId: string) => Promise<void>} disconnect
 * @property {(storeId: string) => Promise<PlatformAuthorization>} validateCredentials
 * @property {(storeId: string) => Promise<PlatformAuthorization>} refreshAuthorization
 * @property {(storeId: string) => Promise<Store>} getStoreProfile
 * @property {(storeId: string, opts?: {cursor?: string}) => Promise<{items: Product[], nextCursor: string|null}>} listProducts
 * @property {(storeId: string, productId: string) => Promise<Product|null>} getProduct
 * @property {(storeId: string, opts?: {cursor?: string}) => Promise<{items: Order[], nextCursor: string|null}>} listOrders
 * @property {(storeId: string, orderId: string) => Promise<Order|null>} getOrder
 * @property {(storeId: string, opts?: {cursor?: string}) => Promise<{items: Customer[], nextCursor: string|null}>} listCustomers
 * @property {(storeId: string, customerId: string) => Promise<Customer|null>} getCustomer
 * @property {(storeId: string, productId: string) => Promise<InventoryRecord|null>} getInventory
 * @property {(storeId: string, date: string) => Promise<StoreMetric|null>} getMetrics
 * @property {(storeId: string, draft: Object) => Promise<{ok: boolean, requiresApproval: boolean, draftId?: string, error?: string}>} createProductDraft
 * @property {(storeId: string, draftId: string, patch: Object) => Promise<{ok: boolean, error?: string}>} updateProductDraft
 * @property {(storeId: string, draftId: string) => Promise<{ok: boolean, requiresApproval: boolean, error?: string}>} publishProduct
 * @property {(storeId: string, productId: string, price: number) => Promise<{ok: boolean, requiresApproval: boolean, error?: string}>} updatePrice
 * @property {(storeId: string, productId: string, quantity: number) => Promise<{ok: boolean, requiresApproval: boolean, error?: string}>} updateInventory
 * @property {(storeId: string, draft: Object) => Promise<{ok: boolean, requiresApproval: boolean, draftId?: string, error?: string}>} createCampaignDraft
 */
