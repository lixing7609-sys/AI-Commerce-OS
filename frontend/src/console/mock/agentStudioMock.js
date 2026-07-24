import { createLocalRepository, nextMockId } from "./mockUtils.js";
import { getPromptSkillState } from "./promptSkillMock.js";
import { getKnowledgeState } from "./knowledgeMock.js";
import { DEMO_STORES } from "./storesMock.js";

/**
 * Agent 工作室的可编辑配置——localStorage 持久化（阶段 Founder
 * Alpha 硬性要求：编辑必须跨刷新/跨导航可见）。真实后端 GET
 * /api/v1/agents 目前只暴露标准 Agent 类型（name/role/description/
 * status/current_task），本身不区分店铺；Founder 不能手工创建新的
 * Agent 类型，但每个店铺拥有自己独立的一份"该 Agent 类型的配置
 * 实例"——同一个「产品 Agent」在店铺 A 和店铺 B 下可以绑定不同的
 * Prompt/Skill/Knowledge/Model，互不影响（阶段 Founder UX Review
 * V3，P0-5）。配置仓库因此以 `${storeId}::${agentName}` 复合 key
 * 存储，而不是单纯以 agentName 为 key。
 *
 * 阶段 Founder UX Review V1 修订（P0-4，V3 扩展为 P0-4）：Agent
 * 工作室不再自己存一份独立的 Prompt 正文/Skill/Knowledge 列表——
 * 只存 promptId / skillBindings / knowledgeBindings（引用资产库里
 * 的条目、是否对本店铺本 Agent 启用）。资产本身的增删改在 Agent
 * 工作室内的「Prompt 资产库 / Skill 资产库 / Knowledge 资产库」
 * 标签页完成（不再有独立的 Prompt / Skill 工作室模块）；这里只
 * 决定"这个店铺的这个 Agent 引用哪个资产、是否启用"。
 */

export function configKey(storeId, agentName) {
  return `${storeId}::${agentName}`;
}

export function parseConfigKey(key) {
  const [storeId, ...rest] = key.split("::");
  return { storeId, agentName: rest.join("::") };
}

export const TASK_TYPES = [
  { key: "analysis", label: "经营分析" },
  { key: "content_generation", label: "内容生成" },
  { key: "customer_reply", label: "客服问答" },
];

export const MODEL_OPTIONS = [
  { id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5" },
  { id: "gpt-5", provider: "openai", label: "GPT-5" },
  { id: "deepseek-v3", provider: "deepseek", label: "DeepSeek V3" },
  { id: "qwen-max", provider: "qwen", label: "Qwen Max" },
];

function defaultModelRouting() {
  return TASK_TYPES.map((taskType, idx) => ({
    taskType: taskType.key,
    provider: MODEL_OPTIONS[idx % MODEL_OPTIONS.length].provider,
    modelId: MODEL_OPTIONS[idx % MODEL_OPTIONS.length].id,
    fallbackModelId: MODEL_OPTIONS[(idx + 1) % MODEL_OPTIONS.length].id,
    temperature: 0.4,
    maxTokens: 2000,
    costLimitUsd: 2,
  }));
}

function pickDefaultPrompt(agentName, prompts) {
  return (
    prompts.find((p) => p.linkedAgentIds.includes(agentName)) ??
    prompts.find((p) => p.category === "通用") ??
    prompts[0]
  );
}

/**
 * 演示用的确定性"随机数"——同一个 store+agent 组合每次生成的
 * 运营指标保持一致（只在配置第一次创建时生成一次并持久化），不同
 * 店铺之间的数值明显不同，用来体现"店铺级配置与数据互相隔离"。
 */
function seededRange(seedText, min, max) {
  let hash = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  }
  const ratio = (hash % 1000) / 1000;
  return Math.round(min + ratio * (max - min));
}

const ACTIVE_STATUSES = ["active", "active", "active", "paused", "warning", "failed"];

/**
 * 健康状态与运行记录（阶段 Founder UX Review V4，P0-43 扩展）：
 * 每张 Agent 卡片除了成本/成功率，还要能看到健康百分比、运行
 * 状态、最近一次成功/失败时间、重试次数与待审批数——这些同样是
 * 确定性伪随机生成，同一店铺+Agent 组合数值稳定，不同组合明显
 * 不同，用于体现"店铺级配置互相隔离"。
 */
function defaultOperatingMetrics(storeId, agentName) {
  const seed = `${storeId}:${agentName}`;
  const health = seededRange(`${seed}:health`, 62, 100);
  const status = health >= 90 ? "active" : ACTIVE_STATUSES[seededRange(`${seed}:status`, 0, ACTIVE_STATUSES.length - 1)];
  return {
    healthPercent: health,
    activeStatus: status,
    todayCostUsd: seededRange(`${seed}:today`, 2, 40) / 10,
    sevenDayCostUsd: seededRange(`${seed}:7d`, 20, 260) / 10,
    tasksCompleted: seededRange(`${seed}:tasks`, 8, 120),
    successRate: seededRange(`${seed}:success`, 82, 99),
    avgCostPerTaskUsd: seededRange(`${seed}:avgcost`, 3, 30) / 100,
    avgLatencyMs: seededRange(`${seed}:latency`, 900, 3200),
    tokenConsumption: seededRange(`${seed}:tokens`, 800, 9600),
    lastSuccessfulRunAt: new Date(Date.now() - seededRange(`${seed}:lastok`, 5, 600) * 60000).toISOString(),
    lastFailureAt: status === "failed" || status === "warning" ? new Date(Date.now() - seededRange(`${seed}:lastfail`, 10, 900) * 60000).toISOString() : null,
    retryCount: status === "failed" ? seededRange(`${seed}:retry`, 1, 4) : 0,
    pendingApprovals: seededRange(`${seed}:pending`, 0, 3),
  };
}

function defaultConfigFor(agentName, storeId) {
  const { prompts, skills } = getPromptSkillState();
  const { assets: knowledgeAssets } = getKnowledgeState();
  const defaultPrompt = pickDefaultPrompt(agentName, prompts);

  return {
    agentName,
    storeId,
    promptId: defaultPrompt?.id ?? null,
    skillBindings: skills.map((skill) => ({
      skillId: skill.id,
      enabled: skill.linkedAgentIds.includes(agentName),
    })),
    knowledgeBindings: knowledgeAssets
      .filter((asset) => asset.applicableStore === null || asset.applicableStore === storeId)
      .map((asset) => ({
        knowledgeId: asset.id,
        enabled: asset.linkedAgentIds.includes(agentName),
      })),
    modelRouting: defaultModelRouting(),
    toolPermissions: [
      { id: "tool-read-orders", name: "读取订单数据", enabled: true, permission: "read" },
      { id: "tool-read-inventory", name: "读取库存数据", enabled: true, permission: "read" },
      { id: "tool-write-listing", name: "创建/编辑商品草稿", enabled: false, permission: "write" },
    ],
    versions: [
      {
        version: 1,
        status: "published",
        publishedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        snapshot: "初始版本",
      },
    ],
    runHistory: [
      {
        id: nextMockId("run"),
        startedAt: new Date(Date.now() - 3600000).toISOString(),
        status: "completed",
        tokensUsed: 1240,
        replayId: nextMockId("replay"),
      },
      {
        id: nextMockId("run"),
        startedAt: new Date(Date.now() - 7200000).toISOString(),
        status: "completed",
        tokensUsed: 980,
        replayId: nextMockId("replay"),
      },
    ],
    evaluationScores: [
      { date: "07-17", score: 82 },
      { date: "07-18", score: 85 },
      { date: "07-19", score: 81 },
      { date: "07-20", score: 88 },
      { date: "07-21", score: 90 },
      { date: "07-22", score: 87 },
      { date: "07-23", score: 91 },
    ],
    operatingMetrics: defaultOperatingMetrics(storeId, agentName),
  };
}

const repository = createLocalRepository("agentStudio.configs", () => ({}));

export function getAgentConfig(agentName, storeId = DEMO_STORES[0].id) {
  const key = configKey(storeId, agentName);
  const all = repository.get();
  if (!all[key]) {
    all[key] = defaultConfigFor(agentName, storeId);
    repository.set(all);
  }
  return all[key];
}

export function getAllAgentConfigs() {
  return repository.get();
}

export function updateAgentConfig(agentName, storeId, patch) {
  const key = configKey(storeId, agentName);
  return repository.update((all) => {
    const current = all[key] ?? defaultConfigFor(agentName, storeId);
    return { ...all, [key]: { ...current, ...patch } };
  })[key];
}

export function publishAgentVersion(agentName, storeId, snapshotLabel) {
  const key = configKey(storeId, agentName);
  return repository.update((all) => {
    const current = all[key] ?? defaultConfigFor(agentName, storeId);
    const nextVersion = (current.versions[current.versions.length - 1]?.version ?? 0) + 1;
    const versions = current.versions.map((v) => ({ ...v, status: v.status === "published" ? "archived" : v.status }));
    versions.push({
      version: nextVersion,
      status: "published",
      publishedAt: new Date().toISOString(),
      snapshot: snapshotLabel || `版本 ${nextVersion}`,
    });
    return { ...all, [key]: { ...current, versions } };
  })[key];
}

export function rollbackAgentVersion(agentName, storeId, targetVersion) {
  const key = configKey(storeId, agentName);
  return repository.update((all) => {
    const current = all[key] ?? defaultConfigFor(agentName, storeId);
    const versions = current.versions.map((v) => ({
      ...v,
      status: v.version === targetVersion ? "published" : v.status === "published" ? "archived" : v.status,
    }));
    return { ...all, [key]: { ...current, versions } };
  })[key];
}

export function appendRunHistory(agentName, storeId, entry) {
  const key = configKey(storeId, agentName);
  return repository.update((all) => {
    const current = all[key] ?? defaultConfigFor(agentName, storeId);
    return {
      ...all,
      [key]: { ...current, runHistory: [entry, ...current.runHistory] },
    };
  })[key];
}

// ---------------------------------------------------------------------
// 配置生命周期管理（阶段 Founder UX Review V1 修订 P0-6）。Founder
// 不手工创建/删除 Agent——Agent 本身来自真实后端的标准类型；这里
// 管理的是"某个 Agent 的配置"这份数据本身的生命周期：复制到另一
// 个 Agent 作为起点、导出/导入 JSON、重置为默认值。
// ---------------------------------------------------------------------

/**
 * 复制配置的目标既可以是"同一个 Agent 类型在另一个店铺下的配置"
 * （最常见：把店铺 A 跑通的配置作为店铺 B 的起点），也可以是同一
 * 店铺下的另一个 Agent 类型——由调用方传入的 target 决定。
 */
export function duplicateConfigToAgent(source, target) {
  const sourceConfig = getAgentConfig(source.agentName, source.storeId);
  const targetKey = configKey(target.storeId, target.agentName);
  return repository.update((all) => ({
    ...all,
    [targetKey]: {
      ...sourceConfig,
      agentName: target.agentName,
      storeId: target.storeId,
      versions: [
        {
          version: 1,
          status: "published",
          publishedAt: new Date().toISOString(),
          snapshot: `从「${source.agentName} · ${source.storeId}」复制配置`,
        },
      ],
      runHistory: [],
      operatingMetrics: defaultOperatingMetrics(target.storeId, target.agentName),
    },
  }))[targetKey];
}

export function exportAgentConfigJson(agentName, storeId) {
  const config = getAgentConfig(agentName, storeId);
  return JSON.stringify({ agentName, storeId, exportedAt: new Date().toISOString(), config }, null, 2);
}

export function importAgentConfigJson(agentName, storeId, jsonString) {
  const parsed = JSON.parse(jsonString);
  const importedConfig = parsed.config ?? parsed;
  const key = configKey(storeId, agentName);
  return repository.update((all) => ({
    ...all,
    [key]: { ...getAgentConfig(agentName, storeId), ...importedConfig },
  }))[key];
}

export function resetAgentConfigToDefault(agentName, storeId) {
  const key = configKey(storeId, agentName);
  return repository.update((all) => ({
    ...all,
    [key]: defaultConfigFor(agentName, storeId),
  }))[key];
}
