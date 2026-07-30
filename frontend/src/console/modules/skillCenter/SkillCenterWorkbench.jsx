import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { SkillCenterModule } from "./SkillCenterModule.jsx";
import { StudioSkillsModule } from "../studioLab/StudioAgentModules.jsx";
import { CapabilityScopeLifecycleBar } from "../../shared/CapabilityScopeLifecycleBar.jsx";

/**
 * Skill Center — AI Capability Center §design/configure stage.
 * `SkillCenterModule` keeps `moduleKey="skillCenter"` internally, equal
 * to this wrapper's own registered key — see PromptCenterWorkbench.
 */
const TABS = [
  { key: "skills", label: "Skill 列表" },
  { key: "studioSkills", label: "Studio Skill" },
];

export function SkillCenterWorkbench() {
  const [tab, setTab] = useState("skills");
  const [scope, setScope] = useState("all");

  return (
    <div>
      <CapabilityScopeLifecycleBar scope={scope} onScopeChange={setScope} activeStage="设计" />
      <div style={{ margin: "12px 0" }}>
        <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      </div>
      {tab === "skills" ? <SkillCenterModule scope={scope} /> : null}
      {tab === "studioSkills" ? <StudioSkillsModule /> : null}
    </div>
  );
}
