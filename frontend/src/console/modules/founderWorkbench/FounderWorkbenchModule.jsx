import { Tabs } from "../../kit/Tabs.jsx";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { SecretaryModule } from "../secretary/SecretaryModule.jsx";
import { DashboardModule } from "../dashboard/DashboardModule.jsx";
import { FounderSinoPanel } from "./FounderSinoPanel.jsx";

/**
 * 今日总览（founderWorkbench）——阶段 Founder Full-System v3 Batch 2
 * §A。目标信息架构里"今日总览"是唯一一条顶级叶子节点，不是"AI 秘书"
 * 和"今日经营"两个平级按钮。这里不重写这两个模块的实现（它们本来就
 * 是完整、独立验证过的功能），只是把它们收进同一个入口下用 Tab 切换
 * ——两个组件本身内部结构未改动，旧的 `?module=secretary` /
 * `?module=dashboard` 链接通过 navConfig.js 的 MODULE_REDIRECTS 落到
 * 对应 Tab，不会 404。这里只加一条页面级标题条，两个 Tab 各自已经
 * 有自己的 PageHeader/DemoBadge，不重复。
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
      <PageHeader title="今日总览" subtitle="Founder 每日入口——AI 秘书给出优先决策，今日经营看完整数据" actions={<DemoBadge />} />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={(t) => navigate("founderWorkbench", { subView: t })} />
      {activeTab === "dashboard" ? <DashboardModule /> : <><FounderSinoPanel /><SecretaryModule /></>}
    </div>
  );
}
