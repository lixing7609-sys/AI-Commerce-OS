import { createLocalRepository, nextMockId } from "./mockUtils.js";

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
