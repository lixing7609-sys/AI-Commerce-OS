import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";
import { EmptyState } from "../../../kit/EmptyState.jsx";

const BRAND_ASSETS = [
  { id: "b1", name: "主 Logo（浅色底）", type: "Logo", status: "approved", updatedAt: "2026-06-10" },
  { id: "b2", name: "主 Logo（深色底）", type: "Logo", status: "approved", updatedAt: "2026-06-10" },
  { id: "b3", name: "品牌色板 v2", type: "色板", status: "approved", updatedAt: "2026-07-02" },
  { id: "b4", name: "夏季大促主视觉", type: "活动物料", status: "review", updatedAt: "2026-07-28" },
];

const PRODUCT_LINES = [
  { id: "l1", name: "夏季服饰", skuCount: 12, consistency: 0.94 },
  { id: "l2", name: "居家日用", skuCount: 8, consistency: 0.81 },
  { id: "l3", name: "美妆个护", skuCount: 5, consistency: 0.76 },
];

const CONTENT_USAGE = [
  { id: "u1", channel: "抖音电商详情页", usageRate: 0.92, note: "主图/详情页 Logo 与色板使用规范" },
  { id: "u2", channel: "小红书笔记", usageRate: 0.68, note: "部分笔记未使用官方色板，建议提醒内容团队" },
  { id: "u3", channel: "淘宝/天猫店铺首页", usageRate: 0.88, note: "首页视觉基本符合品牌规范" },
];

const LICENSES = [
  { id: "lic1", asset: "红果短剧《都市重生》IP联名素材", licensee: "本店铺", scope: "站内详情页/短视频", expiresAt: "2026-12-31", status: "active" },
  { id: "lic2", asset: "夏季大促主视觉", licensee: "本店铺", scope: "全渠道", expiresAt: "2026-09-30", status: "active" },
];

const BRAND_ISSUES = [
  { id: "i1", title: "小红书笔记中出现非官方色板", severity: "medium", detail: "3 篇近期笔记的背景色与品牌色板 v2 不一致", suggestion: "建议提醒内容团队统一使用最新色板" },
  { id: "i2", title: "夏季大促主视觉尚未核准", severity: "low", detail: "该素材仍在审核中，暂不应对外发布", suggestion: "请前往 Studio 实验室完成审核" },
];

const STATUS_LABEL = { approved: "已核准", review: "审核中", active: "生效中" };
const STATUS_TONE = { approved: "success", review: "warning", active: "success" };
const SEVERITY_LABEL = { high: "高", medium: "中", low: "低" };
const SEVERITY_TONE = { high: "danger", medium: "warning", low: "neutral" };

/**
 * Operator Lab · Brand (Charter §3.3, net new) — Operator's own store
 * branding/VI presentation. Cross-links into Studio Lab's Brand Assets
 * (the production/versioning source) rather than duplicating asset
 * management — this page is the business-facing "how does my store
 * look" view, not a second DAM.
 */
export function BrandPage({ rootNavigate }) {
  const avgConsistency = PRODUCT_LINES.reduce((s, l) => s + l.consistency, 0) / PRODUCT_LINES.length;

  return (
    <div>
      <PageHeader
        title="品牌中心"
        subtitle="店铺品牌视觉呈现、一致性与授权状态"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DemoBadge />
            {rootNavigate ? (
              <Button variant="secondary" size="sm" onClick={() => rootNavigate("studioLab", { subView: "brandAssets" })}>进入 Studio 品牌资产 →</Button>
            ) : null}
          </div>
        }
      />

      <StatGrid>
        <StatCard label="已核准资产" value={BRAND_ASSETS.filter((b) => b.status === "approved").length} />
        <StatCard label="审核中" value={BRAND_ASSETS.filter((b) => b.status === "review").length} />
        <StatCard label="品牌一致性" value={`${(avgConsistency * 100).toFixed(0)}%`} />
        <StatCard label="待处理品牌问题" value={BRAND_ISSUES.length} />
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>品牌定位</h3>
        <p style={{ fontSize: 13, margin: 0, color: "var(--text-secondary)" }}>
          "轻量、悦己、可负担"的日常生活方式品牌——聚焦 18-35 岁女性用户，主打夏季高频复购单品，视觉基调为浅色系 + 明快撞色。
        </p>
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>商品线</h3>
        <DataTable
          columns={[
            { key: "name", label: "商品线" },
            { key: "skuCount", label: "SKU 数" },
            { key: "consistency", label: "品牌一致性", render: (r) => <StatusPill tone={r.consistency >= 0.9 ? "success" : r.consistency >= 0.8 ? "warning" : "danger"}>{(r.consistency * 100).toFixed(0)}%</StatusPill> },
          ]}
          rows={PRODUCT_LINES}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>品牌资产</h3>
          {rootNavigate ? (
            <Button variant="secondary" size="sm" onClick={() => rootNavigate("studioLab", { subView: "brandAssets" })}>前往 Studio 实验室 · 品牌资产管理 →</Button>
          ) : null}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 12px" }}>
          品牌资产的生产与版本管理在 Studio 实验室，这里是该店铺当前采用版本的只读呈现。
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

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>内容使用情况</h3>
        <DataTable
          columns={[
            { key: "channel", label: "渠道" },
            { key: "usageRate", label: "规范使用率", render: (r) => <StatusPill tone={r.usageRate >= 0.85 ? "success" : "warning"}>{(r.usageRate * 100).toFixed(0)}%</StatusPill> },
            { key: "note", label: "说明" },
          ]}
          rows={CONTENT_USAGE}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>品牌授权</h3>
        <DataTable
          columns={[
            { key: "asset", label: "授权内容" },
            { key: "licensee", label: "被授权方" },
            { key: "scope", label: "使用范围" },
            { key: "expiresAt", label: "到期日期" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
          ]}
          rows={LICENSES}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>品牌问题</h3>
        {BRAND_ISSUES.length === 0 ? (
          <EmptyState icon="◆" message="暂无品牌一致性问题" />
        ) : (
          BRAND_ISSUES.map((issue) => (
            <div key={issue.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{issue.title}</strong>
                <StatusPill tone={SEVERITY_TONE[issue.severity]}>{SEVERITY_LABEL[issue.severity]}风险</StatusPill>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0" }}>{issue.detail}</p>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>建议：{issue.suggestion}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
