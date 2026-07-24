import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { TrafficOverview } from "./TrafficOverview.jsx";
import { OfficialAccounts } from "./OfficialAccounts.jsx";
import { MatrixAccounts } from "./MatrixAccounts.jsx";
import { CreatorCooperation } from "./CreatorCooperation.jsx";
import { ContentSupplyCenter } from "./ContentSupplyCenter.jsx";
import { TrafficDistribution } from "./TrafficDistribution.jsx";
import { TrafficRevenue } from "./TrafficRevenue.jsx";
import { NetworkAnalytics } from "./NetworkAnalytics.jsx";

/**
 * 流量网络中心（阶段 Founder UX Review V4.1）：AI Commerce Network
 * 层——组织、增长、分发、变现整张流量网络，不是单纯的社媒账号
 * 管理工具。核心理念："流量不是一个池子，而是一张网络"：每个
 * 账号、达人、直播、内容资产、广告账户和运营者都是网络里的一个
 * 节点。桥接：内容 → 流量 → 广告 → 直播 → 店铺 → 订单 → 收益。
 * 全部为演示数据，不连接任何真实平台。
 */
const TABS = [
  { key: "overview", label: "流量总览" },
  { key: "official", label: "官方账号" },
  { key: "matrix", label: "矩阵账号" },
  { key: "creators", label: "达人/KOC合作" },
  { key: "supply", label: "内容供应中心" },
  { key: "distribution", label: "流量分发" },
  { key: "revenue", label: "流量收益" },
  { key: "analytics", label: "网络分析" },
];

export function TrafficNetworkCenterModule() {
  const { subView, navigate } = useConsoleNavContext();
  const activeTab = subView ?? "overview";

  return (
    <div>
      <PageHeader
        title="流量网络中心"
        subtitle="内容 → 流量 → 广告 → 直播 → 店铺 → 订单 → 收益——AI Commerce Network 的长期竞争力（全部为演示数据，不连接真实平台）"
        actions={<DemoBadge />}
      />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={(t) => navigate("trafficNetworkCenter", { subView: t })} />

      {activeTab === "overview" && <TrafficOverview />}
      {activeTab === "official" && <OfficialAccounts />}
      {activeTab === "matrix" && <MatrixAccounts />}
      {activeTab === "creators" && <CreatorCooperation />}
      {activeTab === "supply" && <ContentSupplyCenter />}
      {activeTab === "distribution" && <TrafficDistribution />}
      {activeTab === "revenue" && <TrafficRevenue />}
      {activeTab === "analytics" && <NetworkAnalytics />}
    </div>
  );
}
