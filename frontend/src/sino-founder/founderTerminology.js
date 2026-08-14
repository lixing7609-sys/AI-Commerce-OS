export const OBJECT_TYPE_LABELS = {
  application_system: "Application System（应用系统）", project: "Project（项目）",
  agent: "Agent（智能体）", skill: "Skill（技能）", workflow: "Workflow（工作流）",
  prompt: "Prompt（提示词）", capability: "Capability（能力）", connector: "Connector（连接器）",
  task: "Task（任务）", artifact: "Artifact（成果）", memory: "Memory（记忆）",
  decision: "Decision（决策）", knowledge: "Knowledge（知识）", constraint: "Constraint（约束）",
  execution: "Execution（执行）", revision: "Revision（版本记录）",
};

export const STATUS_LABELS = {
  draft: "草稿", approved: "已批准", archived: "已归档", rejected: "已驳回",
  waiting_development: "待开发", not_started: "待开发", queued: "等待执行",
  planning: "规划中", coding: "开发中", executing: "执行中", testing: "测试中",
  deploy: "部署中", completed: "已完成", failed: "失败", paused: "已暂停",
  persisted: "已保存",
  committed: "已入库", deprecated: "已弃用", reusable: "可复用",
  deferred: "延期", pending: "待审批", superseded: "已被替代",
};

export const INTENT_LABELS = { create: "Create（新增）", modify: "Modify（修改）", merge: "Merge（合并）", split: "Split（拆分）", delay: "Delay（延期）", approve: "Approve（批准）", reject: "Reject（驳回）", archive: "Archive（归档）", reference_existing: "Reference（引用现有对象）" };
export const intentLabel = (intent) => INTENT_LABELS[intent] || intent || "待确认意图";

export const RELATION_LABELS = {
  "parent-child": "父子关系", dependency: "依赖", related: "关联", execution: "执行",
  version: "版本", artifact: "成果", memory: "记忆",
};

export const WORKSPACE_LABELS = {
  builder: { title: "系统架构", subtitle: "Architecture View" },
  "capability-center": { title: "能力网络", subtitle: "Capability View" },
  execution: { title: "执行流程", subtitle: "Execution View" },
  assets: { title: "资产与演化", subtitle: "Evolution View" },
};

export const objectTypeLabel = (type, fallback = "Object（对象）") => OBJECT_TYPE_LABELS[type] || fallback;
export const statusLabel = (status, { execution = false } = {}) => execution && status === "draft" ? "待开发" : STATUS_LABELS[status] || status || "暂无";
export const relationLabel = (relation) => RELATION_LABELS[relation] || relation || "暂无";
