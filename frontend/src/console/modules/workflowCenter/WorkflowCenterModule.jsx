import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { AutomationPolicyModule } from "../automationPolicy/AutomationPolicyModule.jsx";
import { ReplayCenterModule } from "../replayCenter/ReplayCenterModule.jsx";
import { StudioWorkflowsModule } from "../studioLab/StudioAgentModules.jsx";
import { StudioReplayModule } from "../studioLab/StudioTestingModules.jsx";
import { StudioLogsModule } from "../studioLab/StudioOpsModules.jsx";

/**
 * Workflow Center — AI Capability Center §configure/test/observe stages.
 * Absorbs the former Founder-only "Studio 实验控制层" workflow/replay/
 * logs modules as Studio-scope tabs (docs/architecture/
 * Founder_Master_Edition_Development_Charter.md §3.2/§3.4) — same
 * capability type (automation/replay/observability), different
 * consuming edition. `automationPolicy`/`replayCenter` keep their own
 * self-navigation keys, so drilling into either un-mounts this tab
 * chrome (same documented trade-off as AgentCenterModule).
 */
const TABS = [
  { key: "automation", label: "自动化策略" },
  { key: "replay", label: "回放中心" },
  { key: "studioWorkflows", label: "Studio Workflow" },
  { key: "studioReplay", label: "Studio 任务回放" },
  { key: "studioLogs", label: "运行日志" },
];

export function WorkflowCenterModule() {
  const [tab, setTab] = useState("automation");

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "automation" ? <AutomationPolicyModule /> : null}
      {tab === "replay" ? <ReplayCenterModule /> : null}
      {tab === "studioWorkflows" ? <StudioWorkflowsModule /> : null}
      {tab === "studioReplay" ? <StudioReplayModule /> : null}
      {tab === "studioLogs" ? <StudioLogsModule /> : null}
    </div>
  );
}
