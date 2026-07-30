import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { AgentStudioModule } from "../agentStudio/AgentStudioModule.jsx";
import { ModelRouterModule } from "../modelRouter/ModelRouterModule.jsx";
import { StudioAgentsModule, StudioModelRoutingModule } from "../studioLab/StudioAgentModules.jsx";

/**
 * Agent Center — AI Capability Center §design/configure stage
 * (docs/architecture/Founder_Master_Edition_Development_Charter.md §3.2).
 * Composes the previously-standalone Founder Agent 工作室/模型路由
 * modules with the previously-orphaned "Studio 实验控制层" Agent/模型
 * 路由 modules as scope tabs — Founder-scope agents (per-store Operator
 * agents) and Studio-scope agents (content-production agents) are the
 * same capability type, just consumed by different editions, so they
 * live in one Center instead of two disconnected nav trees.
 *
 * Local (non-URL) tab state, matching the existing convention used by
 * StudioWorkflowsModule/GraphicContentEditorPage — AgentStudioModule/
 * ModelRouterModule self-navigate via `navigate("agentStudio"/"modelRouter", …)`
 * for their own list/detail state, so a URL-driven subView would fight
 * their internal navigation. Drilling into an agent's detail view will
 * therefore un-mount this tab chrome (the bare module renders directly,
 * same as any other hiddenFromSidebar deep-linkable module) — returning
 * to "Agent Center" via the sidebar restores it.
 */
const TABS = [
  { key: "founder", label: "Founder Agents" },
  { key: "modelRouter", label: "模型路由" },
  { key: "studioAgents", label: "Studio Agents" },
  { key: "studioModelRouting", label: "Studio 模型路由" },
];

export function AgentCenterModule() {
  const [tab, setTab] = useState("founder");

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "founder" ? <AgentStudioModule /> : null}
      {tab === "modelRouter" ? <ModelRouterModule /> : null}
      {tab === "studioAgents" ? <StudioAgentsModule /> : null}
      {tab === "studioModelRouting" ? <StudioModelRoutingModule /> : null}
    </div>
  );
}
