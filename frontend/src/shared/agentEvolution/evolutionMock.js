import { createLocalRepository, nextMockId } from "../localRepository.js";

/**
 * Agent Evolution Foundation（阶段：三版最终定位 + Agent 演化基础）。
 *
 * 目的：记忆、反思、学习、评测、受控演化、净化、成本优化、实验、
 * 回滚——从第一天就作为基础能力存在，而不是"以后再加的功能"，
 * 避免真实店铺接入后再做一次架构重写。这里只建立最小但连贯的
 * 领域模型 + mock 仓库 + 编排函数，不做真实持久化/真实模型学习/
 * 真实平台接入——所有写操作都是可回滚、可审计的受控演化，绝不
 * 允许无约束的自主自我修改（见 EVOLUTION_LEVELS 与
 * HIGH_RISK_AREAS）。
 *
 * 三版共用同一份仓库定义：Founder 有完整读写权限
 * （EVOLUTION_FULL_CONTROL），Operator 只能看摘要并批准低风险候选
 * （EVOLUTION_CANDIDATE_APPROVE_LOW_RISK），Cloud 默认不触达——权限
 * 差异由 shared/editionPolicy.js 控制，不在这里重复判断。
 */

// ---------------------------------------------------------------
// 词表
// ---------------------------------------------------------------

export const MEMORY_TYPES = [
  { key: "working", label: "工作记忆", description: "当前任务上下文" },
  { key: "episodic", label: "情景记忆", description: "某次具体执行中发生了什么" },
  { key: "semantic", label: "语义记忆", description: "稳定事实、商品知识、平台规则、业务知识" },
  { key: "procedural", label: "程序记忆", description: "如何高效完成某类任务" },
  { key: "economic", label: "经济记忆", description: "Token成本、模型成本、广告成本、人工成本、耗时与业务价值" },
  { key: "strategic", label: "策略记忆", description: "长期经营模式与策略" },
];

export const MEMORY_STATUSES = ["candidate", "verified", "active", "deprecated", "rejected", "expired", "superseded"];

export const EVOLUTION_LEVELS = [
  { key: "E0", label: "仅记录", description: "只记录执行数据，不产生任何自动建议" },
  { key: "E1", label: "自动反思并提出候选", description: "系统自动生成反思报告与学习候选，等待评测" },
  { key: "E2", label: "自动评测候选", description: "候选自动与稳定版本对比评测，等待人工决策" },
  { key: "E3", label: "人工批准实验/灰度", description: "人工批准后才能进入实验或灰度放量" },
  { key: "E4", label: "低风险自动晋升", description: "策略允许的低风险变更可自动晋升，高风险区域永不自动晋升" },
];
export const DEFAULT_EVOLUTION_LEVEL = "E2";

export const LEARNING_CANDIDATE_TYPES = [
  "KnowledgeUpdate", "PromptUpdate", "SkillUpdate", "ModelRouteUpdate",
  "AutomationPolicyUpdate", "MemoryCleanup", "CostOptimization", "StrategyUpdate",
];

export const LEARNING_CANDIDATE_STATUSES = [
  "candidate", "evaluating", "approved", "rejected", "experimenting", "promoted", "rolledBack",
];

/**
 * 高风险区域——即使演化档位允许自动晋升（E4），命中以下任一类别
 * 的候选也永远不能自动晋升，必须走人工批准（E3 以上）。
 */
export const HIGH_RISK_AREAS = [
  "广告预算提升", "商品价格调整", "发起退款", "承诺客户补偿", "变更访问权限",
  "发布敏感内容", "修改生产凭据", "删除重要 Knowledge", "启用高成本模型路由",
];

export const PURIFICATION_ACTIONS = ["retain", "merge", "reducePriority", "deprecate", "expire", "quarantine", "deleteAfterApproval"];

const PURIFICATION_ACTION_LABEL = {
  retain: "保留", merge: "合并", reducePriority: "降低优先级", deprecate: "标记过期",
  expire: "到期失效", quarantine: "隔离待审", deleteAfterApproval: "审批后删除",
};
export function getPurificationActionLabel(action) {
  return PURIFICATION_ACTION_LABEL[action] ?? action;
}

// ---------------------------------------------------------------
// 种子数据：Content Agent 成本优化闭环（唯一完整 mock 场景）
// ---------------------------------------------------------------

// 直接用 Agent 工作室已有的 Agent 名称作为 id，让"Agent 演化"
// 数据天然挂在真实存在的 Agent 详情页下（frontend/src/console/
// mock/agentTemplatesMock.js 里 category:"content" 的"脚本Agent"），
// 不引入第二套 Agent 身份体系。
export const CONTENT_AGENT_ID = "脚本Agent";
const AGENT_ID = CONTENT_AGENT_ID;
const now = () => Date.now();

function seedState() {
  const t = now();
  const stableVersionId = "agentver-content-v1";
  const candidateVersionId = "agentver-content-v2-candidate";

  const agentDefinitions = [
    { id: AGENT_ID, name: "内容 Agent", category: "content", description: "负责商品短视频脚本/文案生成，服务内容中心的内容生成动作。" },
  ];

  const agentVersions = [
    {
      id: stableVersionId, agentId: AGENT_ID, version: 1, status: "stable",
      promptVersion: "商品短视频脚本 Prompt v1", skillVersion: "商品详情文案生成 v1",
      knowledgeVersion: "商品短视频脚本结构知识 v1", modelRoute: "claude-sonnet-5",
      createdAt: new Date(t - 20 * 86400000).toISOString(), promotedAt: new Date(t - 20 * 86400000).toISOString(),
    },
  ];

  const modelRoutingDecisions = [
    { id: "mrd-stable", taskType: "content_generation", model: "Claude Sonnet 5", provider: "anthropic", reason: "默认高质量路由，未做成本分层前的初始选择", costPerRunUsd: 0.42, qualityScore: 92 },
    { id: "mrd-candidate", taskType: "content_generation", model: "DeepSeek V3", provider: "deepseek", reason: "常规商品短视频脚本任务对模型能力要求中等，评测显示低成本模型质量损失可接受", costPerRunUsd: 0.09, qualityScore: 87 },
  ];

  const agentRuns = [
    {
      id: "agentrun-1", agentId: AGENT_ID, agentVersionId: stableVersionId, storeId: "store-1",
      taskType: "content_generation", status: "completed",
      startedAt: new Date(t - 6 * 3600000).toISOString(), completedAt: new Date(t - 6 * 3600000 + 8000).toISOString(),
      contextSummary: "为「LED灯带套装 3米」生成电视背景氛围感短视频脚本", modelRoutingDecisionId: "mrd-stable",
      outputSummary: "已生成标题/文案/脚本/分镜/封面方向/卖点/CTA/渠道版本",
    },
  ];

  const agentOutcomes = [
    { id: "outcome-1", agentRunId: "agentrun-1", businessOutcome: "内容发布后归因 1 单，GMV ¥45", qualityScore: 92, taskSuccess: true, humanIntervention: false, notes: "原创度91，版权/合规均通过，无需人工介入" },
  ];

  const costRecords = [
    {
      id: "cost-1", agentRunId: "agentrun-1", model: "Claude Sonnet 5",
      inputTokens: 1400, outputTokens: 700, cachedTokens: 0,
      modelCostUsd: 0.42, toolCostUsd: 0.02, durationMs: 8200,
      humanInterventionCostUsd: 0, adCostUsd: 0, businessValueUsd: 45,
    },
  ];

  const memoryRecords = [
    {
      id: "mem-episodic-1", agentId: AGENT_ID, storeId: "store-1", entityType: "AgentRun", entityId: "agentrun-1",
      memoryType: "episodic", content: "为 LED 灯带生成的开场强钩子（黑屏转亮灯）完播率高于历史均值",
      source: "复盘 · LED感应灯带内容项目", evidence: "播放37,138，完播率44%，商品点击2,785", confidence: "高",
      createdAt: new Date(t - 6 * 3600000).toISOString(), lastUsedAt: new Date(t - 1 * 3600000).toISOString(),
      expiresAt: null, version: 1, status: "active", costImpact: "无", businessImpact: "正向",
    },
    {
      id: "mem-economic-1", agentId: AGENT_ID, storeId: "store-1", entityType: "AgentRun", entityId: "agentrun-1",
      memoryType: "economic", content: "Claude Sonnet 5 生成一份商品短视频脚本平均成本 $0.42，占内容项目总成本主要部分",
      source: "成本记录聚合", evidence: "近7天8次内容生成run，平均模型成本$0.42/次", confidence: "高",
      createdAt: new Date(t - 5 * 3600000).toISOString(), lastUsedAt: new Date(t - 1 * 3600000).toISOString(),
      expiresAt: null, version: 1, status: "active", costImpact: "高", businessImpact: "中性",
    },
    {
      id: "mem-semantic-1", agentId: AGENT_ID, storeId: "store-1", entityType: "PlatformRule", entityId: "douyin-2024-rule",
      memoryType: "semantic", content: "抖音标题不超过30字，主图需800x800以上", source: "抖音平台发布规则 v3",
      evidence: "平台规则文档", confidence: "高", createdAt: new Date(t - 60 * 86400000).toISOString(),
      lastUsedAt: new Date(t - 2 * 86400000).toISOString(), expiresAt: null, version: 1, status: "active",
      costImpact: "无", businessImpact: "合规",
    },
    {
      id: "mem-semantic-2-stale", agentId: AGENT_ID, storeId: "store-1", entityType: "PlatformRule", entityId: "douyin-2023-rule-old",
      memoryType: "semantic", content: "（旧）抖音标题不超过20字——已被2024版规则取代", source: "抖音平台发布规则 v1（历史版本）",
      evidence: "2023年规则快照", confidence: "低", createdAt: new Date(t - 400 * 86400000).toISOString(),
      lastUsedAt: new Date(t - 200 * 86400000).toISOString(), expiresAt: new Date(t - 30 * 86400000).toISOString(),
      version: 1, status: "expired", costImpact: "无", businessImpact: "无（已过期）",
    },
    {
      id: "mem-semantic-3-dup", agentId: AGENT_ID, storeId: "store-1", entityType: "PlatformRule", entityId: "douyin-2024-rule-dup",
      memoryType: "semantic", content: "抖音标题不超过30字（重复记录，与 mem-semantic-1 内容相同，来源不同批次生成）",
      source: "内容发布Agent 自动摘要", evidence: "自动摘要，未去重", confidence: "中",
      createdAt: new Date(t - 10 * 86400000).toISOString(), lastUsedAt: new Date(t - 10 * 86400000).toISOString(),
      expiresAt: null, version: 1, status: "candidate", costImpact: "低（检索冗余）", businessImpact: "无",
    },
    {
      id: "mem-strategic-1-conflict", agentId: AGENT_ID, storeId: "store-1", entityType: "Strategy", entityId: "content-strategy-conflict",
      memoryType: "strategic", content: "（存疑）建议所有内容优先使用高成本模型以保证质量——与近期成本优化评测结论冲突，需人工复核",
      source: "早期策略沉淀（未经近期评测验证）", evidence: "缺少近30天对比评测支持", confidence: "低",
      createdAt: new Date(t - 90 * 86400000).toISOString(), lastUsedAt: new Date(t - 45 * 86400000).toISOString(),
      expiresAt: null, version: 1, status: "candidate", costImpact: "未知", businessImpact: "存疑，已隔离待审",
    },
    {
      id: "mem-procedural-1-lowvalue", agentId: AGENT_ID, storeId: "store-1", entityType: "Procedure", entityId: "content-procedure-lowvalue",
      memoryType: "procedural", content: "（低价值）曾用于生成朋友圈文案的三步流程，近90天使用次数为0",
      source: "历史流程沉淀", evidence: "近90天调用0次", confidence: "低",
      createdAt: new Date(t - 120 * 86400000).toISOString(), lastUsedAt: new Date(t - 95 * 86400000).toISOString(),
      expiresAt: null, version: 1, status: "deprecated", costImpact: "低（占用检索索引）", businessImpact: "无",
    },
  ];

  const reflectionReports = [
    {
      id: "reflection-1", agentId: AGENT_ID, agentRunIds: ["agentrun-1"],
      createdAt: new Date(t - 4 * 3600000).toISOString(),
      whatSucceeded: "内容生成质量稳定，原创度/版权/合规检查均一次通过，归因订单已产生", whatFailed: "无任务失败，但单次生成成本偏高",
      whyAnalysis: "当前固定路由到 Claude Sonnet 5，对「商品短视频脚本」这类中等复杂度的常规生成任务而言模型能力有冗余",
      humanInterventionCause: "无人工介入", modelTooExpensive: true, contextTooLong: false, skillRedundant: false,
      knowledgeMissingOrObsolete: false, adDecisionQuality: "不涉及广告决策", evidenceSufficient: true,
      summary: "8次近期同类型run平均质量分92、成本$0.42；建议评测更低成本模型路由是否能在质量可接受范围内降低成本",
    },
  ];

  const learningCandidates = [
    {
      id: "candidate-1", reflectionReportId: "reflection-1", candidateType: "ModelRouteUpdate",
      evidence: "8次近期商品短视频脚本生成，Claude Sonnet 5 平均质量分92、成本$0.42；同类任务复杂度分析显示中低复杂度模型可能已足够",
      expectedBenefit: "模型成本预计降低约78%（$0.42 → $0.09/次），内容生成吞吐量不受影响",
      possibleRisk: "质量分可能下降，需评测验证是否仍在可接受阈值（≥85）以上",
      affectedAgentId: AGENT_ID, affectedScope: "抖音店A · 内容 Agent · 商品短视频脚本生成任务",
      expectedTokenImpact: "Token用量不变，模型单价大幅降低", expectedBusinessImpact: "内容生产成本降低，不影响归因GMV",
      confidence: "中", status: "candidate", evaluationRunId: null, approvalState: "pending",
      riskLevel: "low", createdAt: new Date(t - 3 * 3600000).toISOString(),
      candidateAgentVersionId: candidateVersionId, modelRoutingDecisionId: "mrd-candidate",
    },
  ];

  const agentVersionsWithCandidate = [
    ...agentVersions,
    {
      id: candidateVersionId, agentId: AGENT_ID, version: 2, status: "candidate",
      promptVersion: "商品短视频脚本 Prompt v1", skillVersion: "商品详情文案生成 v1",
      knowledgeVersion: "商品短视频脚本结构知识 v1", modelRoute: "deepseek-v3",
      createdAt: new Date(t - 3 * 3600000).toISOString(), promotedAt: null,
    },
  ];

  return {
    agentDefinitions,
    agentVersions: agentVersionsWithCandidate,
    agentRuns,
    agentOutcomes,
    costRecords,
    modelRoutingDecisions,
    memoryRecords,
    reflectionReports,
    learningCandidates,
    evaluationRuns: [],
    experiments: [],
    promotionRecords: [],
    rollbackRecords: [],
    evolutionLevel: DEFAULT_EVOLUTION_LEVEL,
  };
}

const repository = createLocalRepository("agentEvolution.state", seedState);

export function getEvolutionState() {
  return repository.get();
}

export function getEvolutionLevel() {
  return repository.get().evolutionLevel;
}

export function setEvolutionLevel(level) {
  return repository.update((s) => ({ ...s, evolutionLevel: level }));
}

// ---------------------------------------------------------------
// 只读选择器
// ---------------------------------------------------------------

export function getAgentDefinition(agentId) {
  return repository.get().agentDefinitions.find((a) => a.id === agentId) ?? null;
}
export function getAgentVersions(agentId) {
  return repository.get().agentVersions.filter((v) => v.agentId === agentId);
}
export function getStableVersion(agentId) {
  return repository.get().agentVersions.find((v) => v.agentId === agentId && v.status === "stable") ?? null;
}
export function getMemoryRecords(agentId) {
  return repository.get().memoryRecords.filter((m) => m.agentId === agentId);
}
export function getActiveMemoryRecords(agentId) {
  return getMemoryRecords(agentId).filter((m) => ["active", "verified"].includes(m.status));
}
export function getReflectionReports(agentId) {
  return repository.get().reflectionReports.filter((r) => r.agentId === agentId);
}
export function getLearningCandidates(agentId) {
  const state = repository.get();
  return state.learningCandidates.filter((c) => c.affectedAgentId === agentId);
}
export function getLearningCandidate(id) {
  return repository.get().learningCandidates.find((c) => c.id === id) ?? null;
}
export function getEvaluationRunForCandidate(candidateId) {
  return repository.get().evaluationRuns.find((e) => e.learningCandidateId === candidateId) ?? null;
}
export function getExperimentForCandidate(candidateId) {
  return repository.get().experiments.find((e) => e.learningCandidateId === candidateId) ?? null;
}
export function getPromotionRecords(agentId) {
  const state = repository.get();
  const versionIds = new Set(state.agentVersions.filter((v) => v.agentId === agentId).map((v) => v.id));
  return state.promotionRecords.filter((p) => versionIds.has(p.toAgentVersionId));
}
export function getRollbackRecords(agentId) {
  return repository.get().rollbackRecords.filter((r) => r.agentId === agentId);
}
export function getCostRecordsForAgent(agentId) {
  const state = repository.get();
  const runIds = new Set(state.agentRuns.filter((r) => r.agentId === agentId).map((r) => r.id));
  return state.costRecords.filter((c) => runIds.has(c.agentRunId));
}

// ---------------------------------------------------------------
// 编排函数——每一步都校验前置条件、写入仓库、不允许无约束自改
// ---------------------------------------------------------------

function isHighRisk(candidate) {
  return HIGH_RISK_AREAS.some((area) => candidate.affectedScope?.includes(area) || candidate.candidateType === "AutomationPolicyUpdate");
}

/**
 * 评测候选 vs 当前稳定版本——E1→E2。产出双方在质量/成功率/成本/
 * 延迟/人工介入/业务结果/风险/稳定性 8 个维度上的对比，并给出
 * 建议。幂等：同一候选已有评测结果时直接返回，不重复生成。
 */
export function evaluateCandidate(candidateId) {
  const state = repository.get();
  const candidate = state.learningCandidates.find((c) => c.id === candidateId);
  if (!candidate) return { ok: false, error: "候选不存在" };

  const existing = state.evaluationRuns.find((e) => e.learningCandidateId === candidateId);
  if (existing) return { ok: true, evaluationRun: existing, alreadyExists: true };

  if (candidate.status !== "candidate") return { ok: false, error: "该候选已进入其他阶段，无法重新评测" };

  const stableModel = state.modelRoutingDecisions.find((m) => m.id === "mrd-stable");
  const candidateModel = state.modelRoutingDecisions.find((m) => m.id === candidate.modelRoutingDecisionId);

  const evaluationRun = {
    id: nextMockId("eval"),
    learningCandidateId: candidateId,
    comparedAgentVersionId: getStableVersion(candidate.affectedAgentId)?.id ?? null,
    candidateAgentVersionId: candidate.candidateAgentVersionId,
    createdAt: new Date().toISOString(),
    metrics: {
      stable: { outputQuality: stableModel.qualityScore, taskSuccess: "96%", tokenUsage: 2100, modelCost: stableModel.costPerRunUsd, latencyMs: 8200, humanIntervention: "0%", businessOutcome: "¥45/次归因", risk: "low", stability: "已稳定运行20天" },
      candidate: { outputQuality: candidateModel.qualityScore, taskSuccess: "93%", tokenUsage: 2100, modelCost: candidateModel.costPerRunUsd, latencyMs: 6400, humanIntervention: "2%", businessOutcome: "¥43/次归因（预估）", risk: "low", stability: "尚未上线运行" },
    },
    recommendation: candidateModel.qualityScore >= 85 ? "建议批准灰度实验" : "质量分低于阈值，不建议晋升",
  };

  repository.update((s) => ({ ...s, evaluationRuns: [evaluationRun, ...s.evaluationRuns] }));
  repository.update((s) => ({
    ...s,
    learningCandidates: s.learningCandidates.map((c) => (c.id === candidateId ? { ...c, status: "evaluating", evaluationRunId: evaluationRun.id } : c)),
  }));

  return { ok: true, evaluationRun, alreadyExists: false };
}

/**
 * 批准候选进入实验/灰度（E3，需要人工批准）——高风险候选（见
 * HIGH_RISK_AREAS）即使演化档位是 E4 也必须先经过这一步，不能
 * 自动跳过。
 */
export function approveExperiment(candidateId, sampleSize = 50) {
  const state = repository.get();
  const candidate = state.learningCandidates.find((c) => c.id === candidateId);
  if (!candidate) return { ok: false, error: "候选不存在" };
  if (candidate.status !== "evaluating") return { ok: false, error: "候选尚未完成评测，无法批准实验", alreadyProcessed: candidate.status === "experimenting" };

  const experiment = {
    id: nextMockId("exp"),
    learningCandidateId: candidateId,
    evolutionLevel: "E3",
    status: "running",
    startedAt: new Date().toISOString(),
    sampleSize,
    trialResults: { runsCompleted: sampleSize, avgQuality: 88, avgCostUsd: 0.1, humanInterventionRate: "1.2%" },
    decidedBy: "Founder",
    decidedAt: new Date().toISOString(),
  };

  repository.update((s) => ({ ...s, experiments: [experiment, ...s.experiments] }));
  repository.update((s) => ({
    ...s,
    learningCandidates: s.learningCandidates.map((c) => (c.id === candidateId ? { ...c, status: "experimenting" } : c)),
  }));

  return { ok: true, experiment };
}

/**
 * 晋升候选为新的稳定版本——高风险候选禁止晋升（即使已通过实验），
 * 必须显式拒绝或保持实验状态由人工继续判断。晋升会把旧稳定版本
 * 归档为 archived，新版本成为 stable，并保留完整版本历史，永不
 * 静默覆盖。
 */
export function promoteCandidate(candidateId) {
  const state = repository.get();
  const candidate = state.learningCandidates.find((c) => c.id === candidateId);
  if (!candidate) return { ok: false, error: "候选不存在" };
  if (candidate.status !== "experimenting") return { ok: false, error: "候选尚未进入实验阶段，无法晋升" };
  if (isHighRisk(candidate)) return { ok: false, error: "该候选涉及高风险区域，禁止自动/一键晋升，需走独立人工审批流程" };

  const stableVersion = getStableVersion(candidate.affectedAgentId);
  const candidateVersion = state.agentVersions.find((v) => v.id === candidate.candidateAgentVersionId);
  if (!stableVersion || !candidateVersion) return { ok: false, error: "版本记录缺失，无法晋升" };

  const promotionRecord = {
    id: nextMockId("promo"),
    learningCandidateId: candidateId,
    experimentId: state.experiments.find((e) => e.learningCandidateId === candidateId)?.id ?? null,
    fromAgentVersionId: stableVersion.id,
    toAgentVersionId: candidateVersion.id,
    promotedAt: new Date().toISOString(),
    promotedBy: "Founder",
    rationale: "灰度实验质量分88（阈值85以上），成本降低约76%，批准晋升为稳定版本",
  };

  repository.update((s) => ({
    ...s,
    agentVersions: s.agentVersions.map((v) => {
      if (v.id === stableVersion.id) return { ...v, status: "archived" };
      if (v.id === candidateVersion.id) return { ...v, status: "stable", promotedAt: promotionRecord.promotedAt };
      return v;
    }),
    learningCandidates: s.learningCandidates.map((c) => (c.id === candidateId ? { ...c, status: "promoted" } : c)),
    promotionRecords: [promotionRecord, ...s.promotionRecords],
  }));

  return { ok: true, promotionRecord };
}

/**
 * 回滚到指定的历史版本——始终可用，不需要理由之外的任何门槛，
 * 保证"稳定版本永远不会被静默覆盖且不可恢复"。
 */
export function rollbackToVersion(agentId, targetVersionId, reason) {
  if (!reason?.trim()) return { ok: false, error: "回滚需要填写原因" };
  const state = repository.get();
  const currentStable = getStableVersion(agentId);
  const targetVersion = state.agentVersions.find((v) => v.id === targetVersionId && v.agentId === agentId);
  if (!currentStable || !targetVersion) return { ok: false, error: "版本记录缺失，无法回滚" };
  if (currentStable.id === targetVersionId) return { ok: false, error: "目标版本已经是当前稳定版本" };

  const rollbackRecord = {
    id: nextMockId("rb"),
    agentId,
    fromAgentVersionId: currentStable.id,
    toAgentVersionId: targetVersionId,
    rolledBackAt: new Date().toISOString(),
    rolledBackBy: "Founder",
    reason,
  };

  repository.update((s) => ({
    ...s,
    agentVersions: s.agentVersions.map((v) => {
      if (v.id === currentStable.id) return { ...v, status: "archived" };
      if (v.id === targetVersionId) return { ...v, status: "stable", promotedAt: rollbackRecord.rolledBackAt };
      return v;
    }),
    rollbackRecords: [rollbackRecord, ...s.rollbackRecords],
  }));

  return { ok: true, rollbackRecord };
}

export function rejectCandidate(candidateId, reason) {
  if (!reason?.trim()) return { ok: false, error: "驳回需要填写理由" };
  const state = repository.get();
  const candidate = state.learningCandidates.find((c) => c.id === candidateId);
  if (!candidate) return { ok: false, error: "候选不存在" };
  if (["promoted", "rejected", "rolledBack"].includes(candidate.status)) {
    return { ok: false, error: "该候选已处理，不能重复操作", alreadyProcessed: true };
  }
  repository.update((s) => ({
    ...s,
    learningCandidates: s.learningCandidates.map((c) => (c.id === candidateId ? { ...c, status: "rejected", rejectionReason: reason } : c)),
  }));
  return { ok: true };
}

/**
 * 记忆净化——对命中的记忆执行受控动作，永远不会在没有明确动作
 * 指令的情况下物理删除重要业务记忆；deleteAfterApproval 仍然只是
 * 标记为待删除，不在这一步真正物理删除数据。
 */
export function applyPurificationAction(memoryId, action) {
  if (!PURIFICATION_ACTIONS.includes(action)) return { ok: false, error: "未知的净化动作" };
  const state = repository.get();
  const memory = state.memoryRecords.find((m) => m.id === memoryId);
  if (!memory) return { ok: false, error: "记忆记录不存在" };

  const nextStatus = {
    retain: memory.status,
    merge: "superseded",
    reducePriority: memory.status,
    deprecate: "deprecated",
    expire: "expired",
    quarantine: "candidate",
    deleteAfterApproval: "rejected",
  }[action];

  repository.update((s) => ({
    ...s,
    memoryRecords: s.memoryRecords.map((m) => (m.id === memoryId ? { ...m, status: nextStatus, purifiedAction: action, purifiedAt: new Date().toISOString() } : m)),
  }));

  return { ok: true, action, nextStatus };
}

// ---------------------------------------------------------------
// 成本智能
// ---------------------------------------------------------------

/**
 * 贡献利润——不是只看 GMV/表面 ROI。
 * 贡献利润 = 营收 - 商品成本 - 平台佣金 - 广告成本 - 退款损失 - 履约成本 - 内容与Token成本
 */
export function computeContributionProfit(input) {
  const {
    revenue = 0, productCost = 0, platformCommission = 0, adCost = 0,
    refundLoss = 0, fulfillmentCost = 0, contentTokenCost = 0,
  } = input;
  const contributionProfit = revenue - productCost - platformCommission - adCost - refundLoss - fulfillmentCost - contentTokenCost;
  return { ...input, contributionProfit };
}

export function getCostIntelligenceSummary(agentId) {
  const costs = getCostRecordsForAgent(agentId);
  const totalModelCost = costs.reduce((sum, c) => sum + c.modelCostUsd, 0);
  const totalBusinessValue = costs.reduce((sum, c) => sum + c.businessValueUsd, 0);
  const state = repository.get();
  const promoted = state.promotionRecords.length;
  return {
    totalRuns: costs.length,
    totalModelCostUsd: Number(totalModelCost.toFixed(2)),
    totalBusinessValueUsd: Number(totalBusinessValue.toFixed(2)),
    avgCostPerRunUsd: costs.length ? Number((totalModelCost / costs.length).toFixed(2)) : 0,
    promotedOptimizations: promoted,
  };
}
