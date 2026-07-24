import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";

function seedDatasets() {
  return [
    { id: "ds-analysis", name: "经营分析评测集", size: 40 },
    { id: "ds-content", name: "内容生成评测集", size: 25 },
  ];
}

function seedRuns() {
  return [
    {
      id: nextMockId("eval"),
      agentName: "AI CEO",
      agentVersion: 1,
      datasetId: "ds-analysis",
      categoryScores: [
        { category: "准确性", score: 88 },
        { category: "可执行性", score: 82 },
        { category: "格式规范", score: 95 },
      ],
      failingCases: [
        { id: nextMockId("case"), summary: "未识别出库存异常风险" },
      ],
    },
  ];
}

const repository = createLocalRepository("evaluationCenter.state", () => ({
  datasets: seedDatasets(),
  runs: seedRuns(),
}));

export function getEvaluationState() {
  return repository.get();
}

export async function runEvaluation(datasetId, agentName) {
  await simulateLatency(700, 1300);
  return repository.update((state) => ({
    ...state,
    runs: [
      {
        id: nextMockId("eval"),
        agentName,
        agentVersion: 1,
        datasetId,
        categoryScores: [
          { category: "准确性", score: 80 + Math.round(Math.random() * 15) },
          { category: "可执行性", score: 75 + Math.round(Math.random() * 20) },
          { category: "格式规范", score: 88 + Math.round(Math.random() * 10) },
        ],
        failingCases: [],
      },
      ...state.runs,
    ],
  }));
}
