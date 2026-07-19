import { useEffect, useState } from "react";

import Sidebar from "../components/layout/Sidebar";
import { getTaskAnalytics } from "../services/analyticsApi";

const RANGE_OPTIONS = [
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

const PRIORITY_LABELS = {
  urgent: "紧急",
  high: "高",
  normal: "普通",
  low: "低",
};

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

function formatPercent(ratio) {
  return `${Math.round((ratio ?? 0) * 100)}%`;
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) {
    return "暂无数据";
  }

  if (seconds < 60) {
    return `${seconds.toFixed(1)} 秒`;
  }

  return `${(seconds / 60).toFixed(1)} 分钟`;
}

function Analytics({ onNavigate = () => {} }) {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      try {
        const result = await getTaskAnalytics(range);

        if (cancelled) {
          return;
        }

        setData(result);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("数据分析加载失败：", err);
          setError(err.message || "数据分析加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAnalytics();

    const timer = window.setInterval(loadAnalytics, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [range]);

  const trend = data?.trend ?? [];
  const trendMax = Math.max(1, ...trend.map((point) => point.count));
  const byAgent = data?.by_agent ?? [];
  const byAgentMax = Math.max(1, ...byAgent.map((item) => item.total));
  const byPriority = data?.by_priority ?? [];
  const byPriorityMax = Math.max(1, ...byPriority.map((item) => item.total));

  return (
    <div className="dashboard-shell">
      <Sidebar
        activePage="analytics"
        onNavigate={onNavigate}
        statusLabel={error ? "数据分析异常" : "数据分析正常"}
        statusOk={!error}
      />

      <main className="dashboard-workspace task-workspace">
        <header className="workspace-header">
          <div>
            <h1>数据分析</h1>
            <p>基于 PostgreSQL 中真实任务记录的统计分析</p>
          </div>
        </header>

        <div className="task-scroll-area">
          {error && <div className="task-error">{error}</div>}

          <div className="task-filter-tabs">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`task-filter-button${
                  range === option.value ? " active" : ""
                }`}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {loading && !data ? (
            <div className="task-loading">正在加载数据分析……</div>
          ) : !data ? (
            <div className="task-empty">暂无数据</div>
          ) : (
            <>
              <section className="task-summary-grid">
                <article className="task-summary-card">
                  <span>范围内任务总数</span>
                  <strong>{data.totals.total}</strong>
                </article>
                <article className="task-summary-card">
                  <span>待处理</span>
                  <strong>{data.totals.pending}</strong>
                </article>
                <article className="task-summary-card">
                  <span>执行中</span>
                  <strong>{data.totals.running}</strong>
                </article>
                <article className="task-summary-card">
                  <span>已完成</span>
                  <strong>{data.totals.completed}</strong>
                </article>
                <article className="task-summary-card">
                  <span>失败</span>
                  <strong>{data.totals.failed}</strong>
                </article>
              </section>

              <section className="task-summary-grid">
                <article className="task-summary-card">
                  <span>完成率</span>
                  <strong>{formatPercent(data.completion_rate)}</strong>
                </article>
                <article className="task-summary-card">
                  <span>失败率</span>
                  <strong>{formatPercent(data.failure_rate)}</strong>
                </article>
                <article className="task-summary-card">
                  <span>今日新增</span>
                  <strong>{data.today_new_tasks}</strong>
                </article>
                <article className="task-summary-card">
                  <span>平均处理时长</span>
                  <strong className="analytics-duration-value">
                    {formatDuration(data.avg_duration_seconds)}
                  </strong>
                </article>
              </section>

              <article className="analytics-panel">
                <div className="panel-heading">
                  <span>近 7 天新增任务趋势</span>
                </div>

                {trend.length === 0 ? (
                  <div className="task-empty">暂无数据</div>
                ) : (
                  <div className="analytics-bar-chart">
                    {trend.map((point) => (
                      <div className="analytics-bar-column" key={point.date}>
                        <div className="analytics-bar-track">
                          <div
                            className="analytics-bar-fill"
                            style={{
                              height: `${(point.count / trendMax) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="analytics-bar-value">{point.count}</span>
                        <span className="analytics-bar-label">
                          {point.date.slice(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <div className="analytics-grid-two">
                <article className="analytics-panel">
                  <div className="panel-heading">
                    <span>按 AI 员工统计</span>
                  </div>

                  {byAgent.length === 0 ? (
                    <div className="task-empty">范围内暂无任务</div>
                  ) : (
                    <div className="analytics-hbar-list">
                      {byAgent.map((item) => (
                        <div className="analytics-hbar-row" key={item.agent}>
                          <span className="analytics-hbar-label">
                            {item.agent}
                          </span>
                          <div className="analytics-hbar-track">
                            <div
                              className="analytics-hbar-fill"
                              style={{
                                width: `${(item.total / byAgentMax) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="analytics-hbar-value">
                            {item.total}（成功 {item.completed} / 失败 {item.failed}）
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="analytics-panel">
                  <div className="panel-heading">
                    <span>按优先级统计</span>
                  </div>

                  {byPriority.length === 0 ? (
                    <div className="task-empty">范围内暂无任务</div>
                  ) : (
                    <div className="analytics-hbar-list">
                      {byPriority.map((item) => (
                        <div className="analytics-hbar-row" key={item.priority}>
                          <span className="analytics-hbar-label">
                            {PRIORITY_LABELS[item.priority] ?? item.priority}
                          </span>
                          <div className="analytics-hbar-track">
                            <div
                              className="analytics-hbar-fill"
                              style={{
                                width: `${(item.total / byPriorityMax) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="analytics-hbar-value">{item.total}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <article className="analytics-panel">
                <div className="panel-heading">
                  <span>最近失败任务</span>
                </div>

                {data.recent_failed_tasks.length === 0 ? (
                  <div className="task-empty">范围内暂无失败任务</div>
                ) : (
                  <div className="task-list">
                    {data.recent_failed_tasks.map((task) => (
                      <div className="task-row" key={task.id}>
                        <span>{task.id}</span>
                        <span>{task.task_type}</span>
                        <span>{task.assigned_agent ?? "—"}</span>
                        <span className="task-status failed">失败</span>
                        <span>{formatDateTime(task.created_at)}</span>
                        <span
                          className="analytics-failed-task-error"
                          title={task.safe_error}
                        >
                          {task.safe_error}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default Analytics;
