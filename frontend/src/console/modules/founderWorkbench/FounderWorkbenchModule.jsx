import { Tabs } from "../../kit/Tabs.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { SecretaryModule } from "../secretary/SecretaryModule.jsx";
import { DashboardModule } from "../dashboard/DashboardModule.jsx";

/**
 * Founder工作台——阶段 Founder Full-System v3 Batch 2 §A。目标信息
 * 架构里"Founder工作台"是唯一一条顶级叶子节点，不是"AI 秘书处"和
 * "今日经营"两个平级按钮。这里不重写这两个模块的实现（它们本来就
 * 是完整、独立验证过的功能），只是把它们收进同一个入口下用 Tab 切换
 * ——两个组件本身完全未改动，旧的 `?module=secretary` /
 * `?module=dashboard` 链接通过 navConfig.js 的 MODULE_REDIRECTS 落到
 * 对应 Tab，不会 404。
 */
const TABS = [
  { key: "secretary", label: "AI 秘书" },
  { key: "dashboard", label: "今日经营" },
];

export function FounderWorkbenchModule() {
  const { subView, navigate } = useConsoleNavContext();
  const activeTab = subView === "dashboard" ? "dashboard" : "secretary";

  return (
    <div>
      <Tabs tabs={TABS} activeTab={activeTab} onChange={(t) => navigate("founderWorkbench", { subView: t })} />
      {activeTab === "dashboard" ? <DashboardModule /> : <SecretaryModule />}
    </div>
  );
}
