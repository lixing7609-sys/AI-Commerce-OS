import { useMemo, useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { AutomationPolicyModule } from "../automationPolicy/AutomationPolicyModule.jsx";
import { ReplayCenterModule } from "../replayCenter/ReplayCenterModule.jsx";
import { StudioWorkflowsModule } from "../studioLab/StudioAgentModules.jsx";
import { StudioReplayModule } from "../studioLab/StudioTestingModules.jsx";
import { StudioLogsModule } from "../studioLab/StudioOpsModules.jsx";
import { WorkflowCatalogModule } from "./WorkflowCatalogModule.jsx";
import { CapabilityScopeLifecycleBar } from "../../shared/CapabilityScopeLifecycleBar.jsx";

/**
 * Workflow Center — AI Capability Center §configure/test/observe stages.
 * Absorbs the former Founder-only "Studio 实验控制层" workflow/replay/
 * logs modules as Studio-scope tabs (docs/architecture/
 * Founder_Master_Edition_Development_Charter.md §3.2/§3.4) — same
 * capability type (automation/replay/observability), different
 * consuming edition. `automationPolicy`/`replayCenter` keep their own
 * self-navigation keys, so drilling into either un-mounts this tab
 * chrome (same documented trade-off as AgentCenterModule).
 *
 * 中文框架审查版新增：`workflowCatalog`（Workflow 列表 + 简化流程
 * 画布 + 节点/触发条件/失败节点重试，见 WorkflowCatalogModule）以及
 * 顶部版本范围选择器——Founder/Studio 范围对应各自已有 tab，选中时
 * 只展示相关 tab；`workflowCatalog` 本身按 scope 过滤同一份目录，
 * 始终展示（不属于某个单一范围的专属 tab）。
 */
const SCOPED_TABS = [
  { key: "automation", label: "自动化策略", scope: "founder" },
  { key: "replay", label: "回放中心", scope: "founder" },
  { key: "studioWorkflows", label: "Studio Workflow", scope: "studio" },
  { key: "studioReplay", label: "Studio 任务回放", scope: "studio" },
  { key: "studioLogs", label: "运行日志", scope: "studio" },
];
const CATALOG_TAB = { key: "workflowCatalog", label: "Workflow 列表" };

export function WorkflowCenterModule() {
  const [tab, setTab] = useState("workflowCatalog");
  const [scope, setScope] = useState("all");

  const scopedVisibleTabs = useMemo(
    () => (scope === "all" ? SCOPED_TABS : SCOPED_TABS.filter((t) => t.scope === scope)),
    [scope]
  );
  const visibleTabs = [CATALOG_TAB, ...scopedVisibleTabs];
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0].key;

  function handleScopeChange(nextScope) {
    setScope(nextScope);
    const nextScoped = nextScope === "all" ? SCOPED_TABS : SCOPED_TABS.filter((t) => t.scope === nextScope);
    const nextVisible = [CATALOG_TAB, ...nextScoped];
    if (!nextVisible.some((t) => t.key === tab)) setTab(CATALOG_TAB.key);
  }

  return (
    <div>
      <CapabilityScopeLifecycleBar scope={scope} onScopeChange={handleScopeChange} activeStage="测试" />
      <div style={{ margin: "12px 0" }}>
        <Tabs tabs={visibleTabs} activeTab={activeTab} onChange={setTab} />
      </div>
      {activeTab === "workflowCatalog" ? <WorkflowCatalogModule scope={scope} /> : null}
      {activeTab === "automation" ? <AutomationPolicyModule /> : null}
      {activeTab === "replay" ? <ReplayCenterModule /> : null}
      {activeTab === "studioWorkflows" ? <StudioWorkflowsModule /> : null}
      {activeTab === "studioReplay" ? <StudioReplayModule /> : null}
      {activeTab === "studioLogs" ? <StudioLogsModule /> : null}
    </div>
  );
}
