// Founder AI 演示数据 — 全部为示意内容，未接入真实数据源。
// 与 services/api 的经营闭环数据是两套独立的 mock：这里是"AI 董事会 + 决策
// 中心 + 公司总控"专属的治理/决策类数据，不复用经营对象。

let idCounter = 1;
export function nextId(prefix) {
  return `${prefix}-${(idCounter++).toString().padStart(4, "0")}`;
}

export const RISK_LEVELS = ["低", "中", "高"];

export const SEED_PENDING_DECISIONS = [
  {
    id: "pd-0001",
    title: "是否批准 Studio 数字人生产线接入第三方语音克隆能力",
    source: "Studio",
    reason: "Studio 数字人生产线需要更自然的语音表现",
    impact: "影响数字人内容生产成本与合规风险",
    expectedBenefit: "预计降低配音成本约 30%",
    aiSuggestion: "建议先在受限范围内试点，签署数据使用协议后再全量开放",
    riskLevel: "中",
    deadline: "2026-08-03",
    status: "pending",
  },
  {
    id: "pd-0002",
    title: "Growth 提议将机会评分 Agent 的验证门槛从 7 天降为 5 天",
    source: "Growth",
    reason: "Growth 希望加快机会验证节奏",
    impact: "影响能力晋升速度与验证严谨性",
    expectedBenefit: "若可行，可缩短机会响应周期 2 天",
    aiSuggestion: "不建议下调，当前样本量不足以支撑更短验证周期",
    riskLevel: "中",
    deadline: "2026-08-02",
    status: "pending",
  },
  {
    id: "pd-0003",
    title: "Operator Cloud 请求为演示店铺一体机升级至 2608.2.2",
    source: "Operator Cloud",
    reason: "新版本修复了心跳超时相关问题",
    impact: "影响设备可用性，升级窗口需避开经营高峰",
    expectedBenefit: "预计减少设备心跳超时故障",
    aiSuggestion: "建议安排在低峰时段升级，提前通知 Operator",
    riskLevel: "低",
    deadline: "2026-08-05",
    status: "pending",
  },
];

export const SEED_MAJOR_ANOMALIES = [
  {
    id: "an-0001",
    source: "Operator",
    content: "演示店铺一体机连续 3 次心跳超时",
    impact: "可能导致订单处理延迟",
    aiJudgement: "设备网络波动，暂未影响交易完整性",
    suggestedAction: "远程重启心跳服务，持续观察 24 小时",
  },
  {
    id: "an-0002",
    source: "Growth",
    content: "「LED 灯带内容增长机会」置信度连续两日下降",
    impact: "可能是选题热度衰减，影响后续内容排期",
    aiJudgement: "热点信号自然衰减，非系统异常",
    suggestedAction: "降低该机会的内容排期优先级",
  },
];

export const SEED_TECH_OPPORTUNITIES = [
  {
    id: "tr-0001",
    category: "Agent Framework",
    title: "Claude Agent SDK 发布子代理编排能力",
    source: "Anthropic 官方发布",
    publishedAt: "2026-07-28",
    summary: "支持在同一会话内编排多个子代理并行完成任务，降低单代理上下文压力。",
    relation: "可用于能力中心的 Workflow 编排层，替代当前的单 Agent 串行调用",
    replaceableCapability: "短视频分镜生成 Workflow",
    estimatedCost: "中",
    risk: "低",
    suggestion: "立即测试",
  },
  {
    id: "tr-0002",
    category: "Computer Use",
    title: "浏览器自动化模型在电商后台操作任务上准确率提升",
    source: "行业评测报告",
    publishedAt: "2026-07-25",
    summary: "在表单填写、批量上架等重复性后台操作上表现出更高的稳定性。",
    relation: "可能替代 Operator 经营中心部分人工操作",
    replaceableCapability: "客服升级 Agent",
    estimatedCost: "高",
    risk: "中",
    suggestion: "加入观察",
  },
  {
    id: "tr-0003",
    category: "开源模型",
    title: "新开源图像模型发布，参数量更小但生成质量接近商用模型",
    source: "开源社区",
    publishedAt: "2026-07-20",
    summary: "推理成本显著低于当前使用的图像生成服务。",
    relation: "可用于 Studio 图文生产的降本方向",
    replaceableCapability: "无",
    estimatedCost: "低",
    risk: "低",
    suggestion: "立即测试",
  },
];

export const SEED_EXECUTION_TASKS = [
  {
    id: "et-0001",
    name: "Operator Cloud 设备批量升级至 2608.2.2",
    source: "待决策 pd-0003 批准后创建",
    executor: "Operator Cloud",
    stage: "执行中",
    progress: 40,
    doneSummary: "已完成灰度设备验证",
    blockers: "无",
    nextStep: "安排低峰时段全量升级",
    needsReauthorization: false,
  },
  {
    id: "et-0002",
    name: "短视频分镜生成 Workflow 验证门槛复核",
    source: "能力中心验证闸门",
    executor: "Founder",
    stage: "待验收",
    progress: 85,
    doneSummary: "已连续验证 6 天，明日满足 7 天门槛",
    blockers: "无",
    nextStep: "等待第 7 天数据后判定是否晋升",
    needsReauthorization: false,
  },
  {
    id: "et-0003",
    name: "数字人语音克隆能力接入评估",
    source: "待决策 pd-0001",
    executor: "Studio",
    stage: "阻塞",
    progress: 10,
    doneSummary: "已完成候选供应商调研",
    blockers: "等待 Founder 批准数据使用协议",
    nextStep: "Founder 决策后启动试点",
    needsReauthorization: true,
  },
];

export const SEED_SYSTEM_OVERVIEW = [
  {
    id: "sys-founder",
    name: "Founder",
    status: "正常",
    keyMetric: "3 项待决策 · 1 项重大异常",
    anomalyCount: 1,
    pendingCount: 3,
    lastUpdated: "刚刚",
  },
  {
    id: "sys-studio",
    name: "Studio",
    status: "正常",
    keyMetric: "1 条内容生产中",
    anomalyCount: 0,
    pendingCount: 1,
    lastUpdated: "5 分钟前",
  },
  {
    id: "sys-growth",
    name: "Growth",
    status: "关注",
    keyMetric: "1 个机会信号衰减",
    anomalyCount: 1,
    pendingCount: 1,
    lastUpdated: "12 分钟前",
  },
  {
    id: "sys-operator",
    name: "Operator",
    status: "正常",
    keyMetric: "0 笔待结算订单",
    anomalyCount: 0,
    pendingCount: 0,
    lastUpdated: "8 分钟前",
  },
  {
    id: "sys-cloud",
    name: "Cloud",
    status: "关注",
    keyMetric: "设备心跳超时 3 次",
    anomalyCount: 1,
    pendingCount: 1,
    lastUpdated: "2 分钟前",
  },
];

export const SEED_KNOWLEDGE_ITEMS = [
  { id: "kb-0001", category: "产品宪章", title: "AI Commerce OS 2608·V2 开发宪章", summary: "永久开发原则、五大主体分层、验证闸门机制的最初定义。", lastReferencedAt: "2026-07-30", isCore: true },
  { id: "kb-0002", category: "系统架构", title: "01-architecture.md", summary: "SinoFUT/Founder/Growth/Studio/Operator 分层架构与数据流。", lastReferencedAt: "2026-07-31", isCore: true },
  { id: "kb-0003", category: "ADR", title: "ADR-0003 Token Domain Model", summary: "账户身份与余额投影分离的 Token/AI 经营额度账本设计。", lastReferencedAt: "2026-07-29", isCore: false },
  { id: "kb-0004", category: "Design DNA", title: "04-design-system.md", summary: "极简/高级/内容优先的视觉语言与组件密度分级原则。", lastReferencedAt: "2026-07-31", isCore: true },
  { id: "kb-0005", category: "商业规则", title: "05-business-ecosystem.md", summary: "七大主体的利润来源、内部结算价与验证机制。", lastReferencedAt: "2026-07-30", isCore: false },
  { id: "kb-0006", category: "Founder 决策原则", title: "验证闸门四项判定标准", summary: "连续性/财务信号/人工介入率/可复现性。", lastReferencedAt: "2026-07-31", isCore: true },
  { id: "kb-0007", category: "Operator 经营规则", title: "内部结算价计价说明", summary: "Operator 向 Growth/Studio 采购流量与内容的记账机制。", lastReferencedAt: "2026-07-28", isCore: false },
  { id: "kb-0008", category: "Studio 内容规范", title: "内容统一生命周期七态", summary: "草稿/生产中/待审核/已审核/待发布/已发布/归档。", lastReferencedAt: "2026-07-31", isCore: false },
];

export const SEED_FILES = [
  { id: "f-0001", name: "2608-V2-总体架构.pdf", type: "PDF", uploadedAt: "2026-07-30", tags: ["架构"] },
  { id: "f-0002", name: "Founder-AI-董事会-PRD.md", type: "PRD", uploadedAt: "2026-07-31", tags: ["PRD", "Founder AI"] },
  { id: "f-0003", name: "导航冻结-执行结果截图.png", type: "截图", uploadedAt: "2026-07-31", tags: ["截图", "导航"] },
  { id: "f-0004", name: "Studio-无限画布-原型.fig", type: "原型文件", uploadedAt: "2026-07-29", tags: ["原型", "Studio"] },
  { id: "f-0005", name: "V2-002-执行结果.md", type: "Claude 执行结果", uploadedAt: "2026-07-31", tags: ["执行结果"] },
  { id: "f-0006", name: "founder-home-layout.diff", type: "Git Diff", uploadedAt: "2026-07-31", tags: ["Git Diff", "Founder AI"] },
  { id: "f-0007", name: "闭环验证-测试报告.md", type: "测试报告", uploadedAt: "2026-07-30", tags: ["测试"] },
  { id: "f-0008", name: "架构冻结会议记录.md", type: "会议记录", uploadedAt: "2026-07-26", tags: ["会议"] },
];

export const SEED_DECISION_MEMORIES = [
  { id: "dm-0001", content: "系统品牌永久确定为 SinoFUT / AI Commerce OS，版本号格式为 2608·Vx", decidedAt: "2026-07-26", source: "开发宪章", scope: "全系统", isValid: true },
  { id: "dm-0002", content: "V2 禁止为兼容 V1 修改架构，冲突时直接废弃 V1 对应部分", decidedAt: "2026-07-26", source: "开发宪章", scope: "全系统", isValid: true },
  { id: "dm-0003", content: "能力必须经 Founder 连续验证通过才能进入 Operator 可用范围", decidedAt: "2026-07-31", source: "05-business-ecosystem.md", scope: "能力层", isValid: true },
  { id: "dm-0004", content: "曾考虑将 Founder 首页设计为传统 Dashboard，已否决，改为 AI 工作台", decidedAt: "2026-07-31", source: "Founder AI 首页迭代", scope: "Founder", isValid: false },
  { id: "dm-0005", content: "Operator Cloud 定位为设备/许可证/AI额度/远程运维管控层，不承载流量内容订阅", decidedAt: "2026-07-31", source: "07-foundation-review.md", scope: "Operator Cloud", isValid: true },
];

export const SEED_HISTORY = [
  { id: "h-0001", type: "审批决策", title: "批准 Operator Cloud 设备升级窗口", date: "2026-07-30", summary: "同意在低峰时段执行升级" },
  { id: "h-0002", type: "系统异常", title: "Growth 机会信号衰减", date: "2026-07-31", summary: "判定为自然衰减，非系统故障" },
  { id: "h-0003", type: "执行任务", title: "短视频分镜生成 Workflow 验证", date: "2026-07-25", summary: "进入连续验证阶段" },
  { id: "h-0004", type: "技术情报", title: "Claude Agent SDK 子代理编排能力", date: "2026-07-28", summary: "标记为立即测试" },
];

export const SEED_MEETINGS = [];
export const SEED_ARGUMENTATIONS = [];

export const ARGUMENTATION_TEMPLATES = ["新产品功能", "新 Agent", "新 Workflow", "新增长能力", "新内容能力", "新设备能力"];

export const MODEL_OPTIONS = ["Claude", "GPT", "DeepSeek", "Gemini", "Qwen", "Kimi"];
export const MODEL_ROLES = ["技术负责人", "产品负责人", "研究负责人", "成本负责人", "风险负责人", "最终裁决"];
export const MEETING_MODES = ["单模型", "双模型", "多模型", "AI 董事会"];

export const MODEL_DEFAULT_ROLE = {
  Claude: "技术负责人",
  GPT: "产品负责人",
  Gemini: "研究负责人",
  DeepSeek: "成本负责人",
  Qwen: "风险负责人",
  Kimi: "最终裁决",
};
