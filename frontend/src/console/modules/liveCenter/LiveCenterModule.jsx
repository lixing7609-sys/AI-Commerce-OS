import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { LiveOverview } from "./LiveOverview.jsx";
import { LivePlanning } from "./LivePlanning.jsx";
import { LiveLineup } from "./LiveLineup.jsx";
import { LiveScript } from "./LiveScript.jsx";
import { LiveTrendOpportunities } from "./LiveTrendOpportunities.jsx";
import { LiveControlRoom } from "./LiveControlRoom.jsx";
import { LiveReview } from "./LiveReview.jsx";

/**
 * AI 直播中心：三种模式清楚区分——"真人直播 + AI 辅助"是当前
 * Founder Alpha 阶段最实际的模式，"无人直播工作流"标注为高风险
 * 受限模式（阶段 Founder UX Review V4）。全部数据均为演示，不
 * 连接任何真实直播平台，不执行任何真实直播/场控操作。
 */
const TABS = [
  { key: "overview", label: "直播总览" },
  { key: "planning", label: "直播计划" },
  { key: "lineup", label: "直播排品" },
  { key: "script", label: "直播脚本" },
  { key: "trends", label: "实时热点与机会" },
  { key: "controlRoom", label: "实时场控" },
  { key: "review", label: "直播复盘" },
];

export function LiveCenterModule() {
  const { subView, navigate } = useConsoleNavContext();
  const activeTab = subView ?? "overview";

  return (
    <div>
      <PageHeader
        title="AI直播中心"
        subtitle="直播计划 → 排品 → 脚本 → 实时场控 → 复盘 → 内容/知识反馈（全部为演示数据，不连接真实直播平台）"
        actions={<DemoBadge />}
      />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={(t) => navigate("liveCenter", { subView: t })} />

      {activeTab === "overview" && <LiveOverview />}
      {activeTab === "planning" && <LivePlanning />}
      {activeTab === "lineup" && <LiveLineup />}
      {activeTab === "script" && <LiveScript />}
      {activeTab === "trends" && <LiveTrendOpportunities />}
      {activeTab === "controlRoom" && <LiveControlRoom />}
      {activeTab === "review" && <LiveReview />}
    </div>
  );
}
