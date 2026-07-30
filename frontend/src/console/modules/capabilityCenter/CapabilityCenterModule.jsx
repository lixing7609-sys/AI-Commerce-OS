import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { BenchmarkCenterModule } from "../benchmarkCenter/BenchmarkCenterModule.jsx";
import { EvaluationCenterModule } from "../evaluationCenter/EvaluationCenterModule.jsx";
import { AdCenterModule } from "../adCenter/AdCenterModule.jsx";
import { StudioEvaluationModule } from "../studioLab/StudioTestingModules.jsx";
import { StudioCostsModule, StudioReleasesModule } from "../studioLab/StudioOpsModules.jsx";

/**
 * Capability Center — AI Capability Center §evaluate/approve/release
 * stages, the final stretch of the lifecycle before a capability is in
 * live use. Absorbs the former Studio-only A/B评测/成本分析/版本与发布
 * modules as Studio-scope tabs (same rationale as WorkflowCenterModule).
 */
const TABS = [
  { key: "benchmark", label: "基准测试中心" },
  { key: "evaluation", label: "评估中心" },
  { key: "ad", label: "广告策略研发" },
  { key: "studioEvaluation", label: "Studio A/B 评测" },
  { key: "studioCosts", label: "Studio 成本分析" },
  { key: "studioReleases", label: "Studio 版本与发布" },
];

export function CapabilityCenterModule() {
  const [tab, setTab] = useState("benchmark");

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "benchmark" ? <BenchmarkCenterModule /> : null}
      {tab === "evaluation" ? <EvaluationCenterModule /> : null}
      {tab === "ad" ? <AdCenterModule /> : null}
      {tab === "studioEvaluation" ? <StudioEvaluationModule /> : null}
      {tab === "studioCosts" ? <StudioCostsModule /> : null}
      {tab === "studioReleases" ? <StudioReleasesModule /> : null}
    </div>
  );
}
