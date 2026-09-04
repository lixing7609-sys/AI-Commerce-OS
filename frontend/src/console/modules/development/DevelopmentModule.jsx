import { useState } from "react";
import {
  PageHeader,
  StatGrid,
  StatCard,
  Timeline,
  DataTable,
  StatusPill,
  DemoBadge,
  Button,
  Select,
  SearchField,
  FilterBar,
  ProgressBar,
  Checkbox,
  Modal,
  Input,
  Drawer,
  KeyValueList,
  EmptyState,
  ErrorState,
} from "../../kit/index.js";
import {
  WorkspaceLoadingSkeleton,
  RestrictedAction,
} from "../founderWorkspace/WorkspaceKit.jsx";
import { useDemoLoading, useDemoRefreshFailure } from "../founderWorkspace/useWorkspaceDemoState.js";
import { useToast } from "../../kit/useToast.js";

/**
 * Founder Workspace · 开发进度 — Founder 自身的构建路线图与最近变更
 * ——不是 Operator/Studio 的产品路线图。`ROADMAP` mirrors the real
 * milestone doc set at docs/12-milestones/ (M0–M7); those files exist
 * but are currently empty, so status is reported honestly as "文档
 * 待补充" rather than invented completion claims. `RECENT_BUILDS` is
 * real (this repo's own recent commit history), not mock data.
 * 模块进度/开发任务/测试状态/发布准备/阻塞事项 是本轮新增的演示
 * 面板（无真实 CI/项目管理系统接入），均带演示数据标识。
 */
const ROADMAP = [
  { key: "M0", title: "M0 · Project Foundation", status: "文档待补充" },
  { key: "M1", title: "M1 · Reference Architecture", status: "文档待补充" },
  { key: "M2", title: "M2 · Specification", status: "文档待补充" },
  { key: "M3", title: "M3 · Domain", status: "文档待补充" },
  { key: "M4", title: "M4 · Database", status: "文档待补充" },
  { key: "M5", title: "M5 · Workflow", status: "文档待补充" },
  { key: "M6", title: "M6 · Runtime", status: "文档待补充" },
  { key: "M7", title: "M7 · MVP", status: "文档待补充" },
];

const RECENT_BUILDS = [
  { hash: "3b535ea", date: "2026-07-30", message: "wip: founder master edition architecture reset interrupted checkpoint" },
  { hash: "9c6c82c", date: "2026-07-30", message: "design: rebuild Founder navigation shell" },
  { hash: "7504d9f", date: "2026-07-29", message: "design: establish AI Commerce OS Design DNA v1.0" },
  { hash: "2798e74", date: "2026-07-29", message: "refactor: rebuild Founder IA and consolidate Operator Lab" },
  { hash: "fee8b7b", date: "2026-07-29", message: "docs: Founder v3 audit Batch 1 — route inventory, runtime error report, quality matrix" },
  { hash: "3f1bfd3", date: "2026-07-29", message: "checkpoint: preserve founder before full-system reconstruction" },
  { hash: "54513bd", date: "2026-07-28", message: "docs: update Founder navigation and Cloud Marketplace architecture" },
  { hash: "9563454", date: "2026-07-28", message: "refactor: distinguish Founder Operator and Studio secretaries" },
];

const MODULE_PROGRESS = [
  { id: "founder", name: "Founder 工作台", progress: 78 },
  { id: "operator", name: "Operator 实验室", progress: 64 },
  { id: "studio", name: "Studio 实验室", progress: 58 },
  { id: "cloud", name: "Cloud Center", progress: 71 },
  { id: "capability", name: "AI Capability Center", progress: 52 },
];

const MODULE_OPTIONS = [
  { value: "all", label: "全部模块" },
  ...MODULE_PROGRESS.map((m) => ({ value: m.id, label: m.name })),
];

const TASK_STATUS_LABEL = { todo: "待开始", in_progress: "进行中", done: "已完成" };
const TASK_STATUS_TONE = { todo: "neutral", in_progress: "info", done: "success" };

const INITIAL_TASKS = [
  { id: "t-1", title: "8 页 Founder 工作台中文框架审查", module: "founder", status: "in_progress", priority: "P0" },
  { id: "t-2", title: "Operator Lab 审批中心与决策中心联调", module: "operator", status: "todo", priority: "P1" },
  { id: "t-3", title: "Studio Lab 内容审核状态回传", module: "studio", status: "todo", priority: "P1" },
  { id: "t-4", title: "Cloud Center 设备心跳异常告警", module: "cloud", status: "done", priority: "P2" },
  { id: "t-5", title: "AI Capability Center 评估回归复查", module: "capability", status: "in_progress", priority: "P1" },
];

const INITIAL_RELEASE_CHECKLIST = [
  { id: "c-1", label: "全部页面完成中文框架审查", checked: false },
  { id: "c-2", label: "vitest / lint / build 全部通过", checked: true },
  { id: "c-3", label: "演示数据标识覆盖全部页面", checked: true },
  { id: "c-4", label: "产品负责人逐页验收签字", checked: false },
];

const INITIAL_BLOCKERS = [
  { id: "b-1", title: "Operator Lab 审批中心接口字段未最终确认", owner: "Operator Lab 负责人", age: "2 天" },
  { id: "b-2", title: "Studio Lab 内容审核状态枚举与 Founder 决策中心未完全对齐", owner: "Studio Lab 负责人", age: "1 天" },
];

export function DevelopmentModule() {
  const loading = useDemoLoading();
  const { failed: testFailed, triggerRefresh: retryTests } = useDemoRefreshFailure();
  const showToast = useToast();

  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [detailTask, setDetailTask] = useState(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskModule, setNewTaskModule] = useState("founder");
  const [checklist, setChecklist] = useState(INITIAL_RELEASE_CHECKLIST);
  const [blockers, setBlockers] = useState(INITIAL_BLOCKERS);
  const [testsRunning, setTestsRunning] = useState(false);

  function runTests() {
    const willSucceed = testFailed;
    setTestsRunning(true);
    window.setTimeout(() => {
      setTestsRunning(false);
      retryTests();
      if (willSucceed) showToast("测试已重新通过", "success");
    }, 500);
  }

  function cycleTaskStatus(id) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = t.status === "todo" ? "in_progress" : t.status === "in_progress" ? "done" : "done";
        return { ...t, status: next };
      })
    );
  }

  function createTask() {
    if (!newTaskTitle.trim()) {
      showToast("请填写任务标题", "default");
      return;
    }
    setTasks((prev) => [
      { id: `t-${Date.now()}`, title: newTaskTitle.trim(), module: newTaskModule, status: "todo", priority: "P2" },
      ...prev,
    ]);
    setNewTaskTitle("");
    setNewTaskOpen(false);
    showToast("已创建开发任务", "success");
  }

  function resolveBlocker(id) {
    setBlockers((prev) => prev.filter((b) => b.id !== id));
    showToast("阻塞事项已标记为解决", "success");
  }

  const filteredTasks = tasks
    .filter((t) => (moduleFilter === "all" ? true : t.module === moduleFilter))
    .filter((t) => (query.trim() ? t.title.includes(query.trim()) : true));

  const readiness = Math.round((checklist.filter((c) => c.checked).length / checklist.length) * 100);
  const allChecked = checklist.every((c) => c.checked);

  if (loading) {
    return <WorkspaceLoadingSkeleton title="开发进度" subtitle="Founder 自身的构建路线图与最近变更" />;
  }

  return (
    <div>
      <PageHeader
        title="开发进度"
        subtitle="Founder 自身的构建路线图与最近变更——不是 Operator/Studio 的产品路线图"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <DemoBadge />
            <Button variant="primary" size="sm" onClick={() => setNewTaskOpen(true)}>新建开发任务</Button>
            <RestrictedAction label="导出开发周报" />
          </div>
        }
      />

      <StatGrid>
        <StatCard label="进行中任务" value={tasks.filter((t) => t.status === "in_progress").length} />
        <StatCard label="待开始任务" value={tasks.filter((t) => t.status === "todo").length} />
        <StatCard label="阻塞事项" value={blockers.length} />
        <StatCard label="发布准备度" value={`${readiness}%`} />
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>当前迭代</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Founder Master Edition V1.0 · 全量中文框架搭建与人工审查（2026-07-28 ～ 2026-08-02）
        </p>
        <ProgressBar value={68} max={100} tone="primary" label="迭代进度 68%（演示）" />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>路线图（docs/12-milestones/）</h3>
        <DataTable
          columns={[
            { key: "title", label: "里程碑" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone="neutral">{r.status}</StatusPill> },
          ]}
          rows={ROADMAP.map((r) => ({ id: r.key, ...r }))}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>模块进度 <span className="fdr-type-caption" style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>（演示）</span></h3>
        {MODULE_PROGRESS.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span>{m.name}</span>
              <span className="fdr-tabular-num">{m.progress}%</span>
            </div>
            <ProgressBar value={m.progress} max={100} tone={m.progress >= 70 ? "success" : "primary"} />
          </div>
        ))}
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>开发任务</h3>
          <FilterBar
            activeFilters={[
              query.trim() ? { key: "q", label: `搜索：${query.trim()}`, onRemove: () => setQuery("") } : null,
              moduleFilter !== "all" ? { key: "m", label: MODULE_OPTIONS.find((o) => o.value === moduleFilter)?.label, onRemove: () => setModuleFilter("all") } : null,
            ].filter(Boolean)}
            onClearAll={() => { setQuery(""); setModuleFilter("all"); }}
          >
            <SearchField label="搜索任务" placeholder="按标题搜索" value={query} onChange={setQuery} />
            <Select label="按模块筛选" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} options={MODULE_OPTIONS} />
          </FilterBar>
        </div>
        <DataTable
          columns={[
            { key: "title", label: "任务" },
            { key: "module", label: "所属模块", render: (r) => MODULE_PROGRESS.find((m) => m.id === r.module)?.name ?? r.module },
            { key: "priority", label: "优先级" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={TASK_STATUS_TONE[r.status]}>{TASK_STATUS_LABEL[r.status]}</StatusPill> },
          ]}
          rows={filteredTasks}
          onRowClick={setDetailTask}
          emptyMessage="当前筛选条件下暂无开发任务"
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>测试状态 <span className="fdr-type-caption" style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>（演示）</span></h3>
          <Button size="sm" variant="secondary" onClick={runTests} disabled={testsRunning}>
            {testsRunning ? "运行中…" : "运行测试"}
          </Button>
        </div>
        {testsRunning ? (
          <EmptyState icon="◔" message="测试正在运行…" />
        ) : testFailed ? (
          <ErrorState message="最近一次测试运行失败（演示环境模拟）" detail="vitest run -> 1 failed, 42 passed" onRetry={runTests} />
        ) : (
          <StatGrid>
            <StatCard label="单元测试" value="42 / 42 通过" />
            <StatCard label="Lint" value="0 errors" />
            <StatCard label="构建" value="通过" />
          </StatGrid>
        )}
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>发布准备</h3>
        <ProgressBar value={readiness} max={100} tone={readiness === 100 ? "success" : "warning"} label={`准备度 ${readiness}%`} />
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {checklist.map((c) => (
            <Checkbox
              key={c.id}
              label={c.label}
              checked={c.checked}
              onChange={() => setChecklist((prev) => prev.map((item) => (item.id === c.id ? { ...item, checked: !item.checked } : item)))}
            />
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <RestrictedAction label={allChecked ? "执行发布" : "执行发布（清单未完成）"} reason="演示环境不支持真实发布，需接入真实 CI/CD 后开放" />
        </div>
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>阻塞事项</h3>
        {blockers.length === 0 ? (
          <EmptyState message="当前没有阻塞事项" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {blockers.map((b) => (
              <div key={b.id} className="fdr-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <strong>{b.title}</strong>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>负责人：{b.owner} · 已阻塞 {b.age}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => resolveBlocker(b.id)}>标记为已解决</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>变更记录（真实提交历史）</h3>
        <Timeline items={RECENT_BUILDS.map((b) => ({ title: b.message, timestamp: `${b.hash} · ${b.date}` }))} />
      </div>

      <Drawer open={!!detailTask} title={detailTask?.title} onClose={() => setDetailTask(null)}
        footer={detailTask ? <Button variant="primary" onClick={() => { cycleTaskStatus(detailTask.id); setDetailTask(null); showToast("任务状态已更新", "success"); }}>推进到下一状态</Button> : null}
      >
        {detailTask ? (
          <KeyValueList
            items={[
              { label: "所属模块", value: MODULE_PROGRESS.find((m) => m.id === detailTask.module)?.name ?? detailTask.module },
              { label: "优先级", value: detailTask.priority },
              { label: "状态", value: TASK_STATUS_LABEL[detailTask.status] },
            ]}
          />
        ) : null}
      </Drawer>

      <Modal
        open={newTaskOpen}
        title="新建开发任务"
        onClose={() => setNewTaskOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewTaskOpen(false)}>取消</Button>
            <Button variant="primary" onClick={createTask}>创建</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="任务标题" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="例如：补充 XX 模块空状态文案" />
          <Select label="所属模块" value={newTaskModule} onChange={(e) => setNewTaskModule(e.target.value)} options={MODULE_PROGRESS.map((m) => ({ value: m.id, label: m.name }))} />
        </div>
      </Modal>
    </div>
  );
}
