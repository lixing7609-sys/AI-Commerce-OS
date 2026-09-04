import { useState } from "react";
import { PageHeader, StatGrid, StatCard, DataTable, StatusPill, Button, DemoBadge } from "../../kit/index.js";
import { useToast } from "../../kit/useToast.js";
import { getFeaturedDevice, getFeaturedOperatorFleetEntry } from "../../../demoData/cloudDemoData.js";

// 四端各自的当前版本——Founder Master Edition 是一体多端交付，但四个
// 产品面（Founder/Operator/Studio/Cloud）各自独立打版本号，产品负责人
// 需要在一个地方看到"现在到底哪个端在跑哪个版本"。
const COMPONENT_VERSIONS = [
  { id: "founder", product: "Founder", version: "v4.3.0", channel: "stable", updatedAt: "2026-07-24" },
  { id: "operator", product: "Operator", version: "v4.3.0", channel: "stable", updatedAt: "2026-07-24" },
  { id: "studio", product: "Studio", version: "v4.4.0-beta.2", channel: "beta", updatedAt: "2026-07-28" },
  { id: "cloud", product: "Cloud", version: "v4.3.1", channel: "stable", updatedAt: "2026-07-25" },
];

const INITIAL_CHANNELS = [
  { id: "stable", label: "正式版本", version: "v4.3.0", rolloutPct: 100, status: "released", dependency: "无（基线版本）" },
  { id: "beta", label: "灰度版本", version: "v4.4.0-beta.2", rolloutPct: 35, status: "rolling", dependency: "依赖 Studio v4.4.0-beta 短剧流水线重构" },
  { id: "canary", label: "测试版本", version: "v4.5.0-canary.1", rolloutPct: 5, status: "rolling", dependency: "依赖 Agent Evolution 基础能力（实验特性开关）" },
];

const RELEASE_NOTES = [
  { id: "r1", version: "v4.3.0", channel: "正式版本", date: "2026-07-24", summary: "Founder Master Edition 架构重置：五大一级分组、AI Capability Center 生命周期化" },
  { id: "r2", version: "v4.2.2", channel: "正式版本", date: "2026-07-10", summary: "修复 Marketplace 分成结算的四舍五入误差" },
  { id: "r3", version: "v4.4.0-beta.2", channel: "灰度版本", date: "2026-07-28", summary: "Studio AI 短剧工作台重构为单页流水线" },
];

const STATUS_TONE = { released: "success", rolling: "warning", paused: "danger" };
const STATUS_LABEL = { released: "已发布", rolling: "灰度中", paused: "已暂停" };
const CHANNEL_LABEL = { stable: "正式版本", beta: "灰度版本", canary: "测试版本" };

/**
 * Cloud Center · Version (Charter §3.5) — platform/OS release-channel
 * management for the Founder Master Edition build itself, distinct
 * from Studio's own AI-pipeline versioning (absorbed into Capability
 * Center's "Studio 版本与发布" tab) and from Marketplace's per-package
 * versions (its own "版本与灰度" sub-tab).
 *
 * 关联设备卡片取自 demoData/cloudDemoData.js 的锚点设备，让"这台设备
 * 当前跑的是哪个版本"在设备管理/版本管理两处能对上号。
 */
export function CloudVersionModule() {
  const [channels, setChannels] = useState(INITIAL_CHANNELS);
  const showToast = useToast();
  const device = getFeaturedDevice();
  const operatorEntry = getFeaturedOperatorFleetEntry();

  function advanceRollout(id) {
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, rolloutPct: Math.min(100, c.rolloutPct + 20) } : c)));
    showToast("已扩大灰度范围（演示）", "success");
  }

  function releaseChannel(id) {
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, status: "released", rolloutPct: 100 } : c)));
    showToast("已发布至全部目标设备（演示）", "success");
  }

  function rollbackChannel(id) {
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, status: "rolling", rolloutPct: Math.max(0, Math.round(c.rolloutPct / 2)) } : c)));
    showToast("已回滚该通道到上一版本（演示，不影响其他通道）", "warning");
  }

  return (
    <div>
      <PageHeader title="版本管理" subtitle="Founder Master Edition 平台/系统发布通道——Founder/Operator/Studio/Cloud 四端版本一览" actions={<DemoBadge />} />
      <StatGrid>
        <StatCard label="当前正式版本" value={INITIAL_CHANNELS[0].version} />
        <StatCard label="灰度中通道" value={channels.filter((c) => c.status === "rolling").length} />
        <StatCard label="本月发布次数" value={RELEASE_NOTES.length} />
      </StatGrid>

      {device ? (
        <div className="fdr-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="fdr-card__title" style={{ margin: 0 }}>关联设备（跨页面锚点）</h3>
            <DemoBadge />
          </div>
          <p style={{ fontSize: 13, margin: "8px 0 0 0" }}>
            设备 <strong>{device.id}</strong> · 归属 Operator <strong>{operatorEntry?.name}</strong> · 当前设备版本 <strong>{device.systemVersion}</strong>
          </p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            与设备管理 / OTA 更新 / 许可证 / Token 中心 / 系统监控 / 日志中心中出现的是同一台设备，可交叉核对版本号是否一致。
          </p>
        </div>
      ) : null}

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>四端版本</h3>
        <DataTable
          columns={[
            { key: "product", label: "产品端" },
            { key: "version", label: "当前版本" },
            { key: "channel", label: "所在通道", render: (r) => CHANNEL_LABEL[r.channel] ?? r.channel },
            { key: "updatedAt", label: "更新日期" },
          ]}
          rows={COMPONENT_VERSIONS}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>发布通道</h3>
        <DataTable
          columns={[
            { key: "label", label: "通道" },
            { key: "version", label: "版本号" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
            { key: "rolloutPct", label: "灰度比例", render: (r) => `${r.rolloutPct}%` },
            { key: "dependency", label: "依赖" },
            {
              key: "actions", label: "操作", render: (r) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {r.status === "rolling" ? <Button size="sm" variant="secondary" onClick={() => advanceRollout(r.id)}>扩大灰度</Button> : null}
                  {r.status === "rolling" ? <Button size="sm" variant="primary" onClick={() => releaseChannel(r.id)}>发布</Button> : null}
                  {r.status === "released" ? <Button size="sm" variant="danger" onClick={() => rollbackChannel(r.id)}>回滚</Button> : null}
                </div>
              ),
            },
          ]}
          rows={channels}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>发布日志（版本说明）</h3>
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
