import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { SkillCenterModule } from "./SkillCenterModule.jsx";
import { StudioSkillsModule } from "../studioLab/StudioAgentModules.jsx";

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

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "skills" ? <SkillCenterModule /> : null}
      {tab === "studioSkills" ? <StudioSkillsModule /> : null}
    </div>
  );
}
