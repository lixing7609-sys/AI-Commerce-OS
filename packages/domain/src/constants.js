// Verification gate thresholds — docs/2608-v2/05-business-ecosystem.md §4.
export const VALIDATION_CRITERIA = {
  minConsecutiveDays: 7,
  maxManualOverrideRate: 0.2,
};

// Recurring revenue taxonomy — docs/2608-v2/05-business-ecosystem.md §2.1.
export const REVENUE_STREAMS = [
  { key: "device", label: "设备与部署收入", owner: "Operator Cloud" },
  { key: "license", label: "系统许可收入", owner: "Operator Cloud" },
  { key: "ai-quota", label: "人工智能经营额度收入", owner: "Operator Cloud" },
  { key: "content", label: "内容服务收入", owner: "Studio（经 Marketplace）" },
  { key: "growth-traffic", label: "增长与流量服务收入", owner: "Growth（经 Marketplace）" },
  { key: "ad", label: "广告服务收入", owner: "Operator / Growth" },
  { key: "capability-market", label: "能力商城收入", owner: "Marketplace" },
  { key: "operator-cloud-service", label: "Operator Cloud 服务收入", owner: "Operator Cloud" },
  { key: "remote-ops", label: "远程运维收入", owner: "Operator Cloud" },
];

export const CAPABILITY_STATUS = {
  BUILDING: "building",
  VALIDATING: "validating",
  VALIDATED: "validated",
  RETIRED: "retired",
};

export const APPROVAL_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const CONTENT_STAGE = {
  BRIEF: "brief",
  TOPIC: "topic",
  SCRIPT: "script",
  STORYBOARD: "storyboard",
  ASSET: "asset",
  APPROVAL: "approval",
  READY: "ready",
};

export const API_BASE_URL =
  (typeof window !== "undefined" && window.__SINOFUT_API_BASE__) || "http://localhost:4700";
