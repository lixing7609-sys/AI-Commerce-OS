import { useState } from "react";
import { Tabs } from "./uiHelpers.jsx";
import { DataAnalyticsPage, ComputeTasksPage } from "./PlatformPages.jsx";
import { MonetizationCenterPage, RevenueSharePage, KnowledgeProductsPage } from "./MonetizationPages.jsx";

const TABS = [
  { key: "data", label: "内容数据" },
  { key: "monetization", label: "商业变现" },
  { key: "revenueShare", label: "平台分成" },
  { key: "knowledge", label: "知识产品" },
  { key: "compute", label: "算力任务" },
];

/** Studio Lab · Analytics (Charter §3.4). */
export function AnalyticsWorkbench({ navigate }) {
  const [tab, setTab] = useState("data");

  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "data" ? <DataAnalyticsPage /> : null}
      {tab === "monetization" ? <MonetizationCenterPage navigate={navigate} /> : null}
      {tab === "revenueShare" ? <RevenueSharePage /> : null}
      {tab === "knowledge" ? <KnowledgeProductsPage /> : null}
      {tab === "compute" ? <ComputeTasksPage /> : null}
    </div>
  );
}
