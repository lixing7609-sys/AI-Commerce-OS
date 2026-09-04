/**
 * AI Commerce OS 四端共享核心领域概念（阶段：四端产品体系 V1 冻结）。
 *
 * 本仓库是纯 JS（无 TypeScript 构建链），所以这里不是真正的类型
 * 系统，而是用 JSDoc typedef 把"四端应该共用同一套核心领域概念"
 * 这件事写成可被编辑器读取、可被未来迁移到 TS 时直接复用的形式。
 * 每个 typedef 只声明字段形状，不包含任何 mock 数据或业务逻辑——
 * mock 数据在各端自己的 mock/ 目录下按需生成，但字段命名和含义
 * 必须以这里为准，不允许四端各自发明一套不兼容的同名概念。
 *
 * 关系（见 docs/01-reference-architecture/edition-architecture.md
 * 的"AI Commerce OS Four-Product Architecture"一节）：
 *
 *   Founder 产生候选能力包（CapabilityPackage）
 *     → Operator Cloud 审核、版本化（ReleasePackage）、灰度和分发
 *     → Operator 与 Studio 安装和使用
 *     → 运行摘要和成本数据（TokenUsage / ComputeUsageRecord）返回 Cloud
 *     → Founder 根据经营结果继续优化
 *
 * 不在这里定义的内容：
 *   - 分布式算力相关类型见 shared/distributedCompute/types.js
 *     （字段数量多、变化独立，单独一个文件更容易维护）。
 *   - 各端专属、不跨端共享的字段（例如 Studio 的短剧分镜结构）留在
 *     各自的 mock 文件里，不勉强塞进这里。
 */

/**
 * 四个正式产品端的标识——与 shared/editionPolicy.js 的 EDITIONS 同源
 * 但含义不同：那里是"当前登录到的是哪个端、能做什么操作"的运行时
 * 判定；这里是"一个领域对象属于/影响哪些产品端"的静态标注，例如
 * CapabilityPackage.producedBy = ProductApp.FOUNDER。
 * @readonly
 * @enum {string}
 */
export const ProductApp = Object.freeze({
  FOUNDER: "founder",
  CLOUD: "cloud",
  OPERATOR: "operator",
  STUDIO: "studio",
});

/**
 * @typedef {Object} CapabilityPackage
 * 由 Founder 产生的候选能力包——Agent/Prompt/Skill/Workflow/
 * Knowledge/Connector/UI/Capability 的打包单元，是 Operator Cloud
 * 审核与发布流程的输入。
 * @property {string} packageId
 * @property {"agent"|"prompt"|"skill"|"workflow"|"knowledge"|"connector"|"ui"|"capability"} packageType
 * @property {string} name
 * @property {string} version                      语义化版本号
 * @property {typeof ProductApp[keyof typeof ProductApp]} producedBy  固定为 ProductApp.FOUNDER
 * @property {string[]} targetApps                  预期安装到哪些端，如 ["operator","studio"]
 * @property {"draft"|"submitted"|"approved"|"rejected"} reviewStatus
 * @property {Object} validationSummary              Founder 侧的评测/回放摘要（评分、成本、风险标签）
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ReleasePackage
 * Operator Cloud 对一个或多个 CapabilityPackage 的版本化发布单元，
 * 承担审核通过后的灰度、分发、回滚。
 * @property {string} releaseId
 * @property {string[]} capabilityPackageIds
 * @property {string} channel                        如 "stable" | "beta" | "canary"
 * @property {string} targetGroup                     灰度目标分组描述
 * @property {number} rolloutProgress                 0-100
 * @property {"draft"|"in_progress"|"rolled_out"|"paused"|"failed"|"rolled_back"} status
 * @property {string} approvedBy
 * @property {string} publishedAt
 */

/**
 * @typedef {Object} Device
 * Operator Cloud 管理的已售出 Mac mini 设备。注意五个时间/状态概念
 * 必须分开，不能合并成一个字段（阶段"四端产品体系 V1"的硬性要求）：
 * @property {string} deviceId
 * @property {string} operatorId
 * @property {string} tenantId
 * @property {string} model
 * @property {string} systemVersion
 * @property {string} lastHeartbeatAt          最近一次心跳上报时间——不等于在线时长
 * @property {"online"|"offline"|"degraded"} onlineStatus   在线状态，可由心跳时间推断但独立存储
 * @property {string|null} currentSessionStartedAt  本次在线会话开始时间，离线时为 null
 * @property {number} uptimeSeconds             本次连续在线时长（秒），随会话增长，离线后归零
 * @property {number} availabilityRate           近 N 日设备可用率（0-1），独立统计口径，不由心跳实时推导
 */

/**
 * @typedef {Object} License
 * @property {string} licenseId
 * @property {string} operatorId
 * @property {string} packageTier
 * @property {string[]} entitlements
 * @property {string} expiresAt
 * @property {"active"|"suspended"|"expired"} status
 */

/**
 * @typedef {Object} TokenAccount
 * @property {string} accountId
 * @property {string} ownerId                 属于哪个 BusinessUnit/Operator/Studio 账户
 * @property {number} balance
 * @property {number} reserved
 * @property {number} consumed
 * @property {number} lowBalanceThreshold
 */

/**
 * @typedef {Object} TokenUsage
 * Cloud 侧的 Token 计量事件——各端消耗 Token 后回传的摘要，供 Cloud
 * 计量和 Founder 做成本验证。
 * @property {string} usageId
 * @property {string} accountId
 * @property {typeof ProductApp[keyof typeof ProductApp]} sourceApp
 * @property {string} modelId
 * @property {number} tokensConsumed
 * @property {number} costEstimate
 * @property {string} recordedAt
 */

/**
 * @typedef {Object} AgentDefinition
 * @property {string} agentId
 * @property {string} name
 * @property {string} category
 * @property {string} currentVersion
 * @property {typeof ProductApp[keyof typeof ProductApp]} ownerApp   通常是 ProductApp.FOUNDER
 */

/**
 * @typedef {Object} PromptVersion
 * @property {string} promptId
 * @property {number} version
 * @property {string} agentId
 * @property {"draft"|"published"|"deprecated"} status
 */

/**
 * @typedef {Object} SkillDefinition
 * @property {string} skillId
 * @property {string} name
 * @property {Object} inputSchema
 * @property {Object} outputSchema
 */

/**
 * @typedef {Object} WorkflowDefinition
 * @property {string} workflowId
 * @property {string} name
 * @property {string[]} steps
 */

/**
 * @typedef {Object} ConnectorDefinition
 * 面向经营者/内容创作者的产品文案统一用"平台连接"相关表述（Founder：
 * 电商平台连接器；Operator：店铺接入；Studio：平台账号/账号授权/
 * 发布连接；Cloud：Operator Cloud 连接）——Connector 这个内部代码
 * 词本身不对外暴露，见 edition-architecture.md 的产品语言章节。
 * @property {string} connectorId
 * @property {string} platform
 * @property {string} connectorType
 * @property {string} connectorVersion
 */

/**
 * @typedef {Object} BusinessUnit
 * 一个经营主体（可以对应一个 Operator 租户，也可以是 Studio 的一个
 * 内容/矩阵运营主体）。
 * @property {string} businessUnitId
 * @property {string} name
 * @property {typeof ProductApp[keyof typeof ProductApp]} primaryApp
 */

/**
 * @typedef {Object} Store
 * @property {string} storeId
 * @property {string} businessUnitId
 * @property {string} platform
 * @property {string} name
 */

/**
 * @typedef {Object} ContentProject
 * Studio 的内容生产单元——短剧/短视频/直播内容/广告素材/品牌栏目/
 * 矩阵内容共用同一个项目形状，用 contentType 区分。
 * @property {string} projectId
 * @property {string} name
 * @property {"shortdrama"|"shortvideo"|"live"|"ad_creative"|"brand_column"|"matrix_content"} contentType
 * @property {string|null} ipId
 * @property {string} stage                 选题/脚本/分镜/生成/剪辑/审核/发布/数据回收
 * @property {string} ownerAgentOrPerson
 * @property {string} expectedCompleteAt
 * @property {number} tokenUsed
 * @property {number} computeUnitsUsed
 * @property {number} budget
 * @property {"planning"|"in_production"|"in_review"|"published"|"archived"} status
 * @property {"ad_revenue"|"revenue_share"|"licensing"|"internal_marketing"} monetizationModel
 */

/**
 * @typedef {Object} ContentAsset
 * @property {string} assetId
 * @property {string} title
 * @property {string} assetType
 * @property {string|null} ipId
 * @property {"pending"|"cleared"|"licensed_out"|"disputed"} copyrightStatus
 * @property {boolean} reusable
 * @property {string} generationSource        生成来源（模型/Agent）
 * @property {number} tokenCost
 * @property {number} computeCost
 * @property {string[]} publishedPlatforms
 * @property {number} cumulativePlays
 * @property {number} cumulativeRevenue
 * @property {"internal_only"|"licensed"|"open"} commercialLicenseStatus
 */

/**
 * @typedef {Object} MatrixAccount
 * @property {string} accountId
 * @property {string} platform
 * @property {string} handle
 * @property {string} positioning              账号定位
 * @property {string|null} ipId
 * @property {number} followers
 * @property {string} lastUpdatedAt
 * @property {number} contentCount
 * @property {number} totalPlays
 * @property {"healthy"|"attention"|"at_risk"} accountHealth
 * @property {"not_started"|"in_progress"|"monetized"} monetizationStatus
 * @property {number} sellableTrafficValue
 */

/**
 * @typedef {Object} TrafficResource
 * 流量池条目——内容 → 账号 → 人群 → 流量资源 → 广告产品 → 广告收入
 * 这条链路里"流量资源"这一环的具体记录。
 * @property {string} trafficId
 * @property {string} platform
 * @property {string|null} accountId
 * @property {string|null} ipId
 * @property {string} contentType
 * @property {string} region
 * @property {string[]} audienceTags
 * @property {number} sellableVolume
 * @property {number} lockedVolume
 * @property {number} deliveredVolume
 * @property {number} estimatedAdValue
 */

/**
 * @typedef {Object} AdvertisingResource
 * Studio 可对外出售的广告资源——与 Operator 的"AI广告投放"是需求方/
 * 供给方的关系，不是同一个对象。
 * @property {string} resourceId
 * @property {string} name
 * @property {"account_post"|"content_placement"|"shortdrama_placement"|"live_mention"|"custom_video"|"account_repost"|"traffic_package"|"audience_targeting"|"ip_co_branding"} resourceType
 * @property {string[]} coveredPlatforms
 * @property {number} expectedExposure
 * @property {string} targetAudience
 * @property {number} sellableQuantity
 * @property {number} unitPrice
 * @property {"available"|"reserved"|"sold_out"|"retired"} status
 */

/**
 * @typedef {Object} AdvertisingOrder
 * @property {string} orderId
 * @property {"operator"|"external"} customerType
 * @property {string} customerName
 * @property {string|null} sourceOperatorBusinessUnitId   customerType==="operator" 时指向下单的 Operator
 * @property {string} resourceId
 * @property {number} contractAmount
 * @property {number} collectedAmount
 * @property {number} deliveryProgress
 * @property {number} expectedExposure
 * @property {number} actualExposure
 * @property {string} startAt
 * @property {string} endAt
 * @property {"pending"|"partially_settled"|"settled"} settlementStatus
 */
