import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";

/**
 * Founder V4.3 · 经营闭环共享数据层（阶段 Founder V4.3：真实经营闭环
 * 预备）。这不是第二套状态管理架构——延续 mockUtils.js 的
 * createLocalRepository 惯例，只是把"店铺 → 商品 → 内容 → 审批 →
 * 发布 → 订单 → 客服 → 复盘"这条链路里，contentMock/approvalMock/
 * orderMock/dailyCustomerServiceMock/replayMock/knowledgeMock 五个
 * 已有仓库之外还缺的实体（内容版本、发布任务、平台执行、流量归因、
 * 复盘快照、知识候选）集中定义在一处，并提供把它们串起来的编排
 * 函数——每个编排函数只做"校验 → 状态机跃迁 → 写入对应仓库 → 追加
 * Replay 事件"，不重复实现已有仓库自己的读写逻辑。
 *
 * 所有写操作都在事件处理函数里执行，不在渲染期间调用
 * Date.now()/new Date()。
 */

// ---------------------------------------------------------------
// 状态机：显式定义合法状态与合法跃迁，任何跃迁都必须先查表校验，
// 不允许组件直接对状态字符串做任意赋值。
// ---------------------------------------------------------------

export const CONTENT_PROJECT_STATES = [
  "Draft", "Planning", "Generating", "Generated", "Pending Approval", "Revision Requested",
  "Approved", "Ready to Publish", "Publishing", "Published", "Monitoring", "Reviewed",
  "Failed", "Archived",
];

const CONTENT_PROJECT_TRANSITIONS = {
  Draft: ["Planning", "Generating"],
  Planning: ["Generating", "Archived"],
  Generating: ["Generated", "Failed"],
  Generated: ["Generating", "Pending Approval", "Archived"],
  "Pending Approval": ["Approved", "Revision Requested", "Archived"],
  "Revision Requested": ["Generating", "Archived"],
  Approved: ["Ready to Publish", "Archived"],
  "Ready to Publish": ["Publishing", "Archived"],
  Publishing: ["Published", "Failed"],
  Published: ["Monitoring", "Archived"],
  Monitoring: ["Reviewed", "Archived"],
  Reviewed: ["Archived"],
  Failed: ["Generating", "Publishing", "Archived"],
  Archived: [],
};

/**
 * 审批状态沿用 approvalMock.js 已有的小写状态词汇（pending/
 * approved/rejected/returned），不引入第二套大小写不同的命名——
 * 8 条既有演示审批事项与审批中心的标签页筛选（"待审批"/"已通过"/
 * "已驳回"）都依赖这套小写值，改名会破坏现有数据与 UI。下面的
 * 映射只是把 V4.3 任务书里的规范名词对应到已有实现，不是新状态。
 *
 *   Pending            → "pending"
 *   Approved           → "approved"
 *   Rejected           → "rejected"
 *   Revision Requested → "returned"
 *   Expired / Cancelled → 预留词汇，本阶段闭环不产生这两种状态
 */
export const APPROVAL_REQUEST_STATES = ["pending", "approved", "rejected", "returned", "expired", "cancelled"];

const APPROVAL_REQUEST_TRANSITIONS = {
  pending: ["approved", "rejected", "returned", "expired", "cancelled"],
  approved: [],
  rejected: [],
  returned: [],
  expired: [],
  cancelled: [],
};

export const PUBLISH_JOB_STATES = ["Draft", "Scheduled", "Queued", "Executing", "Succeeded", "Failed", "Partially Succeeded", "Cancelled"];

const PUBLISH_JOB_TRANSITIONS = {
  Draft: ["Scheduled", "Queued", "Cancelled"],
  Scheduled: ["Queued", "Cancelled"],
  Queued: ["Executing", "Cancelled"],
  Executing: ["Succeeded", "Failed", "Partially Succeeded"],
  Succeeded: [],
  Failed: ["Queued"],
  "Partially Succeeded": ["Queued"],
  Cancelled: [],
};

/**
 * 通用跃迁校验：{ok:true} 或 {ok:false, error}。不合法的跃迁绝不
 * 修改任何仓库状态——调用方必须在写入前先校验。
 */
export function canTransition(table, from, to) {
  const allowed = table[from];
  if (allowed === undefined) return { ok: false, error: `未知的起始状态：${from}` };
  if (!allowed.includes(to)) return { ok: false, error: `不允许从「${from}」跃迁到「${to}」` };
  return { ok: true };
}

export function canTransitionContentProject(from, to) {
  return canTransition(CONTENT_PROJECT_TRANSITIONS, from, to);
}
export function canTransitionApproval(from, to) {
  return canTransition(APPROVAL_REQUEST_TRANSITIONS, from, to);
}
export function canTransitionPublishJob(from, to) {
  return canTransition(PUBLISH_JOB_TRANSITIONS, from, to);
}

export const CONTENT_PROJECT_STAGE_TIMELINE = [
  { key: "Draft", label: "立项" },
  { key: "Planning", label: "内容规划" },
  { key: "Generating", label: "AI生成" },
  { key: "OriginalityCheck", label: "原创性检查" },
  { key: "CopyrightCheck", label: "版权检查" },
  { key: "ComplianceCheck", label: "合规检查" },
  { key: "Pending Approval", label: "审批" },
  { key: "Publishing", label: "发布" },
  { key: "Monitoring", label: "数据监控" },
  { key: "Reviewed", label: "复盘" },
];

/**
 * 把细粒度的 loopState 映射到时间线上的"当前所在阶段"——检查类
 * 状态（原创/版权/合规）在内容生成阶段一次性演示完成，不单独占用
 * loopState，因此时间线定位用一张显式映射表而不是直接比较字符串。
 */
const STAGE_INDEX_FOR_STATE = {
  Draft: 0, Planning: 1, Generating: 2, Generated: 5,
  "Pending Approval": 6, "Revision Requested": 6, Approved: 7, "Ready to Publish": 7,
  Publishing: 7, Published: 8, Monitoring: 8, Reviewed: 9, Failed: 2, Archived: 9,
};

export function getStageIndexForState(loopState) {
  return STAGE_INDEX_FOR_STATE[loopState] ?? 0;
}

// ---------------------------------------------------------------
// 平台执行契约（阶段 8：为未来真实平台对接预留接口，本阶段只提供
// mock 实现——不做真实 OAuth/Cookie/浏览器自动化/平台登录/发布
// API/账号写操作）。
// ---------------------------------------------------------------

export const CONNECTOR_STATES = [
  "not_connected", "mock_connected", "ready_for_configuration",
  "authentication_required", "permission_missing", "temporarily_unavailable",
];

const CONNECTOR_STATE_LABEL = {
  not_connected: "未连接",
  mock_connected: "演示已连接",
  ready_for_configuration: "待配置",
  authentication_required: "需要授权",
  permission_missing: "权限缺失",
  temporarily_unavailable: "暂不可用",
};

export function getConnectorStateLabel(state) {
  return CONNECTOR_STATE_LABEL[state] ?? state;
}

export const EXECUTION_MODES = [
  { key: "manual_export", label: "手动导出" },
  { key: "assisted_execution", label: "辅助执行" },
  { key: "api_ready", label: "API 就绪" },
  { key: "unavailable", label: "暂不可用" },
];

/**
 * 平台执行接口——真实对接时替换这几个函数的内部实现即可，调用方
 * （simulatePublish）不需要改动。当前全部是确定性 mock，不发起任何
 * 真实网络请求，也绝不会把 mock 连接状态误显示为真实已连接。
 */
export const platformExecutionContract = {
  async validateConnection(storeId, platform) {
    await simulateLatency(100, 200);
    return { ok: true, connectorState: "mock_connected", storeId, platform };
  },
  validatePayload(payload) {
    if (!payload.storeId || !payload.productSku || !payload.contentVersionId) {
      return { ok: false, error: "发布payload缺少必要字段（店铺/商品/内容版本）" };
    }
    return { ok: true };
  },
  async prepareExecution(payload) {
    await simulateLatency(150, 300);
    return { ok: true, preparedAt: new Date().toISOString(), payload };
  },
  async execute(payload) {
    await simulateLatency(400, 900);
    return {
      ok: true,
      platformContentId: `MOCK-${(payload.platform ?? "platform").toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`,
      executedAt: new Date().toISOString(),
    };
  },
  async getExecutionStatus(executionId) {
    await simulateLatency(80, 150);
    return { executionId, status: "Succeeded" };
  },
  async cancelExecution(executionId) {
    await simulateLatency(80, 150);
    return { executionId, status: "Cancelled" };
  },
};

// ---------------------------------------------------------------
// 共享仓库：内容版本 / 审批扩展字段挂在 approvalMock 自己的仓库里
// （见 approvalMock.js 的 createApprovalRequest），这里只放
// approvalMock/contentMock/orderMock/dailyCustomerServiceMock 都不
// 天然拥有的新实体。
// ---------------------------------------------------------------

const loopRepository = createLocalRepository("operatingLoop.state", () => ({
  publishJobs: [],
  platformExecutions: [],
  trafficAttributions: [],
  reviewSnapshots: [],
}));

export function getOperatingLoopState() {
  return loopRepository.get();
}

export function getPublishJobForProject(contentProjectId) {
  return loopRepository.get().publishJobs.find((j) => j.contentProjectId === contentProjectId) ?? null;
}

export function getReviewSnapshotForProject(contentProjectId) {
  return loopRepository.get().reviewSnapshots.find((r) => r.contentProjectId === contentProjectId) ?? null;
}

/**
 * 幂等保护：同一个 contentProjectId 只允许存在一个 PublishJob /
 * ReviewSnapshot；重复触发时返回已存在的记录并附带
 * alreadyExists:true，调用方据此展示"该操作已完成"提示，不重复
 * 创建、不报错崩溃。
 */
export function createPublishJob(payload) {
  const state = loopRepository.get();
  const existing = state.publishJobs.find((j) => j.contentProjectId === payload.contentProjectId);
  if (existing) {
    return { record: existing, alreadyExists: true };
  }
  const record = {
    id: nextMockId("pubjob"),
    status: "Draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scheduledAt: null,
    publishedAt: null,
    ...payload,
  };
  loopRepository.update((s) => ({ ...s, publishJobs: [record, ...s.publishJobs] }));
  return { record, alreadyExists: false };
}

export function updatePublishJob(id, patch) {
  return loopRepository.update((s) => ({
    ...s,
    publishJobs: s.publishJobs.map((j) => (j.id === id ? { ...j, ...patch, updatedAt: new Date().toISOString() } : j)),
  })).publishJobs.find((j) => j.id === id);
}

export function createPlatformExecution(payload) {
  const record = {
    id: nextMockId("plexec"),
    status: "Queued",
    createdAt: new Date().toISOString(),
    ...payload,
  };
  loopRepository.update((s) => ({ ...s, platformExecutions: [record, ...s.platformExecutions] }));
  return record;
}

export function updatePlatformExecution(id, patch) {
  return loopRepository.update((s) => ({
    ...s,
    platformExecutions: s.platformExecutions.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  })).platformExecutions.find((e) => e.id === id);
}

export function createTrafficAttribution(payload) {
  const state = loopRepository.get();
  const existing = state.trafficAttributions.find((a) => a.contentProjectId === payload.contentProjectId);
  if (existing) {
    return { record: existing, alreadyExists: true };
  }
  const record = { id: nextMockId("traffic"), createdAt: new Date().toISOString(), ...payload };
  loopRepository.update((s) => ({ ...s, trafficAttributions: [record, ...s.trafficAttributions] }));
  return { record, alreadyExists: false };
}

export function getTrafficAttributionForProject(contentProjectId) {
  return loopRepository.get().trafficAttributions.find((a) => a.contentProjectId === contentProjectId) ?? null;
}

export function createReviewSnapshot(payload) {
  const state = loopRepository.get();
  const existing = state.reviewSnapshots.find((r) => r.contentProjectId === payload.contentProjectId);
  if (existing) {
    return { record: existing, alreadyExists: true };
  }
  const record = { id: nextMockId("review"), createdAt: new Date().toISOString(), ...payload };
  loopRepository.update((s) => ({ ...s, reviewSnapshots: [record, ...s.reviewSnapshots] }));
  return { record, alreadyExists: false };
}

/**
 * 知识候选类型词表——实际的候选记录与 Approve/Reject 动作复用
 * knowledgeMock.js 的 assets 列表（status: "candidate"），不在这里
 * 另开一份仓库；这样候选天然出现在 Agent 工作室已有的 Knowledge
 * 资产库 UI 里，不需要新建 Knowledge Center 模块。
 */
export const KNOWLEDGE_CANDIDATE_TYPES = [
  "内容表现洞察", "商品常见问题", "客服回复范式", "平台发布经验", "流量分发经验", "商品卖点",
];

// ---------------------------------------------------------------
// 确定性 mock 表现数据——固定值而不是每次运行都随机，保证测试稳定、
// 也保证同一个内容项目在演示过程中数字不会前后矛盾。
// ---------------------------------------------------------------
export function deterministicPerformanceFor(contentProjectId) {
  // 用项目 id 的字符码之和做一个小范围的确定性扰动，同一个 id 永远
  // 得到同一组数字，但不同项目之间数字不会完全一样。
  const seed = [...contentProjectId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const impressions = 40000 + (seed % 5000) * 10;
  const views = Math.round(impressions * 0.62);
  const completionRate = 0.44;
  const likes = Math.round(views * 0.052);
  const comments = Math.round(views * 0.007);
  const shares = Math.round(views * 0.011);
  const productClicks = Math.round(views * 0.075);
  const storeVisits = Math.round(productClicks * 0.68);
  const ordersAttributed = 1;
  const gmvAttributed = 45;
  return {
    impressions, views, completionRate, likes, comments, shares,
    productClicks, storeVisits, ordersAttributed, gmvAttributed,
  };
}
