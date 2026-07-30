import { useMemo, useState } from "react";
import {
  PageHeader,
  StatGrid,
  StatCard,
  AIActionApproval,
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
import { getDecisions } from "../founderWorkspace/workspaceEntities.js";
import {
  WorkspaceStatusBadge,
  DrillDownLink,
  WorkspaceLoadingSkeleton,
  RestrictedAction,
} from "../founderWorkspace/WorkspaceKit.jsx";
import { useDemoLoading, useDemoRefreshFailure } from "../founderWorkspace/useWorkspaceDemoState.js";
import { useToast } from "../../kit/useToast.js";

const VIEW_TABS = [
  { key: "pending", label: "待决策" },
  { key: "in-review", label: "审议中" },
  { key: "approved", label: "已批准" },
  { key: "rejected", label: "已驳回" },
  { key: "executed", label: "已执行" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "全部优先级" },
  { value: "P0", label: "P0" },
  { value: "P1", label: "P1" },
  { value: "P2", label: "P2" },
];

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN");
}

/**
 * Founder Workspace · 决策中心 — aggregates every pending/in-review
 * item across Founder's four identities (Operator approvals, Studio
 * content review, Capability Center evaluate/approve, Cloud Token/
 * Marketplace) into one queue, per Charter §3.1. Each card drills back
 * into the module that actually owns the decision — this page does
 * not duplicate approval logic, only surfaces it, plus a demo-local
 * approve/reject/mark-executed loop so reviewers can see state change.
 */
export function DecisionsModule() {
  const loading = useDemoLoading();
  const { failed, triggerRefresh } = useDemoRefreshFailure();
  const showToast = useToast();

  const [decisions, setDecisions] = useState(() => getDecisions());
  const [activeView, setActiveView] = useState("pending");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [detailId, setDetailId] = useState(null);

  function handleRefresh() {
    const willSucceed = failed || false;
    triggerRefresh();
    if (willSucceed) {
      showToast("决策队列已刷新", "success");
    }
  }

  function updateStatus(id, status, message) {
    setDecisions((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    showToast(message, status === "rejected" ? "default" : "success");
  }

  const viewMatch = useMemo(
    () => ({
      pending: (d) => d.status === "pending" || d.status === "blocked",
      "in-review": (d) => d.status === "in-review",
      approved: (d) => d.status === "approved",
      rejected: (d) => d.status === "rejected",
      executed: (d) => d.status === "executed",
    }),
    []
  );

  const filtered = decisions
    .filter(viewMatch[activeView])
    .filter((d) => (priorityFilter === "all" ? true : d.priority === priorityFilter))
    .filter((d) => (query.trim() ? d.title.includes(query.trim()) || d.summary.includes(query.trim()) : true));

  const detailDecision = decisions.find((d) => d.id === detailId) ?? null;

  const activeFilters = [
    query.trim() ? { key: "q", label: `搜索：${query.trim()}`, onRemove: () => setQuery("") } : null,
    priorityFilter !== "all" ? { key: "p", label: `优先级：${priorityFilter}`, onRemove: () => setPriorityFilter("all") } : null,
  ].filter(Boolean);

  if (loading) {
    return <WorkspaceLoadingSkeleton title="决策中心" subtitle="跨 Operator / Studio / AI Capability Center / Cloud 的待决策队列" />;
  }

  return (
    <div>
      <PageHeader
        title="决策中心"
        subtitle="跨 Operator / Studio / AI Capability Center / Cloud 的待决策队列——一处批准，各处执行"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DemoBadge />
            <Button variant="primary" size="sm" onClick={handleRefresh}>刷新决策队列</Button>
            <RestrictedAction label="导出决策记录" />
          </div>
        }
      />
      <StatGrid>
        <StatCard label="待决策" value={decisions.filter((d) => d.status === "pending" || d.status === "blocked").length} onClick={() => setActiveView("pending")} />
        <StatCard label="审议中" value={decisions.filter((d) => d.status === "in-review").length} onClick={() => setActiveView("in-review")} />
        <StatCard label="已批准" value={decisions.filter((d) => d.status === "approved").length} onClick={() => setActiveView("approved")} />
        <StatCard label="P0 优先级" value={decisions.filter((d) => d.priority === "P0").length} />
      </StatGrid>

      <div style={{ marginTop: 16 }}>
        <Tabs tabs={VIEW_TABS} activeTab={activeView} onChange={setActiveView} />
      </div>

      <div style={{ marginTop: 12 }}>
        <FilterBar activeFilters={activeFilters} onClearAll={() => { setQuery(""); setPriorityFilter("all"); }}>
          <SearchField label="搜索决策" placeholder="按标题或摘要搜索" value={query} onChange={setQuery} />
          <Select label="优先级" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} options={PRIORITY_OPTIONS} />
        </FilterBar>
      </div>

      {failed ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState message="决策队列刷新失败（演示环境模拟）" detail="GET /api/founder/decisions -> 503" onRetry={handleRefresh} />
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.length === 0 ? (
            <EmptyState
              message="当前筛选条件下暂无决策事项"
              action={activeFilters.length > 0 ? <Button size="sm" variant="secondary" onClick={() => { setQuery(""); setPriorityFilter("all"); }}>清除筛选</Button> : null}
            />
          ) : (
            filtered.map((d) => (
              <div className="fdr-card" key={d.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setDetailId(d.id)}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      <strong>{d.title}</strong>
                      <WorkspaceStatusBadge status={d.status} />
                    </div>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0" }}>{d.summary}</p>
                    <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      来源：{d.sourceModule} · {d.sourceModuleLabel} · 负责人 {d.owner} · 截止 {formatTime(d.dueAt)}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    <DrillDownLink module={d.linkedModule} subView={d.linkedSubView}>去处理</DrillDownLink>
                    <Button size="sm" variant="ghost" onClick={() => setDetailId(d.id)}>查看详情</Button>
                  </div>
                </div>
                {d.status === "pending" || d.status === "blocked" ? (
                  <div style={{ marginTop: 8 }}>
                    <AIActionApproval
                      onApprove={() => updateStatus(d.id, "approved", `已批准「${d.title}」`)}
                      onReject={() => updateStatus(d.id, "rejected", `已驳回「${d.title}」`)}
                    />
                  </div>
                ) : null}
                {d.status === "approved" ? (
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <Button size="sm" variant="secondary" onClick={() => updateStatus(d.id, "executed", `「${d.title}」已标记为执行完成`)}>
                      标记为已执行
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      <Drawer
        open={!!detailDecision}
        title={detailDecision?.title}
        onClose={() => setDetailId(null)}
        footer={
          detailDecision ? (
            <DrillDownLink module={detailDecision.linkedModule} subView={detailDecision.linkedSubView}>
              前往来源模块处理
            </DrillDownLink>
          ) : null
        }
      >
        {detailDecision ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              <WorkspaceStatusBadge status={detailDecision.status} />
            </div>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>{detailDecision.summary}</p>
            <KeyValueList
              items={[
                { label: "影响范围", value: detailDecision.impact },
                { label: "发起来源", value: `${detailDecision.sourceModule} · ${detailDecision.sourceModuleLabel}` },
                { label: "负责人", value: detailDecision.owner },
                { label: "优先级", value: detailDecision.priority },
                { label: "截止时间", value: formatTime(detailDecision.dueAt) },
                { label: "发起时间", value: formatTime(detailDecision.createdAt) },
              ]}
            />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
