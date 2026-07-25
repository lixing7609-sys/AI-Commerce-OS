/**
 * 共享 Edition Policy 层（阶段：Agent Evolution + 三版最终定位）。
 *
 * 目的：不在各处散落 `if (mode === "founder")` 之类的判断，而是让
 * 每个 Shell（Founder Shell / Operator Shell / Cloud Console）从这
 * 一处读取"当前 Edition 能看见什么模块、能做什么操作"，与
 * console/capabilities.js 的既有最小实现同源，但这次真正区分三个
 * 档位而不是只有一个 founderOperator。
 *
 * 三个 Edition 的关系（docs/01-reference-architecture/
 * edition-architecture.md）：
 *   Founder  = 全量业务能力 + 完整 Agent 演化控制
 *   Operator = Founder 能力的受限子集（简化日常经营 + 简化 AI 成长/成本视图）
 *   Cloud    = 完全不同的域（租户/设备/许可/Token计量/OTA/健康/支持），
 *              默认不触达任何私有原始业务数据
 */

export const EDITIONS = Object.freeze({
  FOUNDER: "founder",
  OPERATOR: "operator",
  CLOUD: "cloud",
});

export const POLICY_KEYS = Object.freeze({
  // 业务经营
  BUSINESS_FULL_OPERATION: "business.fullOperation",
  BUSINESS_OWN_TENANT_OPERATION: "business.ownTenantOperation",

  // Agent 演化
  EVOLUTION_INSPECT: "evolution.inspect",
  EVOLUTION_FULL_CONTROL: "evolution.fullControl",
  EVOLUTION_CANDIDATE_APPROVE_LOW_RISK: "evolution.candidateApproveLowRisk",
  EVOLUTION_CANDIDATE_APPROVE_ANY_RISK: "evolution.candidateApproveAnyRisk",
  EVOLUTION_EXPERIMENT_CONTROL: "evolution.experimentControl",
  EVOLUTION_ROLLBACK: "evolution.rollback",
  EVOLUTION_MODEL_ROUTE_CONFIGURE: "evolution.modelRouteConfigure",

  // 记忆与知识
  MEMORY_FULL_ACCESS: "memory.fullAccess",
  MEMORY_SUMMARY_ONLY: "memory.summaryOnly",
  PROMPT_UNRESTRICTED_EDIT: "prompt.unrestrictedEdit",
  SKILL_UNRESTRICTED_EDIT: "skill.unrestrictedEdit",

  // 设备与平台
  DEVICE_OWN_VIEW: "device.ownView",
  DEVICE_PLATFORM_MANAGE: "device.platformManage",
  TENANT_PLATFORM_MANAGE: "tenant.platformManage",
  OTA_RECEIVE: "ota.receive",
  OTA_RELEASE_MANAGE: "ota.releaseManage",

  // 支持与诊断
  DIAGNOSTICS_FULL: "diagnostics.full",
  SUPPORT_REQUEST: "support.request",
  SUPPORT_MANAGE: "support.manage",

  // 私有业务数据（Cloud 默认不可见）
  PRIVATE_BUSINESS_DATA_ACCESS: "privateData.access",
});

/**
 * Founder 拥有完整的业务与 Agent 演化能力，但不拥有 Cloud 独占的
 * 平台级域（租户/设备/OTA发布/诊断/支持管理）——那些管理的是"已售出
 * 给外部经营者的设备群"，不是 Founder 自己的经营/开发环境，属于
 * 完全不同的域（见 edition-architecture.md §7）。
 */
const FOUNDER_EXCLUDED_KEYS = [
  POLICY_KEYS.TENANT_PLATFORM_MANAGE,
  POLICY_KEYS.DEVICE_PLATFORM_MANAGE,
  POLICY_KEYS.OTA_RELEASE_MANAGE,
  POLICY_KEYS.DIAGNOSTICS_FULL,
  POLICY_KEYS.SUPPORT_MANAGE,
];

const FOUNDER_POLICY = Object.freeze(
  Object.fromEntries(Object.values(POLICY_KEYS).map((key) => [key, !FOUNDER_EXCLUDED_KEYS.includes(key)]))
);

const OPERATOR_POLICY = Object.freeze({
  [POLICY_KEYS.BUSINESS_OWN_TENANT_OPERATION]: true,
  [POLICY_KEYS.EVOLUTION_INSPECT]: true,
  [POLICY_KEYS.EVOLUTION_CANDIDATE_APPROVE_LOW_RISK]: true,
  [POLICY_KEYS.MEMORY_SUMMARY_ONLY]: true,
  [POLICY_KEYS.DEVICE_OWN_VIEW]: true,
  [POLICY_KEYS.OTA_RECEIVE]: true,
  [POLICY_KEYS.SUPPORT_REQUEST]: true,
  [POLICY_KEYS.PRIVATE_BUSINESS_DATA_ACCESS]: true, // 自己店铺自己的数据，本地持有
  // 显式不授予：BUSINESS_FULL_OPERATION, EVOLUTION_FULL_CONTROL,
  // EVOLUTION_CANDIDATE_APPROVE_ANY_RISK, EVOLUTION_EXPERIMENT_CONTROL,
  // EVOLUTION_ROLLBACK, EVOLUTION_MODEL_ROUTE_CONFIGURE, MEMORY_FULL_ACCESS,
  // PROMPT_UNRESTRICTED_EDIT, SKILL_UNRESTRICTED_EDIT, DEVICE_PLATFORM_MANAGE,
  // TENANT_PLATFORM_MANAGE, OTA_RELEASE_MANAGE, DIAGNOSTICS_FULL, SUPPORT_MANAGE
});

const CLOUD_POLICY = Object.freeze({
  [POLICY_KEYS.DEVICE_PLATFORM_MANAGE]: true,
  [POLICY_KEYS.TENANT_PLATFORM_MANAGE]: true,
  [POLICY_KEYS.OTA_RELEASE_MANAGE]: true,
  [POLICY_KEYS.DIAGNOSTICS_FULL]: true,
  [POLICY_KEYS.SUPPORT_MANAGE]: true,
  // 显式不授予 PRIVATE_BUSINESS_DATA_ACCESS：Cloud 默认只拿聚合
  // 遥测（设备健康/心跳/版本/Token 计量/错误摘要），不拿原始客户
  // 会话、订单明细、店铺密钥、商品策略、完整 Knowledge、Prompt
  // 正文或详细业务记忆——见 docs/01-reference-architecture/
  // edition-architecture.md §11.
});

export const EDITION_POLICIES = Object.freeze({
  [EDITIONS.FOUNDER]: FOUNDER_POLICY,
  [EDITIONS.OPERATOR]: OPERATOR_POLICY,
  [EDITIONS.CLOUD]: CLOUD_POLICY,
});

export function getEditionPolicy(edition) {
  return EDITION_POLICIES[edition] ?? OPERATOR_POLICY;
}

export function hasPolicy(edition, key) {
  return getEditionPolicy(edition)[key] === true;
}
