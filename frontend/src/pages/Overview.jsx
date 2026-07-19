import { useEffect, useState } from "react";

import Sidebar from "../components/layout/Sidebar";
import RuntimeStatusPanel from "../components/runtime/RuntimeStatusPanel";
import { getDashboardSummary } from "../services/api";
import { getTaskAnalytics } from "../services/analyticsApi";

const EMPTY_SUMMARY = {
  runtime: { running: false },
  agents: { total: 0, running: 0, idle: 0, stopped: 0, error: 0 },
  tasks: { total: 0, pending: 0, running: 0, completed: 0, failed: 0 },
};

function Overview({ onNavigate = () => {} }) {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [todayNewTasks, setTodayNewTasks] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [summaryData, analyticsData] = await Promise.all([
          getDashboardSummary(),
          getTaskAnalytics("today"),
        ]);

        if (cancelled) {
          return;
        }

        setSummary({
          runtime: {
            running: summaryData.runtime?.running ?? false,
          },
          agents: {
            total: summaryData.agents?.total ?? 0,
            running: summaryData.agents?.running ?? 0,
            idle: summaryData.agents?.idle ?? 0,
            stopped: summaryData.agents?.stopped ?? 0,
            error: summaryData.agents?.error ?? 0,
          },
          tasks: {
            total: summaryData.tasks?.total ?? 0,
            pending: summaryData.tasks?.pending ?? 0,
            running: summaryData.tasks?.running ?? 0,
            completed: summaryData.tasks?.completed ?? 0,
            failed: summaryData.tasks?.failed ?? 0,
          },
        });
        setTodayNewTasks(analyticsData.today_new_tasks ?? 0);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("运营概览数据加载失败：", err);
          setError(err.message || "运营概览数据加载失败");
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
  }, []);

  const runtimeRunning = summary.runtime.running;

  return (
    <div className="dashboard-shell">
      <Sidebar
        activePage="overview"
        onNavigate={onNavigate}
        statusLabel={error ? "运营数据异常" : "运营概览正常"}
        statusOk={!error}
      />

      <main className="dashboard-workspace task-workspace">
        <header className="workspace-header">
          <div>
            <h1>运营概览</h1>
            <p>基于真实 Task / Agent / Runtime 数据的经营运行状态</p>
          </div>
        </header>

        <div className="task-scroll-area">
          {error && <div className="task-error">{error}</div>}

          <RuntimeStatusPanel />

          {loading ? (
            <div className="task-loading">正在加载运营数据……</div>
          ) : (
            <>
              <section className="task-summary-grid">
                <article className="task-summary-card">
                  <span>今日新增任务</span>
                  <strong>{todayNewTasks ?? 0}</strong>
                </article>

                <article className="task-summary-card">
                  <span>待处理任务</span>
                  <strong>{summary.tasks.pending}</strong>
                </article>

                <article className="task-summary-card">
                  <span>执行中任务</span>
                  <strong>{summary.tasks.running}</strong>
                </article>

                <article className="task-summary-card">
                  <span>已完成任务</span>
                  <strong>{summary.tasks.completed}</strong>
                </article>

                <article className="task-summary-card">
                  <span>失败任务</span>
                  <strong>{summary.tasks.failed}</strong>
                </article>
              </section>

              <section className="task-summary-grid">
                <article className="task-summary-card">
                  <span>AI 员工总数</span>
                  <strong>{summary.agents.total}</strong>
                </article>

                <article className="task-summary-card">
                  <span>运行中</span>
                  <strong>{summary.agents.running}</strong>
                </article>

                <article className="task-summary-card">
                  <span>待机</span>
                  <strong>{summary.agents.idle}</strong>
                </article>

                <article className="task-summary-card">
                  <span>已停止</span>
                  <strong>{summary.agents.stopped}</strong>
                </article>

                <article className="task-summary-card">
                  <span>异常</span>
                  <strong>{summary.agents.error}</strong>
                </article>
              </section>

              <div className="overview-shortcut-row">
                <button type="button" onClick={() => onNavigate("agents")}>
                  查看 AI 员工详情 →
                </button>
                <button type="button" onClick={() => onNavigate("tasks")}>
                  查看任务中心 →
                </button>
                <button type="button" onClick={() => onNavigate("analytics")}>
                  查看数据分析 →
                </button>
              </div>

              <p className="overview-hint">
                {runtimeRunning
                  ? "RuntimeEngine 正在运行，以上数据每 5 秒自动刷新。"
                  : "RuntimeEngine 当前已停止，AI 员工处于待机状态。"}
                当前无真实订单/收入/客户数据接入，相关经营指标以"尚未接入"呈现，不在此页面展示虚构数字。
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default Overview;
