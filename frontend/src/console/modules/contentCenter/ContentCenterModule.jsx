import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { ContentOverview } from "./ContentOverview.jsx";
import { TrendRadar } from "./TrendRadar.jsx";
import { TopicPool } from "./TopicPool.jsx";
import { ContentProjects } from "./ContentProjects.jsx";
import { RepurposingWorkbench } from "./RepurposingWorkbench.jsx";
import { PublishingCalendar } from "./PublishingCalendar.jsx";
import { ContentAssetLibrary } from "./ContentAssetLibrary.jsx";
import { ContentPerformance } from "./ContentPerformance.jsx";

/**
 * 内容中心：内容智能（Content Intelligence）在 Founder 控制台里的
 * 落地入口。不是一个文案生成器——是选题池、内容项目、二创工作台、
 * 发布计划、资产库、数据复盘的完整闭环（阶段 Founder UX Review
 * V4）。每个标签页店铺可筛选，主要记录都关联店铺/平台/类目/商品，
 * 与热点雷达、Agent 工作室、审批中心互相跳转。
 */
const TABS = [
  { key: "overview", label: "内容总览" },
  { key: "trendRadar", label: "热点雷达" },
  { key: "topicPool", label: "选题池" },
  { key: "projects", label: "内容项目" },
  { key: "repurposing", label: "二创工作台" },
  { key: "calendar", label: "发布计划" },
  { key: "assets", label: "内容资产库" },
  { key: "performance", label: "数据复盘" },
];

export function ContentCenterModule() {
  const { subView, navigate } = useConsoleNavContext();
  const activeTab = subView ?? "overview";

  return (
    <div>
      <PageHeader
        title="内容中心"
        subtitle="外部热点 + 内部经营信号 → 匹配 → 二创 → 审核 → 发布 → 广告/直播放大 → 订单/售后 → 知识反馈"
        actions={<DemoBadge />}
      />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={(t) => navigate("contentCenter", { subView: t })} />

      {activeTab === "overview" && <ContentOverview />}
      {activeTab === "trendRadar" && <TrendRadar />}
      {activeTab === "topicPool" && <TopicPool />}
      {activeTab === "projects" && <ContentProjects />}
      {activeTab === "repurposing" && <RepurposingWorkbench />}
      {activeTab === "calendar" && <PublishingCalendar />}
      {activeTab === "assets" && <ContentAssetLibrary />}
      {activeTab === "performance" && <ContentPerformance />}
    </div>
  );
}
