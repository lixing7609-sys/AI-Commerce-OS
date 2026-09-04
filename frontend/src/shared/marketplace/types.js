/**
 * AI 能力市场（Marketplace）领域模型（阶段：M8 Founder Product Shell
 * Consolidation §9/§10）。Marketplace 不是第五个产品端——它是跨
 * Founder/Operator/Studio/Operator Cloud 四端共享的一个模块，三个
 * 消费/生产角色共用同一套 CapabilityPackage 数据，只是按
 * `targetProducts` 和 `viewMode` 过滤展示范围，绝不允许某一端另外
 * 发明一套不兼容的能力包结构。
 *
 * 本阶段不要求真实支付或完整开发者结算——领域模型和信息架构必须
 * 正确，但 install/purchase 等操作都是本地 mock 状态变更。
 */

/** @readonly @enum {string} */
export const PackageType = Object.freeze({
  AGENT: "AGENT",
  PROMPT: "PROMPT",
  SKILL: "SKILL",
  WORKFLOW: "WORKFLOW",
  KNOWLEDGE: "KNOWLEDGE",
  CONNECTOR: "CONNECTOR",
  POLICY: "POLICY",
  TEMPLATE: "TEMPLATE",
  /** 完整 AI 经营方案或内容生产方案的打包单元 */
  BUNDLE: "BUNDLE",
});

/** 能力包面向哪个产品端消费——不是"运行在哪"，是"谁能看到/安装它"。 */
export const TargetProduct = Object.freeze({
  OPERATOR: "operator",
  STUDIO: "studio",
  /** 两端都适用，例如通用客服话术知识库 */
  SHARED: "shared",
});

/** @readonly @enum {string} */
export const ReviewState = Object.freeze({
  DRAFT: "draft",
  SUBMITTED: "submitted",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  REJECTED: "rejected",
});

/** @readonly @enum {string} */
export const ReleaseChannel = Object.freeze({
  DRAFT: "draft",
  CANARY: "canary",
  BETA: "beta",
  STABLE: "stable",
});

/** @readonly @enum {string} */
export const InstallationState = Object.freeze({
  NOT_INSTALLED: "not_installed",
  INSTALLING: "installing",
  INSTALLED: "installed",
  UPDATE_AVAILABLE: "update_available",
  DISABLED: "disabled",
  UNINSTALLING: "uninstalling",
});

/** @readonly @enum {string} */
export const RiskLevel = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});

/**
 * @typedef {Object} PackageVersion
 * @property {string} version           语义化版本号，如 "1.2.0"
 * @property {string} releaseChannel    typeof ReleaseChannel[keyof typeof ReleaseChannel]
 * @property {string} changelog
 * @property {string} publishedAt
 * @property {boolean} isCurrent
 */

/**
 * @typedef {Object} PackageDependency
 * @property {string} packageId
 * @property {string} name
 * @property {string} versionRange      如 ">=1.0.0"
 * @property {boolean} optional
 */

/**
 * @typedef {Object} PackageCompatibility
 * @property {string[]} targetProducts   typeof TargetProduct 的值集合
 * @property {string[]} minDeviceModel   兼容的最低设备型号列表，如 ["Mac mini M2"]
 * @property {string[]} requiredConnectors
 * @property {string[]} requiredModelProviders
 */

/**
 * @typedef {Object} LicensePolicy
 * @property {"per_device"|"per_operator"|"per_seat"|"unlimited"} scope
 * @property {number|null} seatLimit
 * @property {boolean} transferable
 * @property {string} termsSummary
 */

/**
 * @typedef {Object} PricingPolicy
 * @property {"free"|"one_time"|"subscription"|"usage_based"} model
 * @property {number} priceRmb           一次性或订阅单价，free 时为 0
 * @property {"month"|"year"|null} billingCycle
 * @property {number} revenueShareToDeveloper   分成比例 0-1，平台自制能力为 0
 */

/**
 * @typedef {Object} TokenPolicy
 * 能力包自身消耗 Token 的计费方式——与 shared/storePlatform 的经营
 * Token 账本是同一套 Token，这里只描述"这个能力包会不会额外收费"。
 * @property {boolean} consumesToken
 * @property {number|null} estimatedTokenPerRun
 * @property {string|null} note
 */

/**
 * @typedef {Object} DeveloperProfile
 * @property {string} developerId
 * @property {string} displayName
 * @property {"platform"|"verified_third_party"|"pending_third_party"} tier
 * @property {string} contactEmail
 * @property {string} joinedAt
 */

/**
 * @typedef {Object} EvaluationSummary
 * Founder 侧真实验证摘要——引用 shared/storePlatform 的同步记录 /
 * Evaluation Center 的评测结果，不在这里重复存储评测细节。
 * @property {number|null} evaluationScore   0-100，未评测为 null
 * @property {number} verifiedStoreCount     已在真实店铺跑过的数量（诚实计数，未验证为 0）
 * @property {number} verifiedContentProjectCount
 * @property {string[]} verifiedScenarios    如 ["MODE_MOCK 演练", "MODE_LIVE_READONLY 只读同步"]
 * @property {string|null} lastVerifiedAt
 */

/**
 * @typedef {Object} CapabilityPackage
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {string} summary
 * @property {string} description
 * @property {typeof PackageType[keyof typeof PackageType]} packageType
 * @property {string[]} targetProducts        typeof TargetProduct 的值集合，BUNDLE 常常两端都有
 * @property {string[]} categories            展示分类标签，见 CATEGORY_LABELS
 * @property {DeveloperProfile} developer
 * @property {string} currentVersion
 * @property {typeof ReleaseChannel[keyof typeof ReleaseChannel]} releaseChannel
 * @property {typeof ReviewState[keyof typeof ReviewState]} status
 * @property {PricingPolicy} pricingModel
 * @property {LicensePolicy} licensePolicy
 * @property {TokenPolicy} tokenPolicy
 * @property {PackageDependency[]} dependencies
 * @property {string[]} modelRequirements     如 ["gpt-4o", "claude-sonnet-5"]（至少满足一个）
 * @property {string[]} connectorRequirements
 * @property {PackageCompatibility} deviceRequirements
 * @property {string[]} permissions           如 ["order.read", "product.write"]
 * @property {typeof RiskLevel[keyof typeof RiskLevel]} riskLevel
 * @property {EvaluationSummary} evaluationSummary
 * @property {PackageVersion[]} versions
 * @property {number} installCount            诚实计数——mock 环境下就是本地历史安装次数
 * @property {number|null} rating             0-5，无评价为 null
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/** UI 展示用分类标签——Operator/Studio 各自的主要分类清单（§9）。 */
export const OPERATOR_CATEGORIES = Object.freeze([
  { key: "ai_staff", label: "AI 员工" },
  { key: "product_capability", label: "商品能力" },
  { key: "store_capability", label: "店铺能力" },
  { key: "customer_service_capability", label: "客服能力" },
  { key: "order_capability", label: "订单能力" },
  { key: "advertising_capability", label: "广告能力" },
  { key: "profit_capability", label: "利润能力" },
  { key: "supply_chain_capability", label: "供应链能力" },
  { key: "live_commerce_capability", label: "直播带货能力" },
  { key: "industry_knowledge", label: "行业知识库" },
  { key: "full_solution", label: "完整经营方案" },
]);

export const STUDIO_CATEGORIES = Object.freeze([
  { key: "topic_agent", label: "选题 Agent" },
  { key: "copywriting_agent", label: "文案 Agent" },
  { key: "script_agent", label: "脚本 Agent" },
  { key: "short_video_capability", label: "短视频能力" },
  { key: "short_drama_capability", label: "AI 短剧能力" },
  { key: "storyboard_capability", label: "分镜能力" },
  { key: "image_capability", label: "图片能力" },
  { key: "video_capability", label: "视频能力" },
  { key: "voiceover_capability", label: "配音能力" },
  { key: "editing_capability", label: "剪辑能力" },
  { key: "digital_human_capability", label: "数字人能力" },
  { key: "ai_live_capability", label: "AI 直播能力" },
  { key: "matrix_operation_capability", label: "矩阵运营能力" },
  { key: "traffic_capability", label: "流量能力" },
  { key: "content_growth_solution", label: "内容增长方案" },
]);

export function categoryLabel(key) {
  const found = [...OPERATOR_CATEGORIES, ...STUDIO_CATEGORIES].find((c) => c.key === key);
  return found?.label ?? key;
}
