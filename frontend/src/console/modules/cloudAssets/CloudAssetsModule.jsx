import { useState } from "react";
import { PageHeader, StatGrid, StatCard, DataTable, StatusPill, FilterBar, DemoBadge } from "../../kit/index.js";
import { getFeaturedDevice, getFeaturedOperatorFleetEntry } from "../../../demoData/cloudDemoData.js";

// 分类对齐产品需求原文的五类资产：安装包/配置包/模型资源/模板资源/内容资源。
const ASSETS = [
  { id: "a1", name: "founder-console-v4.3.0.tar.gz", category: "安装包", version: "v4.3.0", dependency: "无", sizeMb: 184, storage: "NAS · /volumes/releases", verifyStatus: "verified", releaseStatus: "released" },
  { id: "a2", name: "mac-mini-op-0001.config.yaml", category: "配置包", version: "v3", dependency: "依赖 安装包 v4.3.0", sizeMb: 1, storage: "NAS · /volumes/configs", verifyStatus: "verified", releaseStatus: "released", deviceId: "mac-mini-op-0001" },
  { id: "a3", name: "model-weights-glm4-studio.bin", category: "模型资源", version: "v4", dependency: "无", sizeMb: 8420, storage: "NAS · /volumes/models", verifyStatus: "verified", releaseStatus: "released" },
  { id: "a4", name: "template-restock-brief.json", category: "模板资源", version: "v2.1", dependency: "依赖 模型资源 glm4-studio v4", sizeMb: 2, storage: "NAS · /volumes/templates", verifyStatus: "verified", releaseStatus: "gray" },
  { id: "a5", name: "content-pack-red-fruit-ep13-16.zip", category: "内容资源", version: "v1", dependency: "依赖 模板资源 v2.1", sizeMb: 340, storage: "NAS · /volumes/content", verifyStatus: "verified", releaseStatus: "released" },
  { id: "a6", name: "capability-pack-ad-strategy-v3.1-canary.zip", category: "安装包", version: "v3.1-canary", dependency: "依赖 安装包 v4.3.0", sizeMb: 38, storage: "NAS · /volumes/marketplace", verifyStatus: "scanning", releaseStatus: "unreleased" },
  { id: "a7", name: "backup-2026-07-29.sqlite.gz", category: "配置包", version: "—", dependency: "无", sizeMb: 612, storage: "NAS · /volumes/backups", verifyStatus: "verified", releaseStatus: "released" },
];

const CATEGORIES = ["全部类型", "安装包", "配置包", "模型资源", "模板资源", "内容资源"];
const VERIFY_TONE = { verified: "success", scanning: "warning", quarantined: "danger" };
const VERIFY_LABEL = { verified: "已校验", scanning: "扫描中", quarantined: "已隔离" };
const RELEASE_TONE = { released: "success", gray: "warning", unreleased: "neutral" };
const RELEASE_LABEL = { released: "已发布", gray: "灰度发布", unreleased: "未发布" };

/**
 * Cloud Center · Assets (Charter §3.5) — the raw package/binary/model
 * storage registry backing Cloud (NAS today, cloud storage later);
 * distinct from Marketplace (commercial listing of capability
 * packages) and Studio's Asset Library (produced content assets).
 *
 * 关联设备：配置包 a2 直接绑定锚点设备 mac-mini-op-0001，与设备管理/
 * OTA更新/许可证/Token中心/系统监控/日志中心共用同一台设备，供产品
 * 负责人交叉核对。
 */
export function CloudAssetsModule() {
  const [typeFilter, setTypeFilter] = useState("全部类型");
  const rows = typeFilter === "全部类型" ? ASSETS : ASSETS.filter((a) => a.category === typeFilter);
  const totalMb = ASSETS.reduce((sum, a) => sum + a.sizeMb, 0);
  const device = getFeaturedDevice();
  const operatorEntry = getFeaturedOperatorFleetEntry();
  const anchoredAsset = ASSETS.find((a) => a.deviceId === device?.id);

  return (
    <div>
      <PageHeader title="资产管理" subtitle="NAS 存储的安装包、配置包、模型资源、模板资源与内容资源" actions={<DemoBadge />} />
      <StatGrid>
        <StatCard label="资产总数" value={ASSETS.length} />
        <StatCard label="占用存储" value={`${(totalMb / 1024).toFixed(1)} GB`} />
        <StatCard label="扫描中" value={ASSETS.filter((a) => a.verifyStatus === "scanning").length} />
        <StatCard label="已隔离" value={ASSETS.filter((a) => a.verifyStatus === "quarantined").length} />
      </StatGrid>

      {device && anchoredAsset ? (
        <div className="fdr-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="fdr-card__title" style={{ margin: 0 }}>关联设备（跨页面锚点）</h3>
            <DemoBadge />
          </div>
          <p style={{ fontSize: 13, margin: "8px 0 0 0" }}>
            配置包 <strong>{anchoredAsset.name}</strong> 绑定设备 <strong>{device.id}</strong> · 归属 Operator <strong>{operatorEntry?.name}</strong> · 设备当前系统版本 {device.systemVersion}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            与设备管理 / OTA 更新 / 许可证 / Token 中心 / 系统监控 / 日志中心中出现的是同一台设备，可交叉核对。
          </p>
        </div>
      ) : null}

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <FilterBar>
          <select className="fdr-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {CATEGORIES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FilterBar>
        <DataTable
          columns={[
            { key: "name", label: "文件名" },
            { key: "category", label: "类型" },
            { key: "version", label: "版本" },
            { key: "dependency", label: "依赖关系" },
            { key: "sizeMb", label: "大小", render: (r) => (r.sizeMb >= 1024 ? `${(r.sizeMb / 1024).toFixed(1)} GB` : `${r.sizeMb} MB`) },
            { key: "storage", label: "存储位置" },
            { key: "verifyStatus", label: "校验状态", render: (r) => <StatusPill tone={VERIFY_TONE[r.verifyStatus]}>{VERIFY_LABEL[r.verifyStatus]}</StatusPill> },
            { key: "releaseStatus", label: "发布状态", render: (r) => <StatusPill tone={RELEASE_TONE[r.releaseStatus]}>{RELEASE_LABEL[r.releaseStatus]}</StatusPill> },
          ]}
          rows={rows}
        />
      </div>
    </div>
  );
}
