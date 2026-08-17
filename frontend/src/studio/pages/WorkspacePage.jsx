import { useState } from "react";
import { Tabs } from "./uiHelpers.jsx";
import { OverviewPage } from "./OverviewPage.jsx";
import { SecretaryPage } from "./SecretaryPage.jsx";
import { ContentProjectsPage } from "./ContentPages.jsx";
import { HotspotAnalysisPage, TrendForecastPage, TopicPoolPage } from "./HotspotPages.jsx";
import { MinimalStudioFlow } from "./MinimalStudioFlow.jsx";

const TABS = [
  { key: "minimal", label: "最小生成" },
  { key: "overview", label: "总览" },
  { key: "secretary", label: "秘书" },
  { key: "projects", label: "项目队列" },
  { key: "hotspot", label: "选题与热点" },
];

/**
 * Studio Lab · Workspace (Charter §3.4) — project overview, production
 * queue, and selection/hotspot inputs only. Per the charter, this does
 * NOT own any production pipeline — every AI-type item (Image/Video/
 * Article/Live/Short Drama/Audio) owns its own end-to-end pipeline.
 */
export function WorkspacePage({ navigate }) {
  const [tab, setTab] = useState("minimal");

  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "minimal" ? <MinimalStudioFlow /> : null}
      {tab === "overview" ? <OverviewPage navigate={navigate} /> : null}
      {tab === "secretary" ? <SecretaryPage navigate={navigate} /> : null}
      {tab === "projects" ? <ContentProjectsPage navigate={navigate} /> : null}
      {tab === "hotspot" ? (
        <div>
          <HotspotAnalysisPage navigate={navigate} />
          <TrendForecastPage />
          <TopicPoolPage navigate={navigate} />
        </div>
      ) : null}
    </div>
  );
}
