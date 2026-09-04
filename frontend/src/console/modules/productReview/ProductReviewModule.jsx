import { useMemo, useState } from "react";
import { PageHeader, StatCard, StatGrid, DataTable, StatusPill, DemoBadge, Drawer, Textarea, Button } from "../../kit/index.js";
import { createLocalRepository } from "../../../shared/localRepository.js";
import { REVIEW_GROUPS, REVIEW_PAGES, getReviewSummary } from "./reviewManifest.js";

/**
 * 产品审查模式（Founder Master Edition V1.0 中文框架审查版 §六）——
 * 供产品负责人逐页检查全部 51 个可见页面的名称/职责/功能区域/是否
 * 演示框架/是否接入后端，并记录"待修改/已确认"意见。这是一个真实
 * 可用的工具页面，不是静态清单：意见持久化在 localStorage，刷新
 * 不丢失，是本轮唯一允许"产品负责人的输入即是最终数据"的页面。
 */

const DECISION_LABEL = { unreviewed: "待审查", needs_change: "待修改", confirmed: "已确认" };
const DECISION_TONE = { unreviewed: "neutral", needs_change: "warning", confirmed: "success" };
const BACKEND_LABEL = { demo: "纯演示数据", partial: "部分接入真实后端", live: "已接入真实后端" };
const BACKEND_TONE = { demo: "neutral", partial: "info", live: "success" };

const repository = createLocalRepository("productReviewDecisions", () =>
  Object.fromEntries(REVIEW_PAGES.map((p) => [p.key, { decision: "unreviewed", note: "" }]))
);

export function ProductReviewModule() {
  const [decisions, setDecisions] = useState(() => repository.get());
  const [groupFilter, setGroupFilter] = useState("all");
  const [activePage, setActivePage] = useState(null);

  const summary = useMemo(() => getReviewSummary(), []);
  const reviewedCount = Object.values(decisions).filter((d) => d.decision !== "unreviewed").length;
  const confirmedCount = Object.values(decisions).filter((d) => d.decision === "confirmed").length;
  const needsChangeCount = Object.values(decisions).filter((d) => d.decision === "needs_change").length;

  const visiblePages = groupFilter === "all" ? REVIEW_PAGES : REVIEW_PAGES.filter((p) => p.group === groupFilter);

  function setDecision(pageKey, patch) {
    const next = repository.update((prev) => ({ ...prev, [pageKey]: { ...prev[pageKey], ...patch } }));
    setDecisions(next);
  }

  return (
    <div>
      <PageHeader
        title="产品审查"
        subtitle="Founder Master Edition V1.0 中文框架审查版 —— 逐页检查名称/功能/归属/结构/入口/关系，本页意见会保存在本地，供人工复核"
        actions={<DemoBadge />}
      />

      <StatGrid>
        <StatCard label="顶层导航分组" value={REVIEW_GROUPS.length} />
        <StatCard label="可见页面总数" value={summary.total} />
        <StatCard label="已审查 / 未审查" value={`${reviewedCount} / ${summary.total - reviewedCount}`} />
        <StatCard label="已确认" value={confirmedCount} />
        <StatCard label="待修改" value={needsChangeCount} />
        <StatCard label="部分/已接入真实后端" value={summary.backendPartialOrLive} />
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>五大分组</h3>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={"fdr-btn fdr-btn--sm" + (groupFilter === "all" ? " fdr-btn--primary" : " fdr-btn--secondary")}
            onClick={() => setGroupFilter("all")}
          >
            全部（{summary.total}）
          </button>
          {summary.byGroup.map((g) => (
            <button
              key={g.key}
              type="button"
              className={"fdr-btn fdr-btn--sm" + (groupFilter === g.key ? " fdr-btn--primary" : " fdr-btn--secondary")}
              onClick={() => setGroupFilter(g.key)}
            >
              {g.label}（{g.actual}）
            </button>
          ))}
        </div>
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <DataTable
          columns={[
            { key: "label", label: "中文页面名称", render: (r) => <b>{r.label}</b> },
            { key: "group", label: "顶层分组", render: (r) => REVIEW_GROUPS.find((g) => g.key === r.group)?.label ?? r.group },
            { key: "key", label: "内部 key", render: (r) => <code style={{ fontSize: 12 }}>{r.key}</code> },
            {
              key: "backend", label: "是否接入后端",
              render: (r) => <StatusPill tone={BACKEND_TONE[r.backend]}>{BACKEND_LABEL[r.backend]}</StatusPill>,
            },
            {
              key: "decision", label: "产品负责人意见",
              render: (r) => <StatusPill tone={DECISION_TONE[decisions[r.key]?.decision ?? "unreviewed"]}>{DECISION_LABEL[decisions[r.key]?.decision ?? "unreviewed"]}</StatusPill>,
            },
            {
              key: "actions", label: "操作",
              render: (r) => <Button size="sm" variant="secondary" onClick={() => setActivePage(r.key)}>查看详情</Button>,
            },
          ]}
          rows={visiblePages}
        />
      </div>

      <Drawer open={!!activePage} onClose={() => setActivePage(null)} title="页面审查详情">
        {activePage ? <PageReviewDetail page={REVIEW_PAGES.find((p) => p.key === activePage)} decision={decisions[activePage]} onChange={(patch) => setDecision(activePage, patch)} /> : null}
      </Drawer>
    </div>
  );
}

function PageReviewDetail({ page, decision, onChange }) {
  if (!page) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ margin: "0 0 4px" }}>{page.label}</h3>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>{page.responsibility}</p>
      </div>
      <div>
        <div className="fdr-type-caption" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>核心功能区域</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {page.sections.map((s) => (
            <span
              key={s}
              style={{
                fontSize: 12, padding: "3px 8px", borderRadius: "var(--radius-sm, 6px)",
                background: "var(--canvas-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)",
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="fdr-type-caption" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>当前实现文件</div>
        <code style={{ fontSize: 12 }}>{page.file}</code>
      </div>
      <div>
        <div className="fdr-type-caption" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>是否接入后端</div>
        <StatusPill tone={BACKEND_TONE[page.backend]}>{BACKEND_LABEL[page.backend]}</StatusPill>
        {page.backendNote ? <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>{page.backendNote}</p> : null}
      </div>
      <div>
        <div className="fdr-type-caption" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>产品负责人意见</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Button size="sm" variant={decision?.decision === "confirmed" ? "primary" : "secondary"} onClick={() => onChange({ decision: "confirmed" })}>已确认</Button>
          <Button size="sm" variant={decision?.decision === "needs_change" ? "primary" : "secondary"} onClick={() => onChange({ decision: "needs_change" })}>待修改</Button>
        </div>
        <Textarea
          label="备注（可选）"
          placeholder="填写待修改的具体原因，或确认时的补充说明"
          value={decision?.note ?? ""}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </div>
    </div>
  );
}
