import { createLocalRepository } from "./mockUtils.js";

export const MODEL_CATALOG = [
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    contextWindow: "200K",
    costPer1kIn: 0.003,
    costPer1kOut: 0.015,
    latencyP50Ms: 1200,
    status: "healthy",
  },
  {
    id: "gpt-5",
    provider: "openai",
    label: "GPT-5",
    contextWindow: "256K",
    costPer1kIn: 0.005,
    costPer1kOut: 0.02,
    latencyP50Ms: 1400,
    status: "healthy",
  },
  {
    id: "deepseek-v3",
    provider: "deepseek",
    label: "DeepSeek V3",
    contextWindow: "128K",
    costPer1kIn: 0.0007,
    costPer1kOut: 0.0014,
    latencyP50Ms: 900,
    status: "healthy",
  },
  {
    id: "qwen-max",
    provider: "qwen",
    label: "Qwen Max",
    contextWindow: "128K",
    costPer1kIn: 0.001,
    costPer1kOut: 0.003,
    latencyP50Ms: 1000,
    status: "degraded",
  },
];

const enabledRepository = createLocalRepository("modelRouter.enabled", () =>
  Object.fromEntries(MODEL_CATALOG.map((model) => [model.id, true]))
);

export function getModelEnabledMap() {
  return enabledRepository.get();
}

export function toggleModelEnabled(modelId) {
  return enabledRepository.update((all) => ({ ...all, [modelId]: !all[modelId] }));
}
