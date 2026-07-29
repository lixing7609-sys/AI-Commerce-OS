import { useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { Button } from "../../kit/Button.jsx";
import { IconButton } from "../../kit/IconButton.jsx";
import { TextButton } from "../../kit/TextButton.jsx";
import { Icon } from "../../kit/Icon.jsx";
import { Input } from "../../kit/Input.jsx";
import { Select } from "../../kit/Select.jsx";
import { Checkbox } from "../../kit/Checkbox.jsx";
import { Switch } from "../../kit/Switch.jsx";
import { SegmentedControl } from "../../kit/SegmentedControl.jsx";
import { Badge } from "../../kit/Badge.jsx";
import { StatusBadge } from "../../kit/StatusPill.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { ErrorState } from "../../kit/ErrorState.jsx";
import { SkeletonGroup } from "../../kit/Skeleton.jsx";
import { Modal } from "../../kit/Modal.jsx";
import { Drawer } from "../../kit/Drawer.jsx";
import { Banner } from "../../kit/Banner.jsx";
import { Metric } from "../../kit/Metric.jsx";
import { KeyValueList } from "../../kit/KeyValueList.jsx";
import { AIRecommendation } from "../../kit/AIRecommendation.jsx";
import { AIActionApproval } from "../../kit/AIActionApproval.jsx";
import { AIExecutionStatus } from "../../kit/AIExecutionStatus.jsx";
import { AILearningFeedback } from "../../kit/AILearningFeedback.jsx";
import { AIConfidence } from "../../kit/AIConfidence.jsx";
import { AIRiskAlert } from "../../kit/AIRiskAlert.jsx";

const SECTION_TABS = [
  { key: "foundations", label: "Foundations" },
  { key: "components", label: "Components" },
  { key: "ai", label: "AI Interaction Language" },
  { key: "products", label: "Product Examples" },
];

const TYPE_ROLES = [
  ["display-hero", "56 / 600"], ["display-section", "40 / 600"], ["heading-page", "30 / 600"],
  ["heading-section", "22 / 600"], ["heading-card", "18 / 600"], ["title-item", "16 / 600"],
  ["body-large", "16 / 400"], ["body", "14 / 400"], ["body-small", "13 / 400"],
  ["label", "13 / 500"], ["caption", "12 / 400"], ["metric", "24 / 600"],
];

const COLOR_SWATCHES = [
  "canvas", "canvas-subtle", "surface", "surface-inverse", "border-default", "text-primary",
  "text-secondary", "text-tertiary", "action-primary", "focus", "success", "warning", "danger",
  "information", "ai-accent",
];

const RADII = ["xs", "sm", "md", "lg", "xl", "pill"];
const SPACES = [4, 8, 16, 24, 32, 40, 64];

function Swatch({ token }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ width: 56, height: 40, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: `var(--${token})` }} />
      <span className="fdr-type-caption">{token}</span>
    </div>
  );
}

function Foundations() {
  return (
    <div>
      <h2 className="fdr-type-heading-section">Typography</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "var(--space-32)" }}>
        {TYPE_ROLES.map(([role, meta]) => (
          <div key={role} className={`fdr-type-${role}`} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ minWidth: 260 }}>{role} — Design DNA 示例文本</span>
            <span className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>{meta}</span>
          </div>
        ))}
      </div>

      <h2 className="fdr-type-heading-section">Color</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: "var(--space-32)" }}>
        {COLOR_SWATCHES.map((token) => <Swatch key={token} token={token} />)}
      </div>

      <h2 className="fdr-type-heading-section">Spacing</h2>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: "var(--space-32)" }}>
        {SPACES.map((s) => (
          <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: s, height: s, background: "var(--ai-accent)", borderRadius: 2 }} />
            <span className="fdr-type-caption">{s}</span>
          </div>
        ))}
      </div>

      <h2 className="fdr-type-heading-section">Radius</h2>
      <div style={{ display: "flex", gap: 16, marginBottom: "var(--space-32)" }}>
        {RADII.map((r) => (
          <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: 56, height: 56, background: "var(--canvas-subtle)", border: "1px solid var(--border-default)", borderRadius: `var(--radius-${r})` }} />
            <span className="fdr-type-caption">radius-{r}</span>
          </div>
        ))}
      </div>

      <h2 className="fdr-type-heading-section">Elevation</h2>
      <div style={{ display: "flex", gap: 24 }}>
        {[1, 2, 3].map((level) => (
          <div key={level} style={{ width: 120, height: 72, background: "var(--surface)", borderRadius: "var(--radius-md)", boxShadow: `var(--elevation-${level})`, display: "flex", alignItems: "center", justifyContent: "center" }} className="fdr-type-caption">
            elevation-{level}
          </div>
        ))}
      </div>
    </div>
  );
}

function Components() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [segment, setSegment] = useState("a");
  const [selectValue, setSelectValue] = useState("1");

  return (
    <div>
      <h2 className="fdr-type-heading-section">Buttons</h2>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "var(--space-32)", flexWrap: "wrap" }}>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="primary" disabled>Disabled</Button>
        <IconButton icon="Settings" aria-label="设置" />
        <TextButton>Text button</TextButton>
      </div>

      <h2 className="fdr-type-heading-section">Form controls</h2>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: "var(--space-32)", maxWidth: 640 }}>
        <div style={{ minWidth: 220 }}>
          <Input label="店铺名称" placeholder="输入店铺名称" />
        </div>
        <div style={{ minWidth: 220 }}>
          <Select label="优先级" value={selectValue} onChange={(e) => setSelectValue(e.target.value)} options={[{ value: "1", label: "P0" }, { value: "2", label: "P1" }]} />
        </div>
        <Checkbox label="启用自动化" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <Switch checked={switchOn} onChange={setSwitchOn} label="实时同步" />
        <SegmentedControl options={[{ value: "a", label: "今天" }, { value: "b", label: "7 天" }]} value={segment} onChange={setSegment} />
      </div>

      <h2 className="fdr-type-heading-section">Badges & status</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: "var(--space-32)" }}>
        <Badge tone="neutral">Neutral</Badge>
        <Badge tone="ai">AI</Badge>
        <StatusBadge tone="success">运行中</StatusBadge>
        <StatusBadge tone="danger">失败</StatusBadge>
      </div>

      <h2 className="fdr-type-heading-section">Metric</h2>
      <div style={{ display: "flex", gap: 40, marginBottom: "var(--space-32)" }}>
        <Metric variant="primary" value="92" unit="%" caption="今日最重要的一个数字" />
        <Metric variant="standard" value="1,240" caption="Token 余额" />
      </div>

      <h2 className="fdr-type-heading-section">Data table</h2>
      <div style={{ marginBottom: "var(--space-32)" }}>
        <DataTable
          columns={[{ key: "name", label: "名称" }, { key: "value", label: "数值" }]}
          rows={[{ id: 1, name: "GMV", value: "¥12,480" }, { id: 2, name: "订单数", value: "154" }]}
        />
      </div>

      <h2 className="fdr-type-heading-section">Key-value list</h2>
      <div style={{ maxWidth: 360, marginBottom: "var(--space-32)" }}>
        <KeyValueList items={[{ label: "套餐", value: "Founder Pro" }, { label: "到期时间", value: "2026-12-31" }]} />
      </div>

      <h2 className="fdr-type-heading-section">Empty / error / loading states</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: "var(--space-32)" }}>
        <div className="fdr-card"><EmptyState message="暂无数据" /></div>
        <div className="fdr-card"><ErrorState message="加载失败" onRetry={() => {}} /></div>
        <div className="fdr-card"><SkeletonGroup count={3} /></div>
      </div>

      <h2 className="fdr-type-heading-section">Banner</h2>
      <div style={{ marginBottom: "var(--space-32)" }}>
        <Banner tone="information">这是一个信息横幅，用于页面级持续状态提示。</Banner>
      </div>

      <h2 className="fdr-type-heading-section">Dialog & Drawer</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={() => setModalOpen(true)}>打开 Dialog</Button>
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>打开 Drawer</Button>
      </div>
      <Modal open={modalOpen} title="确认操作" onClose={() => setModalOpen(false)} footer={<Button variant="primary" onClick={() => setModalOpen(false)}>确认</Button>}>
        <p className="fdr-type-body">这是一个 Dialog 示例。</p>
      </Modal>
      <Drawer open={drawerOpen} title="详情面板" onClose={() => setDrawerOpen(false)}>
        <p className="fdr-type-body">这是一个 Drawer 示例，用于非阻塞的上下文详情。</p>
      </Drawer>
    </div>
  );
}

function AILanguage() {
  const [decided, setDecided] = useState(null);

  return (
    <div>
      <h2 className="fdr-type-heading-section">Observe → Recommend</h2>
      <div style={{ marginBottom: "var(--space-24)" }}>
        <AIRecommendation
          title="补充库存 · 抖音店A"
          reason="「便携折叠加湿器」库存已为 0，最近 7 天日均销量 12 件。"
          priority="P0"
          action={{ label: "去商品中心", onClick: () => {} }}
        />
      </div>

      <h2 className="fdr-type-heading-section">Explain</h2>
      <div style={{ display: "flex", gap: 16, marginBottom: "var(--space-24)" }}>
        <AIConfidence value={92} />
        <AIRiskAlert level="medium" concern="补货延迟可能导致今日 GMV 下滑" />
      </div>

      <h2 className="fdr-type-heading-section">Approve</h2>
      <div className="fdr-ai-card" style={{ marginBottom: "var(--space-24)" }}>
        <AIActionApproval
          decided={decided}
          approver="Founder"
          onApprove={() => setDecided("approved")}
          onReject={() => setDecided("rejected")}
        />
      </div>

      <h2 className="fdr-type-heading-section">Execute</h2>
      <div style={{ marginBottom: "var(--space-24)" }}>
        <AIExecutionStatus steps={["生成补货建议", "同步采购系统", "通知供应商"]} currentStep={1} state="running" />
      </div>

      <h2 className="fdr-type-heading-section">Learn</h2>
      <AILearningFeedback outcome="补货建议已采纳，库存在 4 小时内恢复。" predicted="6 小时恢复" actual="4 小时恢复" />
    </div>
  );
}

function ProductExamples() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 24 }}>
      <div className="fdr-card">
        <h3 className="fdr-type-heading-card"><Icon name="Gauge" size={18} style={{ marginRight: 6, verticalAlign: "-3px" }} />Founder工作台</h3>
        <p className="fdr-type-body-small" style={{ color: "var(--text-secondary)" }}>决策优先的 Decision Home — 见 Founder工作台 实际页面。</p>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-type-heading-card"><Icon name="FlaskConical" size={18} style={{ marginRight: 6, verticalAlign: "-3px" }} />Operator 实验室</h3>
        <p className="fdr-type-body-small" style={{ color: "var(--text-secondary)" }}>令牌尚未应用到 Operator 实验室页面 — 下一批迁移范围。</p>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-type-heading-card"><Icon name="Palette" size={18} style={{ marginRight: 6, verticalAlign: "-3px" }} />Studio 实验室</h3>
        <p className="fdr-type-body-small" style={{ color: "var(--text-secondary)" }}>令牌尚未应用到 Studio 实验室页面 — 下一批迁移范围。</p>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-type-heading-card"><Icon name="Cloud" size={18} style={{ marginRight: 6, verticalAlign: "-3px" }} />Cloud Center</h3>
        <p className="fdr-type-body-small" style={{ color: "var(--text-secondary)" }}>令牌尚未应用到 Cloud Center 页面 — 下一批迁移范围。</p>
      </div>
    </div>
  );
}

/**
 * Internal design-review route only — docs/01-foundation/design/.
 * Not a customer nav item (hiddenFromSidebar in navConfig.js),
 * reachable via ?module=designDna.
 */
export function DesignDnaModule() {
  const [tab, setTab] = useState("foundations");

  return (
    <div>
      <PageHeader title="AI Commerce OS Design DNA v1.0" subtitle="内部设计评审页面 — 非客户可见导航项" />
      <Tabs tabs={SECTION_TABS} activeTab={tab} onChange={setTab} />
      <div style={{ marginTop: "var(--space-24)" }}>
        {tab === "foundations" ? <Foundations /> : null}
        {tab === "components" ? <Components /> : null}
        {tab === "ai" ? <AILanguage /> : null}
        {tab === "products" ? <ProductExamples /> : null}
      </div>
    </div>
  );
}
