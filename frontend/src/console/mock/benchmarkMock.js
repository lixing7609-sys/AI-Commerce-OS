import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";
import { MODEL_CATALOG } from "./modelRouterMock.js";

function seedSuites() {
  return [
    { id: "suite-analysis", name: "经营分析质量基准", targetType: "model" },
    { id: "suite-content", name: "内容生成质量基准", targetType: "model" },
  ];
}

function randomRun(suiteId, model) {
  return {
    id: nextMockId("run"),
    suiteId,
    modelId: model.id,
    modelLabel: model.label,
    score: Math.round(70 + Math.random() * 25),
    costUsd: Number((model.costPer1kOut * (2 + Math.random() * 3)).toFixed(4)),
    latencyMs: model.latencyP50Ms + Math.round(Math.random() * 300),
    successRate: Math.round(88 + Math.random() * 12),
  };
}

function seedRuns() {
  const suites = seedSuites();
  return suites.flatMap((suite) => MODEL_CATALOG.map((model) => randomRun(suite.id, model)));
}

const repository = createLocalRepository("benchmarkCenter.state", () => ({
  suites: seedSuites(),
  runs: seedRuns(),
}));

export function getBenchmarkState() {
  return repository.get();
}

export async function runBenchmark(suiteId) {
  await simulateLatency(800, 1500);
  return repository.update((state) => ({
    ...state,
    runs: [
      ...state.runs.filter((r) => r.suiteId !== suiteId),
      ...MODEL_CATALOG.map((model) => randomRun(suiteId, model)),
    ],
  }));
}

export function recommendModel(runs, suiteId) {
  const suiteRuns = runs.filter((r) => r.suiteId === suiteId);
  if (suiteRuns.length === 0) return null;
  return suiteRuns.reduce((best, r) => (r.score > best.score ? r : best), suiteRuns[0]);
}
