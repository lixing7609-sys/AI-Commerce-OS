import { useState } from "react";
import {
  PageHeader,
  StatGrid,
  StatCard,
  AIRiskAlert,
  DemoBadge,
  Tabs,
  SearchField,
  Select,
  FilterBar,
  Button,
  EmptyState,
  ErrorState,
  Drawer,
  KeyValueList,
} from "../../kit/index.js";
import { getRisks, RISK_CATEGORY_LABEL } from "../founderWorkspace/workspaceEntities.js";
import {
  WorkspaceStatusBadge,
  DrillDownLink,
  WorkspaceLoadingSkeleton,
  RestrictedAction,
} from "../founderWorkspace/WorkspaceKit.jsx";
import { useDemoLoading, useDemoRefreshFailure } from "../founderWorkspace/useWorkspaceDemoState.js";
import { useToast } from "../../kit/useToast.js";

const LEVEL_ORDER = { high: 0, medium: 1, low: 2 };
const LEVEL_OPTIONS = [
  { value: "all", label: "全部等级" },
  { value: "high", label: "高风险" },
  { value: "medium", label: "中风险" },
  { value: "low", label: "低风险" },
];

const CATEGORY_TABS = [
  { key: "all", label: "全部" },
  ...Object.entries(RISK_CATEGORY_LABEL).map(([key, label]) => ({ key, label })),
];

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN");
}

/**
 * Founder Workspace · 风险中心 — same entity model as Decisions
 * (Charter §3.1), sourced from Cloud Token balance, Capability Center
 * evaluation regressions, Operator auto-ops thresholds, Cloud License
 * expiry, Studio content-review SLA, and device storage. Reuses the
 * existing AIRiskAlert primitive rather than inventing a second
 * risk-badge visual language.
 */
export function RisksModule() {
  const loading = useDemoLoading();
  const { failed, triggerRefresh } = useDemoRefreshFailure();
  const showToast = useToast();

  const [risks, setRisks] = useState(() => getRisks());
  const [category, setCategory] = useState("all");
  const [level, setLevel] = useState("all");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState(null);

  function handleRefresh() {
    const willSucceed = failed;
    triggerRefresh();
    if (willSucceed) showToast("风险扫描已刷新", "success");
  }

  function resolveRisk(id, title) {
    setRisks((prev) => prev.map((r) => (r.id === id ? { ...r, status: "resolved", progress: "已处理" } : r)));
    showToast(`已将「${title}」标记为已处理`, "success");
  }

  const filtered = [...risks]
    .filter((r) => (category === "all" ? true : r.category === category))
    .filter((r) => (level === "all" ? true : r.level === level))
    .filter((r) => (query.trim() ? r.title.includes(query.trim()) || r.concern.includes(query.trim()) : true))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  const detailRisk = risks.find((r) => r.id === detailId) ?? null;

  const activeFilters = [
    query.trim() ? { key: "q", label: `搜索：${query.trim()}`, onRemove: () => setQuery("") } : null,
    level !== "all" ? { key: "l", label: LEVEL_OPTIONS.find((o) => o.value === level)?.label, onRemove: () => setLevel("all") } : null,
  ].filter(Boolean);

  if (loading) {
    return <WorkspaceLoadingSkeleton title="风险中心" subtitle="跨 Founder 四大职能面的风险信号聚合" />;
  }

  return (
    <div>
      <PageHeader
        title="风险中心"
        subtitle="跨经营 / 内容 / 系统 / 设备 / 成本 / 合规六类风险信号聚合，按等级排序"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DemoBadge />
            <Button variant="primary" size="sm" onClick={handleRefresh}>刷新风险扫描</Button>
            <RestrictedAction label="导出风险报告" />
          </div>
        }
      />
      <StatGrid>
        <StatCard label="高风险" value={risks.filter((r) => r.level === "high" && r.status !== "resolved").length} />
        <StatCard label="中风险" value={risks.filter((r) => r.level === "medium" && r.status !== "resolved").length} />
        <StatCard label="低风险" value={risks.filter((r) => r.level === "low" && r.status !== "resolved").length} />
        <StatCard label="已处理" value={risks.filter((r) => r.status === "resolved").length} />
      </StatGrid>

      <div style={{ marginTop: 16 }}>
        <Tabs tabs={CATEGORY_TABS} activeTab={category} onChange={setCategory} />
      </div>

      <div style={{ marginTop: 12 }}>
        <FilterBar activeFilters={activeFilters} onClearAll={() => { setQuery(""); setLevel("all"); }}>
          <SearchField label="搜索风险" placeholder="按标题或描述搜索" value={query} onChange={setQuery} />
          <Select label="风险等级" value={level} onChange={(e) => setLevel(e.target.value)} options={LEVEL_OPTIONS} />
        </FilterBar>
      </div>

      {failed ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState message="风险扫描刷新失败（演示环境模拟）" detail="GET /api/founder/risks -> 503" onRetry={handleRefresh} />
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.length === 0 ? (
            <EmptyState
              message="当前筛选条件下暂无风险事项"
              action={activeFilters.length > 0 ? <Button size="sm" variant="secondary" onClick={() => { setQuery(""); setLevel("all"); }}>清除筛选</Button> : null}
            />
          ) : (
            filtered.map((r) => (
              <div className="fdr-card" key={r.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setDetailId(r.id)}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <strong>{r.title}</strong>
                      <WorkspaceStatusBadge status={r.status} />
                      <span className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>{RISK_CATEGORY_LABEL[r.category]}</span>
                    </div>
                    <AIRiskAlert level={r.level} concern={r.concern} />
                    <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>
                      责任人：{r.owner} · 处理进度：{r.progress} · 来源：{r.sourceModule} · 发现于 {formatTime(r.detectedAt)}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    <DrillDownLink module={r.linkedModule} subView={r.linkedSubView}>去处理</DrillDownLink>
                    {r.status !== "resolved" ? (
                      <Button size="sm" variant="secondary" onClick={() => resolveRisk(r.id, r.title)}>标记为已处理</Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Drawer open={!!detailRisk} title={detailRisk?.title} onClose={() => setDetailId(null)}
        footer={detailRisk ? <DrillDownLink module={detailRisk.linkedModule} subView={detailRisk.linkedSubView}>前往来源模块处理</DrillDownLink> : null}
      >
        {detailRisk ? (
          <div>
            <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
              <WorkspaceStatusBadge status={detailRisk.status} />
              <span className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>{RISK_CATEGORY_LABEL[detailRisk.category]}</span>
            </div>
            <AIRiskAlert level={detailRisk.level} concern={detailRisk.concern} />
            <div style={{ marginTop: 16 }}>
              <KeyValueList
                items={[
                  { label: "责任人", value: detailRisk.owner },
                  { label: "处理进度", value: detailRisk.progress },
                  { label: "来源模块", value: `${detailRisk.sourceModule} · ${detailRisk.sourceModuleLabel}` },
                  { label: "发现时间", value: formatTime(detailRisk.detectedAt) },
                ]}
              />
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
