import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";

const BRAND_ASSETS = [
  { id: "b1", name: "主 Logo（浅色底）", type: "Logo", status: "approved", updatedAt: "2026-06-10" },
  { id: "b2", name: "主 Logo（深色底）", type: "Logo", status: "approved", updatedAt: "2026-06-10" },
  { id: "b3", name: "品牌色板 v2", type: "色板", status: "approved", updatedAt: "2026-07-02" },
  { id: "b4", name: "夏季大促主视觉", type: "campaign", status: "review", updatedAt: "2026-07-28" },
];

const STATUS_LABEL = { approved: "已核准", review: "审核中" };
const STATUS_TONE = { approved: "success", review: "warning" };

/**
 * Operator Lab · Brand (Charter §3.3, net new) — Operator's own store
 * branding/VI presentation. Cross-links into Studio Lab's Brand Assets
 * (the production/versioning source) rather than duplicating asset
 * management — this page is the business-facing "how does my store
 * look" view, not a second DAM.
 */
export function BrandPage({ rootNavigate }) {
  return (
    <div>
      <PageHeader title="Brand" subtitle="店铺品牌视觉呈现" actions={<DemoBadge />} />
      <StatGrid>
        <StatCard label="已核准资产" value={BRAND_ASSETS.filter((b) => b.status === "approved").length} />
        <StatCard label="审核中" value={BRAND_ASSETS.filter((b) => b.status === "review").length} />
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>品牌资产</h3>
          <Button variant="secondary" size="sm" onClick={() => rootNavigate("studioLab", { subView: "brandGuidelines" })}>前往 Studio Lab · Brand Assets 管理 →</Button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 12px" }}>
          品牌资产的生产与版本管理在 Studio Lab，这里是该店铺当前采用版本的只读呈现。
        </p>
        <DataTable
          columns={[
            { key: "name", label: "资产" },
            { key: "type", label: "类型" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
            { key: "updatedAt", label: "更新时间" },
          ]}
          rows={BRAND_ASSETS}
        />
      </div>
    </div>
  );
}
