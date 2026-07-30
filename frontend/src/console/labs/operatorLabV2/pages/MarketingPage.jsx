import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";

const CAMPAIGNS = [
  { id: "c1", name: "夏季大促满减", channel: "店铺内", status: "active", startAt: "2026-07-25", gmv: 18600 },
  { id: "c2", name: "新客首单立减", channel: "店铺内", status: "active", startAt: "2026-07-01", gmv: 9200 },
  { id: "c3", name: "会员日双倍积分", channel: "店铺内", status: "scheduled", startAt: "2026-08-01", gmv: 0 },
  { id: "c4", name: "清仓折扣", channel: "店铺内", status: "ended", startAt: "2026-06-15", gmv: 14300 },
];

const CONTENT_DISTRIBUTION = [
  { id: "d1", title: "《都市重生》EP01-03", platform: "抖音 / 小红书", status: "published", note: "完播 41%，评论 1,204" },
  { id: "d2", title: "夏季新品图文合集", platform: "小红书", status: "published", note: "点击率 6.8%" },
  { id: "d3", title: "《都市重生》EP04", platform: "抖音 / 小红书", status: "queued", note: "等待 Founder 终审（见 Founder Workspace · Decisions）" },
];

const STATUS_LABEL = { active: "进行中", scheduled: "待开始", ended: "已结束", published: "已发布", queued: "生产队列中" };
const STATUS_TONE = { active: "success", scheduled: "info", ended: "neutral", published: "success", queued: "warning" };

/**
 * Operator Lab · Marketing (Charter §3.3) — campaign/promo tracking
 * that Operator itself owns, plus a read-only view of content
 * distribution status (the content itself is produced in Studio Lab,
 * not duplicated here — replaces the old bare "内容" redirect notice
 * with a real cross-linked workbench).
 */
export function MarketingPage({ rootNavigate }) {
  const activeGmv = CAMPAIGNS.filter((c) => c.status !== "scheduled").reduce((s, c) => s + c.gmv, 0);

  return (
    <div>
      <PageHeader title="Marketing" subtitle="店铺营销活动与内容分发状态" actions={<DemoBadge />} />
      <StatGrid>
        <StatCard label="进行中活动" value={CAMPAIGNS.filter((c) => c.status === "active").length} />
        <StatCard label="待开始活动" value={CAMPAIGNS.filter((c) => c.status === "scheduled").length} />
        <StatCard label="活动归因 GMV" value={`¥${activeGmv.toLocaleString()}`} />
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>营销活动</h3>
        <DataTable
          columns={[
            { key: "name", label: "活动名称" },
            { key: "channel", label: "渠道" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
            { key: "startAt", label: "开始日期" },
            { key: "gmv", label: "归因 GMV", render: (r) => `¥${r.gmv.toLocaleString()}` },
          ]}
          rows={CAMPAIGNS}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>内容分发状态</h3>
          <Button variant="secondary" size="sm" onClick={() => rootNavigate("studioLab", { subView: "contentProjects" })}>前往 Studio Lab 生产内容 →</Button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 12px" }}>
          内容生产的权威实现在 Studio Lab，Operator Lab 只读展示分发到本店铺渠道的状态。
        </p>
        <DataTable
          columns={[
            { key: "title", label: "内容" },
            { key: "platform", label: "分发渠道" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
            { key: "note", label: "说明" },
          ]}
          rows={CONTENT_DISTRIBUTION}
        />
      </div>
    </div>
  );
}
