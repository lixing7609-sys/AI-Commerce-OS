import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { PromptCenterModule } from "./PromptCenterModule.jsx";
import { StudioPromptsModule } from "../studioLab/StudioAgentModules.jsx";
import { StudioPromptTestModule } from "../studioLab/StudioTestingModules.jsx";
import { CapabilityScopeLifecycleBar } from "../../shared/CapabilityScopeLifecycleBar.jsx";

/**
 * Prompt Center — AI Capability Center §design/configure/test stages.
 * `PromptCenterModule` keeps `moduleKey="promptCenter"` internally
 * (see AssetCenterModule), which equals this wrapper's own registered
 * key — its list/detail/create self-navigation stays inside this
 * composite (unlike Agent/Workflow/Capability Center's absorbed
 * children, which keep their own distinct module keys).
 *
 * 顶部版本范围选择器（中文框架审查版新增）状态由这里统一持有，
 * 只传给 `prompts` tab 用于过滤 Prompt 列表——Studio Prompt/Prompt
 * 测试台两个 tab 本身已经是 Studio 范围专用页面，不受此过滤影响。
 */
const TABS = [
  { key: "prompts", label: "Prompt 列表" },
  { key: "studioPrompts", label: "Studio Prompt" },
  { key: "promptTest", label: "Prompt 测试台" },
];

export function PromptCenterWorkbench() {
  const [tab, setTab] = useState("prompts");
  const [scope, setScope] = useState("all");

  return (
    <div>
      <CapabilityScopeLifecycleBar scope={scope} onScopeChange={setScope} activeStage="设计" />
      <div style={{ margin: "12px 0" }}>
        <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      </div>
      {tab === "prompts" ? <PromptCenterModule scope={scope} /> : null}
      {tab === "studioPrompts" ? <StudioPromptsModule /> : null}
      {tab === "promptTest" ? <StudioPromptTestModule /> : null}
    </div>
  );
}
