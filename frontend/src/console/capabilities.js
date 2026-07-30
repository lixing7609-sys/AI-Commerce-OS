/**
 * 能力开关（最小实现，阶段：Founder Alpha）。
 *
 * 目的很窄：让模块/操作组件读取具名能力 key，而不是硬编码"这是
 * Founder 所以总是可以"，避免未来真正做受限 Operator 版时又要
 * 重写一遍组件。本次不构建：Operator 档位、角色系统、后端鉴权、
 * 策略 DSL、租户权限——这些都不在这一步范围内。
 *
 * 目前只有一个档位 founderOperator，其中每个 key 都是 true。
 */

export const CAPABILITY_KEYS = Object.freeze({
  FOUNDER_WORKBENCH_VIEW: "founderWorkbench.view",
  DECISIONS_VIEW: "decisions.view",
  DEVELOPMENT_VIEW: "development.view",
  BUSINESS_VALIDATION_VIEW: "businessValidation.view",
  CONTENT_VALIDATION_VIEW: "contentValidation.view",
  CLOUD_STATUS_VIEW: "cloudStatus.view",
  RISKS_VIEW: "risks.view",
  NOTIFICATIONS_VIEW: "notifications.view",
  SECRETARY_VIEW: "secretary.view",
  DASHBOARD_VIEW: "dashboard.view",
  PROMPT_CENTER_VIEW: "promptCenter.view",
  SKILL_CENTER_VIEW: "skillCenter.view",
  KNOWLEDGE_CENTER_VIEW: "knowledgeCenter.view",
  CONNECTOR_CENTER_VIEW: "connectorCenter.view",
  CLOUD_CENTER_VIEW: "cloudCenter.view",
  STORE_CENTER_VIEW: "storeCenter.view",
  PRODUCT_CENTER_VIEW: "productCenter.view",
  PRODUCT_CENTER_EDIT: "productCenter.edit",
  ORDER_CENTER_VIEW: "orderCenter.view",
  CONTENT_CENTER_VIEW: "contentCenter.view",
  LIVE_CENTER_VIEW: "liveCenter.view",
  CUSTOMER_SERVICE_CENTER_VIEW: "customerServiceCenter.view",
  TRAFFIC_NETWORK_CENTER_VIEW: "trafficNetworkCenter.view",
  AGENT_CENTER_VIEW: "agentCenter.view",
  WORKFLOW_CENTER_VIEW: "workflowCenter.view",
  CAPABILITY_CENTER_VIEW: "capabilityCenter.view",
  AGENT_STUDIO_VIEW: "agentStudio.view",
  AGENT_STUDIO_EDIT: "agentStudio.edit",
  AGENT_STUDIO_PUBLISH: "agentStudio.publish",
  AGENT_STUDIO_ROLLBACK: "agentStudio.rollback",
  MODEL_ROUTER_VIEW: "modelRouter.view",
  MODEL_ROUTER_EDIT: "modelRouter.edit",
  TOKEN_CENTER_VIEW: "tokenCenter.view",
  TOKEN_CENTER_GRANT: "tokenCenter.grant",
  AD_CENTER_VIEW: "adCenter.view",
  AD_CENTER_EDIT: "adCenter.edit",
  AUTOMATION_POLICY_VIEW: "automationPolicy.view",
  AUTOMATION_POLICY_EDIT: "automationPolicy.edit",
  APPROVAL_CENTER_VIEW: "approvalCenter.view",
  APPROVAL_CENTER_DECIDE: "approvalCenter.decide",
  BENCHMARK_CENTER_VIEW: "benchmarkCenter.view",
  REPLAY_CENTER_VIEW: "replayCenter.view",
  EVALUATION_CENTER_VIEW: "evaluationCenter.view",
  SYSTEM_CENTER_VIEW: "systemCenter.view",
  CLOUD_VERSION_VIEW: "cloudVersion.view",
  CLOUD_ASSETS_VIEW: "cloudAssets.view",
  MONITORING_VIEW: "monitoring.view",
  LOGS_VIEW: "logs.view",
  SYSTEM_CENTER_CONTROL: "systemCenter.control",
  STORE_CONNECTION_CENTER_VIEW: "storeConnectionCenter.view",
  STORE_CONNECTION_CENTER_MANAGE: "storeConnectionCenter.manage",
  OPERATOR_LAB_VIEW: "operatorLab.view",
  STUDIO_LAB_VIEW: "studioLab.view",
  STUDIO_LAB_EXPERIMENT_VIEW: "studioLab.experiment.view",
  MARKETPLACE_CENTER_VIEW: "marketplaceCenter.view",
  DESIGN_DNA_VIEW: "designDna.view",
  PRODUCT_REVIEW_VIEW: "productReview.view",
});

function allTrue(keys) {
  return Object.fromEntries(Object.values(keys).map((key) => [key, true]));
}

export const CAPABILITY_PROFILES = Object.freeze({
  founderOperator: Object.freeze(allTrue(CAPABILITY_KEYS)),
});
