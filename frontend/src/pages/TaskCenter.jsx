import { useEffect, useRef, useState } from "react";

import { getTaskDetail, getTasks, getTaskStats } from "../services/api";

const STATUS_LABELS = {
  pending: "待处理",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
};

const FILTERS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "running", label: "执行中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
];

function getStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function TaskCenter({ onNavigate = () => {} }) {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
  });

  const [taskList, setTaskList] = useState({
    items: [],
    pagination: {
      limit: 50,
      offset: 0,
      returned: 0,
      filtered_total: 0,
    },
  });

  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedTask, setSelectedTask] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedTaskIdRef = useRef(null);

  useEffect(() => {
    selectedTaskIdRef.current = selectedTask?.id ?? null;
  }, [selectedTask]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [tasksData, statsData] = await Promise.all([
          getTasks({
            status: statusFilter === "all" ? undefined : statusFilter,
            limit: 50,
            offset: 0,
          }),
          getTaskStats(),
        ]);

        if (cancelled) {
          return;
        }

        setTaskList({
          items: Array.isArray(tasksData.items) ? tasksData.items : [],
          pagination: {
            limit: tasksData.pagination?.limit ?? 50,
            offset: tasksData.pagination?.offset ?? 0,
            returned: tasksData.pagination?.returned ?? 0,
            filtered_total: tasksData.pagination?.filtered_total ?? 0,
          },
        });

        setStats({
          total: statsData.total ?? 0,
          pending: statsData.pending ?? 0,
          running: statsData.running ?? 0,
          completed: statsData.completed ?? 0,
          failed: statsData.failed ?? 0,
        });

        setError(null);

        const currentSelectedId = selectedTaskIdRef.current;

        if (currentSelectedId) {
          const refreshed = (tasksData.items ?? []).find(
            (item) => item.id === currentSelectedId
          );

          if (refreshed) {
            setSelectedTask(refreshed);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("任务中心数据加载失败：", err);
          setError(err.message || "任务数据加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    const timer = window.setInterval(loadData, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [statusFilter]);

  async function handleSelectTask(taskId) {
    setDetailError(null);
    setDetailLoading(true);

    try {
      const detail = await getTaskDetail(taskId);
      setSelectedTask(detail);
    } catch (err) {
      console.error("任务详情加载失败：", err);
      setDetailError(err.message || "任务详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCloseDetail() {
    setSelectedTask(null);
    setDetailError(null);
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">☀</span>
          <strong>AI CEO</strong>
        </div>

        <nav className="sidebar-navigation">
          <button
            className="sidebar-link"
            onClick={() => onNavigate("dashboard")}
          >
            <span>⌂</span>
            首页
          </button>

          <button
            className="sidebar-link"
            onClick={() => onNavigate("dashboard")}
          >
            <span>◎</span>
            运营概览
          </button>

          <button className="sidebar-link">
            <span>♙</span>
            AI 员工
          </button>

          <button className="sidebar-link active">
            <span>☑</span>
            任务中心
          </button>

          <button className="sidebar-link">
            <span>◔</span>
            数据分析
          </button>

          <button className="sidebar-link">
            <span>▣</span>
            知识库
          </button>

          <button className="sidebar-link">
            <span>⚙</span>
            设置
          </button>
        </nav>

        <div className="sidebar-account">
          <div className="account-status">
            <span
              className="status-light"
              style={{
                background: error ? "#a7a8ad" : "#26b85d",
              }}
            />
            {error ? "任务数据异常" : "任务中心正常"}
          </div>

          <div className="account-plan">
            <span>一人公司</span>
            <small>专业版</small>
          </div>
        </div>
      </aside>

      <main className="dashboard-workspace task-workspace">
        <header className="workspace-header">
          <div>
            <h1>任务中心</h1>
            <p>查看全部 AI 员工任务的执行状态与结果</p>
          </div>
        </header>

        <div className="task-scroll-area">
          {error && <div className="task-error">{error}</div>}

          <section className="task-summary-grid">
            <article className="task-summary-card">
              <span>全部</span>
              <strong>{stats.total}</strong>
            </article>

            <article className="task-summary-card">
              <span>待处理</span>
              <strong>{stats.pending}</strong>
            </article>

            <article className="task-summary-card">
              <span>执行中</span>
              <strong>{stats.running}</strong>
            </article>

            <article className="task-summary-card">
              <span>已完成</span>
              <strong>{stats.completed}</strong>
            </article>

            <article className="task-summary-card">
              <span>失败</span>
              <strong>{stats.failed}</strong>
            </article>
          </section>

          <div className="task-filter-tabs">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                className={`task-filter-button${
                  statusFilter === filter.value ? " active" : ""
                }`}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="task-loading">正在加载任务……</div>
          ) : taskList.items.length === 0 ? (
            <div className="task-empty">暂无符合条件的任务</div>
          ) : (
            <div className="task-list">
              {taskList.items.map((task) => (
                <div
                  key={task.id}
                  className={`task-row${
                    selectedTask?.id === task.id ? " active" : ""
                  }`}
                  onClick={() => handleSelectTask(task.id)}
                >
                  <span>{task.id}</span>
                  <span>{task.task_type}</span>
                  <span>{task.assigned_agent ?? "—"}</span>
                  <span className={`task-status ${task.status}`}>
                    {getStatusLabel(task.status)}
                  </span>
                  <span>{formatDateTime(task.created_at)}</span>
                  <span>{formatDateTime(task.completed_at)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="task-pagination-hint">
            当前显示 {taskList.pagination.returned} 条，共{" "}
            {taskList.pagination.filtered_total} 条
          </div>

          {(selectedTask || detailLoading || detailError) && (
            <div className="task-detail">
              <div className="panel-heading">
                <span>
                  任务详情
                  {selectedTask ? `：${selectedTask.id}` : ""}
                </span>
                <button onClick={handleCloseDetail}>关闭</button>
              </div>

              {detailLoading && (
                <div className="task-loading">正在加载详情……</div>
              )}

              {detailError && (
                <div className="task-error">{detailError}</div>
              )}

              {selectedTask && !detailLoading && (
                <>
                  <div className="task-detail-meta">
                    <span>任务类型：{selectedTask.task_type}</span>
                    <span>
                      执行 Agent：{selectedTask.assigned_agent ?? "—"}
                    </span>
                    <span>优先级：{selectedTask.priority}</span>
                    <span>
                      状态：{getStatusLabel(selectedTask.status)}
                    </span>
                    <span>
                      创建时间：{formatDateTime(selectedTask.created_at)}
                    </span>
                    <span>
                      开始时间：{formatDateTime(selectedTask.started_at)}
                    </span>
                    <span>
                      完成时间：
                      {formatDateTime(selectedTask.completed_at)}
                    </span>
                  </div>

                  <h4>Payload</h4>
                  <pre className="task-json">
                    {JSON.stringify(selectedTask.payload, null, 2)}
                  </pre>

                  <h4>Result</h4>
                  <pre className="task-json">
                    {selectedTask.result
                      ? JSON.stringify(selectedTask.result, null, 2)
                      : "—"}
                  </pre>

                  <h4>Error</h4>
                  <pre className="task-json">
                    {selectedTask.error ?? "—"}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default TaskCenter;
