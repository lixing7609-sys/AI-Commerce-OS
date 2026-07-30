import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { PromptCenterModule } from "./PromptCenterModule.jsx";
import { StudioPromptsModule } from "../studioLab/StudioAgentModules.jsx";
import { StudioPromptTestModule } from "../studioLab/StudioTestingModules.jsx";

/**
 * Prompt Center — AI Capability Center §design/configure/test stages.
 * `PromptCenterModule` keeps `moduleKey="promptCenter"` internally
 * (see AssetCenterModule), which equals this wrapper's own registered
 * key — its list/detail/create self-navigation stays inside this
 * composite (unlike Agent/Workflow/Capability Center's absorbed
 * children, which keep their own distinct module keys).
 */
const TABS = [
  { key: "prompts", label: "Prompt 列表" },
  { key: "studioPrompts", label: "Studio Prompt" },
  { key: "promptTest", label: "Prompt 测试台" },
];

export function PromptCenterWorkbench() {
  const [tab, setTab] = useState("prompts");

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "prompts" ? <PromptCenterModule /> : null}
      {tab === "studioPrompts" ? <StudioPromptsModule /> : null}
      {tab === "promptTest" ? <StudioPromptTestModule /> : null}
    </div>
  );
}
