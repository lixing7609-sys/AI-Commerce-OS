import { useState } from "react";
import { Card, DemoBadge, Pill, Table } from "./uiHelpers.jsx";
import { VoiceSubtitleBgmPage } from "./CreationWorkbenchPages.jsx";

const TABS = [
  { key: "voice", label: "配音 / 字幕 / BGM" },
  { key: "podcast", label: "播客生产" },
  { key: "voiceArticle", label: "长文转音频" },
];

const PODCASTS = [
  { id: "p1", title: "《一人公司经营笔记》EP12", stage: "剪辑中", durationMin: 18, status: "in_progress" },
  { id: "p2", title: "《一人公司经营笔记》EP11", stage: "已发布", durationMin: 21, status: "published" },
];

const VOICE_ARTICLES = [
  { id: "va1", title: "夏季新品加湿器选购指南（音频版）", sourceArticle: "AI Article · art-1", durationMin: 6, status: "ready" },
  { id: "va2", title: "抖音小店新手起号避坑指南（音频版）", sourceArticle: "AI Article · art-2", durationMin: 9, status: "generating" },
];

const STATUS_LABEL = { in_progress: "生产中", published: "已发布", ready: "已生成", generating: "生成中" };
const STATUS_TONE = { in_progress: "warning", published: "success", ready: "success", generating: "warning" };

/**
 * Studio Lab · AI Audio (Charter §3.4) — the former shared "配音/字幕/
 * BGM" sub-step is promoted to also be a top-level content type: its
 * own workbench for standalone audio production (podcasts, long-form
 * articles converted to audio), not just a service other pipelines
 * call into.
 */
export function AiAudioWorkbench() {
  const [tab, setTab] = useState("voice");

  return (
    <Card title="AI 音频" action={<DemoBadge />}>
      <div className="st-tabs" style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`st-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === "voice" ? <VoiceSubtitleBgmPage /> : null}
      {tab === "podcast" ? (
        <Table
          columns={[
            { key: "title", label: "播客" }, { key: "stage", label: "阶段" }, { key: "durationMin", label: "时长(分钟)" },
            { key: "status", label: "状态", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill> },
          ]}
          rows={PODCASTS}
        />
      ) : null}
      {tab === "voiceArticle" ? (
        <Table
          columns={[
            { key: "title", label: "音频" }, { key: "sourceArticle", label: "来源文章" }, { key: "durationMin", label: "时长(分钟)" },
            { key: "status", label: "状态", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill> },
          ]}
          rows={VOICE_ARTICLES}
        />
      ) : null}
    </Card>
  );
}
