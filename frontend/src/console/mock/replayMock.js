import { createLocalRepository, nextMockId } from "./mockUtils.js";

/**
 * 经营闭环业务事件链（阶段 Founder V4.3）——与上面 Agent 运行历史的
 * 回放（getOrCreateReplay/listReplayIds）是两套并行但共用同一个
 * "回放"概念的记录：Agent 运行回放关注单次 Agent 调用的
 * Prompt/Tool/Model 步骤；业务闭环回放关注"店铺/商品选择 → 内容
 * 生成 → 审批 → 发布 → 流量 → 订单 → 客服 → 复盘 → 知识候选"这条
 * 跨模块业务事件链，用同一个 runId 把所有模块的动作串起来。回放
 * 中心只是审计/诊断入口，不承担日常操作——这里只追加事件，不提供
 * "从回放里直接改数据"的能力。
 */
const businessChainRepository = createLocalRepository("replayCenter.businessChains", () => ({}));

export function appendReplayEvent(runId, event) {
  const all = businessChainRepository.get();
  const existing = all[runId] ?? { runId, events: [] };
  const record = {
    id: nextMockId("revt"),
    time: new Date().toISOString(),
    ...event,
  };
  const next = { ...existing, events: [...existing.events, record] };
  businessChainRepository.set({ ...all, [runId]: next });
  return record;
}

export function getBusinessChainRun(runId) {
  return businessChainRepository.get()[runId] ?? null;
}

export function listBusinessChainRuns() {
  return Object.values(businessChainRepository.get());
}

const STEP_TEMPLATES = [
  { type: "prompt", label: "System Prompt 载入" },
  { type: "tool_call", label: "读取店铺经营数据" },
  { type: "model_response", label: "模型生成分析结果" },
];

function generateSteps() {
  return STEP_TEMPLATES.map((tpl, idx) => ({
    id: nextMockId("step"),
    type: tpl.type,
    label: tpl.label,
    payload: tpl.type === "model_response" ? { summary: "（演示）经营状况整体平稳，建议关注库存周转。" } : { note: "（演示）" + tpl.label },
    tokensUsed: tpl.type === "model_response" ? 400 + idx * 120 : 0,
    durationMs: 200 + idx * 150,
  }));
}

const repository = createLocalRepository("replayCenter.traces", () => ({}));

export function getOrCreateReplay(replayId, agentName) {
  const all = repository.get();
  if (!all[replayId]) {
    all[replayId] = {
      id: replayId,
      agentName: agentName ?? "未知 Agent",
      steps: generateSteps(),
    };
    repository.set(all);
  }
  return all[replayId];
}

export function listReplayIds() {
  return Object.keys(repository.get());
}
