import { useEffect, useState } from "react";

import Sidebar from "../components/layout/Sidebar";
import TaskSubmitPanel from "../components/tasks/TaskSubmitPanel";
import { getAgents } from "../services/agentApi";
import { getTaskAnalytics } from "../services/analyticsApi";
import { getDashboardSummary, getTasks } from "../services/api";

const STATUS_LABELS = {
  running: "运行中",
  idle: "待机",
  stopped: "已停止",
  error: "异常",
};

const TASK_STATUS_LABELS = {
  pending: "待处理",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
};

function formatDateTime(value) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }

  return date.toLocaleString();
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] ?? "未知";
}

function Agents({ onNavigate = () => {}, onNavigateToTask = () => {} }) {
  const [agents, setAgents] = useState([]);
  const [statsByAgent, setStatsByAgent] = useState({});
  const [runtimeRunning, setRuntimeRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedAgentName, setSelectedAgentName] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [recentTasks, setRecentTasks] = useState([]);
  const [recentTasksLoading, setRecentTasksLoading] = useState(false);
  const [recentTasksError, setRecentTasksError] = useState(null);

  const [submitPanelOpen, setSubmitPanelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      try {
        const [agentsData, analyticsData, summaryData] = await Promise.all([
          getAgents(),
          getTaskAnalytics("30d"),
          getDashboardSummary(),
        ]);

        if (cancelled) {
          return;
        }

        setAgents(Array.isArray(agentsData.items) ? agentsData.items : []);

        const byAgent = {};
        for (const bucket of analyticsData.by_agent ?? []) {
          byAgent[bucket.agent] = bucket;
        }
        setStatsByAgent(byAgent);
        setRuntimeRunning(Boolean(summaryData.runtime?.running));
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("AI 员工数据加载失败：", err);
          setError(err.message || "AI 员工数据加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAgents();

    const timer = window.setInterval(loadAgents, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedAgentName || !drawerOpen) {
      return undefined;
    }

    let cancelled = false;

    async function loadRecentTasks() {
      setRecentTasksLoading(true);

      try {
        const data = await getTasks({
          assignedAgent: selectedAgentName,
          limit: 10,
          offset: 0,
        });

        if (cancelled) {
          return;
        }

        setRecentTasks(Array.isArray(data.items) ? data.items : []);
        setRecentTasksError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("最近任务加载失败：", err);
          setRecentTasksError(err.message || "最近任务加载失败");
        }
      } finally {
        if (!cancelled) {
          setRecentTasksLoading(false);
        }
      }
    }

    loadRecentTasks();

    return () => {
      cancelled = true;
    };
  }, [selectedAgentName, drawerOpen]);

  function handleSelectAgent(agentName) {
    setSelectedAgentName(agentName);
    setDrawerOpen(true);
    setSubmitPanelOpen(false);
    setRecentTasks([]);
    setRecentTasksError(null);
  }

  function handleCloseDrawer() {
    setDrawerOpen(false);
    setSubmitPanelOpen(false);
  }

  const total = agents.length;
  const runningCount = agents.filter((a) => a.status === "running").length;
  const idleCount = agents.filter((a) => a.status === "idle").length;
  const stoppedCount = agents.filter((a) => a.status === "stopped").length;
  const errorCount = agents.filter((a) => a.status === "error").length;

  const selectedAgent = agents.find((a) => a.name === selectedAgentName) ?? null;
  const selectedStats = selectedAgentName
    ? statsByAgent[selectedAgentName] ?? { total: 0, completed: 0, failed: 0 }
    : null;

  return (
    <div className="dashboard-shell">
      <Sidebar
        activePage="agents"
        onNavigate={onNavigate}
        statusLabel={error ? "AI 员工数据异常" : "AI 员工正常"}
        statusOk={!error}
      />

      <main className="dashboard-workspace task-workspace">
        <header className="workspace-header">
          <div>
            <h1>AI 员工</h1>
            <p>查看全部已注册 AI 员工的实时状态与任务执行统计</p>
          </div>
        </header>

        <div className="task-scroll-area">
          {error && <div className="task-error">{error}</div>}

          <section className="task-summary-grid">
            <article className="task-summary-card">
              <span>员工总数</span>
              <strong>{total}</strong>
            </article>
            <article className="task-summary-card">
              <span>运行中</span>
              <strong>{runningCount}</strong>
            </article>
            <article className="task-summary-card">
              <span>待机</span>
              <strong>{idleCount}</strong>
            </article>
            <article className="task-summary-card">
              <span>已停止</span>
              <strong>{stoppedCount}</strong>
            </article>
            <article className="task-summary-card">
              <span>异常</span>
              <strong>{errorCount}</strong>
            </article>
          </section>

          {loading ? (
            <div className="task-loading">正在加载 AI 员工……</div>
          ) : agents.length === 0 ? (
            <div className="task-empty">暂无已注册的 AI 员工</div>
          ) : (
            <div className="agent-grid-list">
              {agents.map((agent) => {
                const stats = statsByAgent[agent.name] ?? {
                  total: 0,
                  completed: 0,
                  failed: 0,
                };

                return (
                  <article
                    className="agent-grid-card"
                    key={agent.name}
                    onClick={() => handleSelectAgent(agent.name)}
                  >
                    <div className="agent-grid-card-header">
                      <div className="agent-avatar">
                        {agent.name.slice(0, 1)}
                      </div>
                      <div>
                        <strong>{agent.name}</strong>
                        <span>{agent.role}</span>
                      </div>
                      <em className={agent.status}>
                        {getStatusLabel(agent.status)}
                      </em>
                    </div>

                    <p className="agent-grid-card-description">
                      {agent.description}
                    </p>

                    <div className="agent-grid-card-stats">
                      <span>近 30 天已处理 {stats.total}</span>
                      <span>成功 {stats.completed}</span>
                      <span>失败 {stats.failed}</span>
                    </div>

                    <div className="agent-grid-card-footer">
                      最近活动：{formatDateTime(agent.last_run_at)}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {drawerOpen && selectedAgent && (
        <div className="task-drawer-overlay" onClick={handleCloseDrawer}>
          <aside
            className="task-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="AI 员工详情"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="task-drawer-header">
              <span>AI 员工详情</span>
              <button
                type="button"
                className="task-drawer-close"
                onClick={handleCloseDrawer}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            <div className="task-drawer-body">
              <div className="task-drawer-status-row">
                <span className={`task-drawer-status ${selectedAgent.status}`}>
                  {getStatusLabel(selectedAgent.status)}
                </span>
                <span className="task-drawer-id">{selectedAgent.name}</span>
              </div>

              <dl className="task-drawer-meta">
                <div>
                  <dt>职责</dt>
                  <dd>{selectedAgent.role || "—"}</dd>
                </div>
                <div>
                  <dt>能力范围</dt>
                  <dd>{selectedAgent.description || "—"}</dd>
                </div>
                <div>
                  <dt>当前任务</dt>
                  <dd>{selectedAgent.current_task || "—"}</dd>
                </div>
                <div>
                  <dt>最近活动时间</dt>
                  <dd>{formatDateTime(selectedAgent.last_run_at)}</dd>
                </div>
                <div>
                  <dt>最近错误</dt>
                  <dd>{selectedAgent.last_error || "暂无"}</dd>
                </div>
              </dl>

              <h4>近 30 天执行统计</h4>
              <dl className="task-drawer-meta">
                <div>
                  <dt>已处理任务</dt>
                  <dd>{selectedStats.total}</dd>
                </div>
                <div>
                  <dt>成功</dt>
                  <dd>{selectedStats.completed}</dd>
                </div>
                <div>
                  <dt>失败</dt>
                  <dd>{selectedStats.failed}</dd>
                </div>
              </dl>

              <h4>最近任务</h4>
              {recentTasksLoading ? (
                <p>正在加载最近任务…</p>
              ) : recentTasksError ? (
                <p>加载失败：{recentTasksError}</p>
              ) : recentTasks.length === 0 ? (
                <p>暂无任务记录</p>
              ) : (
                <div className="agent-recent-task-list">
                  {recentTasks.map((task) => (
                    <button
                      type="button"
                      key={task.id}
                      className="agent-recent-task-item"
                      onClick={() => onNavigateToTask(task.id)}
                    >
                      <span className={`task-status ${task.status}`}>
                        {TASK_STATUS_LABELS[task.status] ?? task.status}
                      </span>
                      <span>{task.task_type}</span>
                      <span>{formatDateTime(task.created_at)}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="agent-drawer-actions">
                <button
                  type="button"
                  className="task-submit-trigger-button"
                  onClick={() => setSubmitPanelOpen((v) => !v)}
                >
                  {submitPanelOpen ? "收起提交任务 ▲" : "为该员工创建任务 ▼"}
                </button>
              </div>

              <TaskSubmitPanel
                open={submitPanelOpen}
                agents={agents}
                initialAgent={selectedAgent.name}
                runtimeRunning={runtimeRunning}
                onViewTask={onNavigateToTask}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default Agents;
