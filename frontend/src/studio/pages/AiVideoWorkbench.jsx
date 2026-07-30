import { useState } from "react";
import { getStudioState } from "../mock/studioMock.js";
import { Card, DemoBadge, Table } from "./uiHelpers.jsx";

const TABS = [
  { key: "idea", label: "Idea" },
  { key: "script", label: "Script" },
  { key: "shotlist", label: "Shot List" },
  { key: "generate", label: "Generate" },
  { key: "edit", label: "Edit" },
  { key: "review", label: "Review" },
  { key: "publish", label: "Publish" },
];

const COLUMNS_BY_TAB = {
  idea: [
    { key: "name", label: "视频任务" },
    { key: "template", label: "视频模板" },
    { key: "stage", label: "当前进度" },
  ],
  script: [
    { key: "name", label: "视频任务" },
    { key: "scriptStatus", label: "脚本状态" },
  ],
  shotlist: [
    { key: "name", label: "视频任务" },
    { key: "storyboardStatus", label: "分镜状态" },
    { key: "assetStatus", label: "素材状态" },
  ],
  generate: [
    { key: "name", label: "视频任务" },
    { key: "generationModel", label: "生成模型" },
    { key: "tokenCost", label: "Token 成本", render: (r) => r.tokenCost.toLocaleString() },
    { key: "computeCost", label: "算力成本" },
  ],
  edit: [
    { key: "name", label: "视频任务" },
    { key: "stage", label: "当前进度" },
    { key: "assetStatus", label: "素材状态" },
  ],
  review: [
    { key: "name", label: "视频任务" },
    { key: "stage", label: "当前进度" },
  ],
  publish: [
    { key: "name", label: "视频任务" },
    { key: "publishPlatform", label: "发布平台" },
    { key: "performance", label: "数据表现" },
  ],
};

/**
 * Studio Lab · AI Video (Charter §3.4) — Idea→Script→Shot List→
 * Generate→Edit→Review→Publish. `aiVideoTasks` already carries every
 * field this pipeline needs (script/storyboard/asset status, model,
 * cost, publish data) in one flat record — each tab is a real,
 * focused column view over the same underlying tasks, not fabricated
 * per-stage data.
 */
export function AiVideoWorkbench() {
  const [tab, setTab] = useState("idea");
  const { aiVideoTasks } = getStudioState();

  return (
    <Card
      title="AI 视频"
      action={<DemoBadge />}
    >
      <div className="st-tabs" style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`st-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <Table columns={COLUMNS_BY_TAB[tab]} rows={aiVideoTasks} />
    </Card>
  );
}
