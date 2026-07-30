import { useState } from "react";
import { PageHeader, StatGrid, StatCard, DataTable, StatusPill, Button, DemoBadge } from "../../kit/index.js";
import { useToast } from "../../kit/useToast.js";

const CHANNELS = [
  { id: "stable", label: "Stable", version: "v4.3.0", rolloutPct: 100, status: "released" },
  { id: "beta", label: "Beta", version: "v4.4.0-beta.2", rolloutPct: 35, status: "rolling" },
  { id: "canary", label: "Canary", version: "v4.5.0-canary.1", rolloutPct: 5, status: "rolling" },
];

const RELEASE_NOTES = [
  { id: "r1", version: "v4.3.0", channel: "Stable", date: "2026-07-24", summary: "Founder Master Edition 架构重置：五大一级分组、AI Capability Center 生命周期化" },
  { id: "r2", version: "v4.2.2", channel: "Stable", date: "2026-07-10", summary: "修复 Marketplace 分成结算的四舍五入误差" },
  { id: "r3", version: "v4.4.0-beta.2", channel: "Beta", date: "2026-07-28", summary: "Studio AI 短剧工作台重构为单页流水线" },
];

const STATUS_TONE = { released: "success", rolling: "warning", paused: "danger" };
const STATUS_LABEL = { released: "已发布", rolling: "灰度中", paused: "已暂停" };

/**
 * Cloud Center · Version (Charter §3.5) — platform/OS release-channel
 * management for the Founder Master Edition build itself, distinct
 * from Studio's own AI-pipeline versioning (absorbed into Capability
 * Center's "Studio 版本与发布" tab) and from Marketplace's per-package
 * versions (its own "版本与灰度" sub-tab).
 */
export function CloudVersionModule() {
  const [channels, setChannels] = useState(CHANNELS);
  const showToast = useToast();

  function advanceRollout(id) {
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, rolloutPct: Math.min(100, c.rolloutPct + 20) } : c)));
    showToast("已扩大灰度范围（演示）", "success");
  }

  return (
    <div>
      <PageHeader title="Version" subtitle="Founder Master Edition 平台/系统发布通道" actions={<DemoBadge />} />
      <StatGrid>
        <StatCard label="当前 Stable 版本" value={CHANNELS[0].version} />
        <StatCard label="灰度中通道" value={channels.filter((c) => c.status === "rolling").length} />
        <StatCard label="本月发布次数" value={RELEASE_NOTES.length} />
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>发布通道</h3>
        <DataTable
          columns={[
            { key: "label", label: "通道" },
            { key: "version", label: "版本号" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
            { key: "rolloutPct", label: "灰度进度", render: (r) => `${r.rolloutPct}%` },
            {
              key: "actions", label: "操作", render: (r) => (
                r.status === "rolling" ? <Button size="sm" variant="secondary" onClick={() => advanceRollout(r.id)}>扩大灰度</Button> : null
              ),
            },
          ]}
          rows={channels}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>发布日志</h3>
        <DataTable
          columns={[
            { key: "version", label: "版本" },
            { key: "channel", label: "通道" },
            { key: "date", label: "日期" },
            { key: "summary", label: "说明" },
          ]}
          rows={RELEASE_NOTES}
        />
      </div>
    </div>
  );
}
