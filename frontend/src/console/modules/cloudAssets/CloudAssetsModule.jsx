import { useState } from "react";
import { PageHeader, StatGrid, StatCard, DataTable, StatusPill, FilterBar, DemoBadge } from "../../kit/index.js";

const ASSETS = [
  { id: "a1", name: "founder-console-v4.3.0.tar.gz", type: "构建产物", sizeMb: 184, storage: "NAS · /volumes/releases", status: "verified" },
  { id: "a2", name: "capability-pack-customer-service-v4.zip", type: "能力包", sizeMb: 42, storage: "NAS · /volumes/marketplace", status: "verified" },
  { id: "a3", name: "model-weights-glm4-studio.bin", type: "模型权重", sizeMb: 8420, storage: "NAS · /volumes/models", status: "verified" },
  { id: "a4", name: "backup-2026-07-29.sqlite.gz", type: "备份", sizeMb: 612, storage: "NAS · /volumes/backups", status: "verified" },
  { id: "a5", name: "capability-pack-ad-strategy-v3.1-canary.zip", type: "能力包", sizeMb: 38, storage: "NAS · /volumes/marketplace", status: "scanning" },
];

const TYPES = ["全部类型", "构建产物", "能力包", "模型权重", "备份"];
const STATUS_TONE = { verified: "success", scanning: "warning", quarantined: "danger" };
const STATUS_LABEL = { verified: "已校验", scanning: "扫描中", quarantined: "已隔离" };

/**
 * Cloud Center · Assets (Charter §3.5) — the raw package/binary/model
 * storage registry backing Cloud (NAS today, cloud storage later);
 * distinct from Marketplace (commercial listing of capability
 * packages) and Studio's Asset Library (produced content assets).
 */
export function CloudAssetsModule() {
  const [typeFilter, setTypeFilter] = useState("全部类型");
  const rows = typeFilter === "全部类型" ? ASSETS : ASSETS.filter((a) => a.type === typeFilter);
  const totalMb = ASSETS.reduce((sum, a) => sum + a.sizeMb, 0);

  return (
    <div>
      <PageHeader title="Assets" subtitle="NAS 存储的构建产物、能力包、模型权重与备份" actions={<DemoBadge />} />
      <StatGrid>
        <StatCard label="资产总数" value={ASSETS.length} />
        <StatCard label="占用存储" value={`${(totalMb / 1024).toFixed(1)} GB`} />
        <StatCard label="扫描中" value={ASSETS.filter((a) => a.status === "scanning").length} />
        <StatCard label="已隔离" value={ASSETS.filter((a) => a.status === "quarantined").length} />
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <FilterBar>
          <select className="fdr-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FilterBar>
        <DataTable
          columns={[
            { key: "name", label: "文件名" },
            { key: "type", label: "类型" },
            { key: "sizeMb", label: "大小", render: (r) => (r.sizeMb >= 1024 ? `${(r.sizeMb / 1024).toFixed(1)} GB` : `${r.sizeMb} MB`) },
            { key: "storage", label: "存储位置" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
          ]}
          rows={rows}
        />
      </div>
    </div>
  );
}
