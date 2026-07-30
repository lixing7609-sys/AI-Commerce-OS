import { useState } from "react";
import {
  PageHeader,
  StatGrid,
  StatCard,
  DataTable,
  StatusPill,
  DemoBadge,
  Button,
  Select,
  SearchField,
  FilterBar,
  ErrorState,
  Drawer,
  KeyValueList,
} from "../../kit/index.js";
import { getContentValidation } from "../founderWorkspace/workspaceEntities.js";
import { getFeaturedContentProject } from "../../../demoData/founderDemoData.js";
import { getStudioState } from "../../../studio/mock/studioMock.js";
import {
  DrillDownLink,
  WorkspaceLoadingSkeleton,
  RestrictedAction,
} from "../founderWorkspace/WorkspaceKit.jsx";
import { useDemoLoading, useDemoRefreshFailure } from "../founderWorkspace/useWorkspaceDemoState.js";
import { useToast } from "../../kit/useToast.js";

const MODE_LABEL = { real: "已发布", demo: "演示样片", queue: "生产队列中" };
const MODE_TONE = { real: "success", demo: "neutral", queue: "info" };
const MODE_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "real", label: "仅已发布" },
  { value: "demo", label: "仅演示样片" },
  { value: "queue", label: "仅生产队列中" },
];

/**
 * Founder Workspace · 内容验证 — the Studio-side mirror of 经营验证
 * (Charter §3.1): is Studio Lab's production actually reaching real
 * audiences, or still demo/queue content? Anchored to the same
 * featured content project (proj-7) used across Founder so this page
 * and Studio Lab's detail views read as one story.
 */
export function ContentValidationModule() {
  const loading = useDemoLoading();
  const { failed, triggerRefresh } = useDemoRefreshFailure();
  const showToast = useToast();

  const data = getContentValidation();
  const featuredProject = getFeaturedContentProject();
  const { contentProjects } = getStudioState();

  const [modeFilter, setModeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [detailItem, setDetailItem] = useState(null);

  function handleRefresh() {
    const willSucceed = failed;
    triggerRefresh();
    if (willSucceed) showToast("内容验证数据已刷新", "success");
  }

  const items = data.items
    .filter((i) => (modeFilter === "all" ? true : i.mode === modeFilter))
    .filter((i) => (query.trim() ? i.title.includes(query.trim()) : true));

  const totalTokenUsed = contentProjects.reduce((sum, p) => sum + (p.tokenUsed ?? 0), 0);
  const totalBudget = contentProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
  const publishedCount = contentProjects.filter((p) => p.status === "published").length;
  const inProductionCount = contentProjects.filter((p) => p.status === "in_production").length;

  const activeFilters = [
    query.trim() ? { key: "q", label: `搜索：${query.trim()}`, onRemove: () => setQuery("") } : null,
    modeFilter !== "all" ? { key: "m", label: MODE_OPTIONS.find((o) => o.value === modeFilter)?.label, onRemove: () => setModeFilter("all") } : null,
  ].filter(Boolean);

  if (loading) {
    return <WorkspaceLoadingSkeleton title="内容验证" subtitle={data.summary} />;
  }

  return (
    <div>
      <PageHeader
        title="内容验证"
        subtitle={data.summary}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <DemoBadge />
            <Button variant="primary" size="sm" onClick={handleRefresh}>刷新验证数据</Button>
            <DrillDownLink module="studioLab">进入 Studio 实验室 →</DrillDownLink>
          </div>
        }
      />
      <StatGrid>
        {data.metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} delta={m.delta} />
        ))}
      </StatGrid>

      {failed ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState message="内容验证数据刷新失败（演示环境模拟）" detail="GET /api/founder/content-validation -> 503" onRetry={handleRefresh} />
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginTop: 16 }}>
            <div className="fdr-card">
              <h3 style={{ marginTop: 0, fontSize: 14 }}>生产数量</h3>
              <p style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{contentProjects.length} 个项目</p>
              <p className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>{inProductionCount} 个生产中</p>
            </div>
            <div className="fdr-card">
              <h3 style={{ marginTop: 0, fontSize: 14 }}>审核通过率</h3>
              <p style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>92%<span className="fdr-type-caption" style={{ marginLeft: 6, color: "var(--text-tertiary)" }}>（演示）</span></p>
            </div>
            <div className="fdr-card">
              <h3 style={{ marginTop: 0, fontSize: 14 }}>发布数量</h3>
              <p style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{publishedCount} 个项目</p>
            </div>
            <div className="fdr-card">
              <h3 style={{ marginTop: 0, fontSize: 14 }}>内容成本</h3>
              <p style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{totalTokenUsed.toLocaleString()} Token</p>
              <p className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>预算利用率 {totalBudget ? Math.round((totalTokenUsed / totalBudget) * 100) : 0}%</p>
            </div>
          </div>

          <div className="fdr-card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>内容项目</h3>
              <FilterBar activeFilters={activeFilters} onClearAll={() => { setQuery(""); setModeFilter("all"); }}>
                <SearchField label="搜索内容" placeholder="按标题搜索" value={query} onChange={setQuery} />
                <Select label="按状态筛选" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} options={MODE_OPTIONS} />
              </FilterBar>
            </div>
            {featuredProject ? (
              <p className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>
                验证锚点项目：《{featuredProject.name}》— 与 Studio 实验室为同一条记录
              </p>
            ) : null}
            <DataTable
              columns={[
                { key: "title", label: "内容" },
                { key: "type", label: "类型" },
                { key: "mode", label: "状态", render: (r) => <StatusPill tone={MODE_TONE[r.mode]}>{MODE_LABEL[r.mode]}</StatusPill> },
                { key: "engagement", label: "互动表现/说明" },
                { key: "publishedAt", label: "发布时间" },
              ]}
              rows={items}
              onRowClick={setDetailItem}
              emptyMessage="当前筛选条件下暂无内容记录"
            />
          </div>

          <div style={{ marginTop: 16, textAlign: "right" }}>
            <RestrictedAction label="导出内容验证报告" />
          </div>
        </>
      )}

      <Drawer open={!!detailItem} title={detailItem?.title} onClose={() => setDetailItem(null)}
        footer={<DrillDownLink module="studioLab">前往 Studio 实验室查看完整生产详情</DrillDownLink>}
      >
        {detailItem ? (
          <KeyValueList
            items={[
              { label: "类型", value: detailItem.type },
              { label: "状态", value: MODE_LABEL[detailItem.mode] },
              { label: "互动表现", value: detailItem.engagement },
              { label: "发布时间", value: detailItem.publishedAt },
            ]}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
