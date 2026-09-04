import { useState } from "react";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";
import { Modal } from "../../../kit/Modal.jsx";
import { EmptyState } from "../../../kit/EmptyState.jsx";
import { useToast } from "../../../kit/useToast.js";

const CHANNEL_OPTIONS = ["店铺内", "抖音电商", "淘宝/天猫", "小红书"];
const AUDIENCE_OPTIONS = ["全部客户", "新客", "沉睡老客", "高意向未下单", "金卡会员"];

const INITIAL_CAMPAIGNS = [
  { id: "c1", name: "夏季大促满减", channel: "店铺内", audience: "全部客户", status: "active", startAt: "2026-07-25", budget: 8000, gmv: 18600 },
  { id: "c2", name: "新客首单立减", channel: "抖音电商", audience: "新客", status: "active", startAt: "2026-07-01", budget: 4000, gmv: 9200 },
  { id: "c3", name: "会员日双倍积分", channel: "店铺内", audience: "金卡会员", status: "scheduled", startAt: "2026-08-01", budget: 2000, gmv: 0 },
  { id: "c4", name: "清仓折扣", channel: "淘宝/天猫", audience: "沉睡老客", status: "ended", startAt: "2026-06-15", budget: 6000, gmv: 14300 },
];

const PROMOTIONS = [
  { id: "p1", name: "满199减30", type: "满减", scope: "全店商品", status: "active" },
  { id: "p2", name: "新客立减15元", type: "立减", scope: "首单新客", status: "active" },
  { id: "p3", name: "第二件半价", type: "折扣", scope: "夏季轻薄防晒衣", status: "scheduled" },
];

const CONTENT_DISTRIBUTION = [
  { id: "d1", title: "《都市重生》EP01-03", platform: "抖音 / 小红书", status: "published", note: "完播 41%，评论 1,204" },
  { id: "d2", title: "夏季新品图文合集", platform: "小红书", status: "published", note: "点击率 6.8%" },
  { id: "d3", title: "《都市重生》EP04", platform: "抖音 / 小红书", status: "queued", note: "等待 Founder 终审（见 Founder Workspace · Decisions）" },
];

const STATUS_LABEL = { active: "进行中", scheduled: "待开始", ended: "已结束", published: "已发布", queued: "生产队列中", pending: "待受理", accepted: "已受理" };
const STATUS_TONE = { active: "success", scheduled: "info", ended: "neutral", published: "success", queued: "warning", pending: "warning", accepted: "info" };
const PROMO_STATUS_LABEL = { active: "生效中", scheduled: "待生效", ended: "已结束" };

function emptyCampaignDraft() {
  return { name: "", channel: CHANNEL_OPTIONS[0], audience: AUDIENCE_OPTIONS[0], budget: "", startAt: "" };
}

function emptyContentRequestDraft() {
  return { title: "", type: "图文", dueDate: "" };
}

function CreateCampaignModal({ open, onClose, onSubmit }) {
  const [draft, setDraft] = useState(emptyCampaignDraft());
  return (
    <Modal
      open={open}
      title="创建活动"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={!draft.name.trim() || !draft.budget}
            onClick={() => {
              onSubmit(draft);
              setDraft(emptyCampaignDraft());
            }}
          >
            创建
          </Button>
        </>
      }
    >
      <div className="fdr-field">
        <label className="fdr-field__label">活动名称</label>
        <input className="fdr-input" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="例如：秋季新品预热" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="fdr-field">
          <label className="fdr-field__label">渠道</label>
          <select className="fdr-select" value={draft.channel} onChange={(e) => setDraft((p) => ({ ...p, channel: e.target.value }))}>
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">目标人群</label>
          <select className="fdr-select" value={draft.audience} onChange={(e) => setDraft((p) => ({ ...p, audience: e.target.value }))}>
            {AUDIENCE_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="fdr-field">
          <label className="fdr-field__label">预算（元）</label>
          <input className="fdr-input" type="number" min="0" value={draft.budget} onChange={(e) => setDraft((p) => ({ ...p, budget: e.target.value }))} />
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">开始日期</label>
          <input className="fdr-input" type="date" value={draft.startAt} onChange={(e) => setDraft((p) => ({ ...p, startAt: e.target.value }))} />
        </div>
      </div>
    </Modal>
  );
}

function ContentRequestModal({ open, onClose, onSubmit }) {
  const [draft, setDraft] = useState(emptyContentRequestDraft());
  return (
    <Modal
      open={open}
      title="提交内容需求"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={!draft.title.trim()}
            onClick={() => {
              onSubmit(draft);
              setDraft(emptyContentRequestDraft());
            }}
          >
            提交
          </Button>
        </>
      }
    >
      <div className="fdr-field">
        <label className="fdr-field__label">需求标题</label>
        <input className="fdr-input" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} placeholder="例如：秋季新品主视觉图文" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="fdr-field">
          <label className="fdr-field__label">内容类型</label>
          <select className="fdr-select" value={draft.type} onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))}>
            <option value="图文">图文</option>
            <option value="短视频">短视频</option>
            <option value="直播脚本">直播脚本</option>
          </select>
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">期望完成日期</label>
          <input className="fdr-input" type="date" value={draft.dueDate} onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
        提交后需求会进入待受理列表，实际内容生产在 Studio 实验室完成。
      </p>
    </Modal>
  );
}

/**
 * Operator Lab · Marketing (Charter §3.3) — campaign/promo tracking
 * that Operator itself owns, plus a read-only view of content
 * distribution status (the content itself is produced in Studio Lab,
 * not duplicated here — replaces the old bare "内容" redirect notice
 * with a real cross-linked workbench).
 */
export function MarketingPage({ rootNavigate }) {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState(INITIAL_CAMPAIGNS);
  const [contentRequests, setContentRequests] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const activeGmv = campaigns.filter((c) => c.status !== "scheduled").reduce((s, c) => s + c.gmv, 0);
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const upcoming = [...campaigns].sort((a, b) => a.startAt.localeCompare(b.startAt));

  function handleCreateCampaign(draft) {
    setCampaigns((prev) => [
      { id: `c${prev.length + 1 + Date.now()}`, name: draft.name.trim(), channel: draft.channel, audience: draft.audience, status: "scheduled", startAt: draft.startAt || "待定", budget: Number(draft.budget) || 0, gmv: 0 },
      ...prev,
    ]);
    setCreateOpen(false);
    toast("活动已创建（本地演示，尚未真实投放）", "success");
  }

  function handleSubmitContentRequest(draft) {
    setContentRequests((prev) => [
      { id: `req${prev.length + 1 + Date.now()}`, title: draft.title.trim(), type: draft.type, dueDate: draft.dueDate || "未指定", status: "pending" },
      ...prev,
    ]);
    setRequestOpen(false);
    toast("内容需求已提交，等待 Studio 实验室受理", "success");
  }

  return (
    <div>
      <PageHeader
        title="营销中心"
        subtitle="店铺营销活动、优惠方案与内容分发状态"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DemoBadge />
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>+ 创建活动</Button>
          </div>
        }
      />
      <StatGrid>
        <StatCard label="进行中活动" value={campaigns.filter((c) => c.status === "active").length} />
        <StatCard label="待开始活动" value={campaigns.filter((c) => c.status === "scheduled").length} />
        <StatCard label="活动总预算" value={`¥${totalBudget.toLocaleString()}`} />
        <StatCard label="活动归因效果（GMV）" value={`¥${activeGmv.toLocaleString()}`} />
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>营销活动</h3>
        <DataTable
          columns={[
            { key: "name", label: "活动名称" },
            { key: "channel", label: "渠道" },
            { key: "audience", label: "目标人群" },
            { key: "budget", label: "预算", render: (r) => `¥${r.budget.toLocaleString()}` },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
            { key: "startAt", label: "开始日期" },
            { key: "gmv", label: "效果（归因 GMV）", render: (r) => `¥${r.gmv.toLocaleString()}` },
          ]}
          rows={campaigns}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>优惠方案</h3>
        <DataTable
          columns={[
            { key: "name", label: "方案名称" },
            { key: "type", label: "类型" },
            { key: "scope", label: "适用范围" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{PROMO_STATUS_LABEL[r.status] ?? r.status}</StatusPill> },
          ]}
          rows={PROMOTIONS}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>活动日历</h3>
        {upcoming.length === 0 ? (
          <EmptyState icon="▥" message="暂无排期中的活动" />
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {upcoming.map((c) => (
              <li key={c.id} style={{ padding: "4px 0" }}>
                <strong>{c.startAt}</strong> · {c.name} · {c.channel} · <StatusPill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>内容需求</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => setRequestOpen(true)}>+ 提交内容需求</Button>
            <Button variant="secondary" size="sm" onClick={() => rootNavigate("studioLab", { subView: "contentProjects" })}>提交内容需求到 Studio →</Button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 12px" }}>
          内容生产的权威实现在 Studio 实验室，这里提交的需求会作为待受理事项传递过去。
        </p>
        {contentRequests.length === 0 ? (
          <EmptyState icon="▤" message="暂无已提交的内容需求" />
        ) : (
          <DataTable
            columns={[
              { key: "title", label: "需求标题" },
              { key: "type", label: "类型" },
              { key: "dueDate", label: "期望完成日期" },
              { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
            ]}
            rows={contentRequests}
          />
        )}
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>内容分发状态</h3>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 12px" }}>
          内容生产的权威实现在 Studio 实验室，Operator 实验室只读展示分发到本店铺渠道的状态。
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

      <CreateCampaignModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreateCampaign} />
      <ContentRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} onSubmit={handleSubmitContentRequest} />
    </div>
  );
}
