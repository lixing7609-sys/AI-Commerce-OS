import { useState } from "react";
import { getStudioState } from "../mock/studioMock.js";
import { formatMoney } from "./formatters.js";
import { Card, DemoBadge, Pill, Table } from "./uiHelpers.jsx";
import { LiveCommercePage } from "./MonetizationPages.jsx";

const LIVE_STATUS_TONE = { 已排期: "neutral", 进行中: "info", 待审核: "warning", 已结束: "success" };

const TABS = [
  { key: "idea", label: "Idea" },
  { key: "script", label: "Script" },
  { key: "rehearsal", label: "Rehearsal" },
  { key: "console", label: "Live Console" },
  { key: "commerce", label: "带货" },
  { key: "review", label: "Review" },
  { key: "publish", label: "Publish" },
];

/**
 * Studio Lab · AI Live (Charter §3.4) — Idea→Script→Rehearsal→Live
 * Console→带货→Review→Publish. `aiLiveProjects` previously rendered
 * as one flat read-only table (the least pipeline-shaped of the six
 * AI types); this reworks it into the same tab structure as the other
 * types, folding the former standalone "带货与直播" monetization page
 * in as this pipeline's own 带货 stage rather than a separate
 * top-level item.
 */
export function AiLiveWorkbench() {
  const [tab, setTab] = useState("idea");
  const { aiLiveProjects } = getStudioState();

  return (
    <Card title="AI 直播" action={<DemoBadge />}>
      <div className="st-tabs" style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`st-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "idea" ? (
        <Table
          columns={[
            { key: "name", label: "直播项目" }, { key: "topicOrProduct", label: "商品/主题" }, { key: "platform", label: "直播平台" },
          ]}
          rows={aiLiveProjects}
        />
      ) : null}
      {tab === "script" ? (
        <Table columns={[{ key: "name", label: "直播项目" }, { key: "script", label: "直播脚本" }, { key: "digitalHuman", label: "数字人" }]} rows={aiLiveProjects} />
      ) : null}
      {tab === "rehearsal" ? (
        <Table columns={[{ key: "name", label: "直播项目" }, { key: "sessionCount", label: "已排练/已开播场次" }, { key: "complianceRisk", label: "违规风险自查" }]} rows={aiLiveProjects} />
      ) : null}
      {tab === "console" ? (
        <Table
          columns={[
            { key: "name", label: "直播项目" },
            { key: "status", label: "当前状态", render: (r) => <Pill tone={LIVE_STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill> },
            { key: "viewers", label: "实时观看人数", render: (r) => r.viewers.toLocaleString() },
            { key: "traffic", label: "流量", render: (r) => r.traffic.toLocaleString() },
          ]}
          rows={aiLiveProjects}
        />
      ) : null}
      {tab === "commerce" ? <LiveCommercePage /> : null}
      {tab === "review" ? (
        <Table columns={[{ key: "name", label: "直播项目" }, { key: "complianceRisk", label: "违规风险" }, { key: "status", label: "状态", render: (r) => <Pill tone={LIVE_STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill> }]} rows={aiLiveProjects} />
      ) : null}
      {tab === "publish" ? (
        <Table columns={[{ key: "name", label: "直播项目" }, { key: "platform", label: "发布平台" }, { key: "revenue", label: "收入", render: (r) => formatMoney(r.revenue) }]} rows={aiLiveProjects} />
      ) : null}
    </Card>
  );
}
