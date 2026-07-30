import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { BenchmarkCenterModule } from "../benchmarkCenter/BenchmarkCenterModule.jsx";
import { EvaluationCenterModule } from "../evaluationCenter/EvaluationCenterModule.jsx";
import { AdCenterModule } from "../adCenter/AdCenterModule.jsx";
import { StudioEvaluationModule } from "../studioLab/StudioTestingModules.jsx";
import { StudioCostsModule, StudioReleasesModule } from "../studioLab/StudioOpsModules.jsx";
import { CapabilityCatalogModule } from "./CapabilityCatalogModule.jsx";
import { CapabilityApprovalModule, CapabilityReleaseModule, CapabilityUsageModule } from "./CapabilityLifecycleOpsModules.jsx";
import { CapabilityScopeLifecycleBar } from "../../shared/CapabilityScopeLifecycleBar.jsx";

/**
 * Capability Center — AI Capability Center §evaluate/approve/release
 * stages, the final stretch of the lifecycle before a capability is in
 * live use. Absorbs the former Studio-only A/B评测/成本分析/版本与发布
 * modules as Studio-scope tabs (same rationale as WorkflowCenterModule).
 *
 * 中文框架审查版新增四个 tab：能力目录（Agent/Prompt/Skill/Workflow
 * 统一清单，按顶部版本范围过滤——"Studio/Operator/Cloud 范围能力"
 * 就是这份目录用 scope 过滤后的结果，不单独建三个 tab）、审批中心、
 * 发布中心、使用观察。
 *
 * 「广告策略研发」（AdCenterModule）是广告钱包/投放计划管理，严格
 * 说不属于"AI 能力生命周期"，是既有架构下挂在这里的历史 tab——本轮
 * 未移动它（不确定是否有其它入口依赖这个组合方式），在完成报告里
 * 作为页面职责归属疑问单独列出。
 */
const TABS = [
  { key: "catalog", label: "能力目录" },
  { key: "benchmark", label: "基准测试中心" },
  { key: "evaluation", label: "评测中心" },
  { key: "approval", label: "审批中心" },
  { key: "release", label: "发布中心" },
  { key: "usage", label: "使用观察" },
  { key: "ad", label: "广告策略研发" },
  { key: "studioEvaluation", label: "Studio A/B 评测" },
  { key: "studioCosts", label: "Studio 成本分析" },
  { key: "studioReleases", label: "Studio 版本与发布" },
];

export function CapabilityCenterModule() {
  const [tab, setTab] = useState("catalog");
  const [scope, setScope] = useState("all");

  return (
    <div>
      <CapabilityScopeLifecycleBar scope={scope} onScopeChange={setScope} activeStage="评测" />
      <div style={{ margin: "12px 0" }}>
        <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      </div>
      {tab === "catalog" ? <CapabilityCatalogModule scope={scope} /> : null}
      {tab === "benchmark" ? <BenchmarkCenterModule /> : null}
      {tab === "evaluation" ? <EvaluationCenterModule /> : null}
      {tab === "approval" ? <CapabilityApprovalModule /> : null}
      {tab === "release" ? <CapabilityReleaseModule /> : null}
      {tab === "usage" ? <CapabilityUsageModule /> : null}
      {tab === "ad" ? <AdCenterModule /> : null}
      {tab === "studioEvaluation" ? <StudioEvaluationModule /> : null}
      {tab === "studioCosts" ? <StudioCostsModule /> : null}
      {tab === "studioReleases" ? <StudioReleasesModule /> : null}
    </div>
  );
}
