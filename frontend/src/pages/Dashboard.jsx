import { useEffect, useState } from "react";

import { getDeliverableStatusLabel, getDeliverableTypeLabel } from "../components/deliverables/deliverableLabels";
import Sidebar from "../components/layout/Sidebar";
import RuntimeStatusPanel from "../components/runtime/RuntimeStatusPanel";
import TaskSubmitPanel from "../components/tasks/TaskSubmitPanel";
import { getDashboardSummary } from "../services/api";
import { getTaskAnalytics } from "../services/analyticsApi";

function Dashboard({
  onNavigate = () => {},
  onNavigateToTask = () => {},
  onNavigateToDeliverable = () => {},
}) {
  const [submitPanelOpen, setSubmitPanelOpen] = useState(false);
  const [trend, setTrend] = useState([]);
  const [trendError, setTrendError] = useState(null);

  const [summary, setSummary] = useState({
    products: 0,
    listings: 0,
    inventories: 0,
    orders: 0,
    runtime: {
      running: false,
      status: "stopped",
      started_at: null,
      stopped_at: null,
    },
    agents: {
      total: 0,
      running: 0,
      idle: 0,
      stopped: 0,
      error: 0,
      items: [],
    },
    tasks: {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    },
    shops: {
      total: 0,
      active: 0,
      connected: 0,
      pending_configuration: 0,
      connector_not_implemented: 0,
    },
    deliverables: {
      pending_review: 0,
      approved: 0,
      recent: [],
    },
  });

  const today = new Date();

  const dateText = today.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });

  useEffect(() => {
    async function loadSummary() {
      try {
        const data = await getDashboardSummary();

        setSummary({
          products: data.products ?? 0,
          listings: data.listings ?? 0,
          inventories: data.inventories ?? 0,
          orders: data.orders ?? 0,
          runtime: {
            running: data.runtime?.running ?? false,
            status: data.runtime?.status ?? "stopped",
            started_at: data.runtime?.started_at ?? null,
            stopped_at: data.runtime?.stopped_at ?? null,
          },
          agents: {
            total: data.agents?.total ?? 0,
            running: data.agents?.running ?? 0,
            idle: data.agents?.idle ?? 0,
            stopped: data.agents?.stopped ?? 0,
            error: data.agents?.error ?? 0,
            items: Array.isArray(data.agents?.items)
              ? data.agents.items
              : [],
          },
          shops: {
            total: data.shops?.total ?? 0,
            active: data.shops?.active ?? 0,
            connected: data.shops?.connected ?? 0,
            pending_configuration: data.shops?.pending_configuration ?? 0,
            connector_not_implemented: data.shops?.connector_not_implemented ?? 0,
          },
          deliverables: {
            pending_review: data.deliverables?.pending_review ?? 0,
            approved: data.deliverables?.approved ?? 0,
            recent: Array.isArray(data.deliverables?.recent) ? data.deliverables.recent : [],
          },
          tasks: {
            total: data.tasks?.total ?? 0,
            pending: data.tasks?.pending ?? 0,
            running: data.tasks?.running ?? 0,
            completed: data.tasks?.completed ?? 0,
            failed: data.tasks?.failed ?? 0,
          },
        });
      } catch (error) {
        console.error("Dashboard 数据加载失败：", error);
      }
    }

    loadSummary();

    const timer = window.setInterval(loadSummary, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTrend() {
      try {
        const data = await getTaskAnalytics("7d");

        if (cancelled) {
          return;
        }

        setTrend(Array.isArray(data.trend) ? data.trend : []);
        setTrendError(null);
      } catch (error) {
        if (!cancelled) {
          console.error("任务趋势加载失败：", error);
          setTrendError(error.message || "任务趋势加载失败");
        }
      }
    }

    loadTrend();

    const timer = window.setInterval(loadTrend, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const runtimeRunning = summary.runtime.running;

  const trendMaxCount = Math.max(1, ...trend.map((point) => point.count));

  const trendPolylinePoints = trend
    .map((point, index) => {
      const x =
        trend.length > 1 ? (index / (trend.length - 1)) * 700 : 350;
      const y = 150 - (point.count / trendMaxCount) * 130;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  function formatTrendLabel(dateText) {
    const parts = dateText.split("-");
    return parts.length === 3 ? `${parts[1]}-${parts[2]}` : dateText;
  }

  function getAgentViewStatus(agentStatus) {
    switch (agentStatus) {
      case "running":
        return {
          label: "运行中",
          className: "running",
        };

      case "idle":
        return {
          label: "待机",
          className: "waiting",
        };

      case "stopped":
        return {
          label: "已停止",
          className: "waiting",
        };

      case "error":
        return {
          label: "异常",
          className: "waiting",
        };

      default:
        return {
          label: "未知",
          className: "waiting",
        };
    }
  }

  return (
    <div className="dashboard-shell">
      <Sidebar
        activePage="dashboard"
        onNavigate={onNavigate}
        statusLabel={runtimeRunning ? "AI CEO 在线" : "AI CEO 离线"}
        statusOk={runtimeRunning}
      />

      <main className="dashboard-workspace">
        <div className="task-submit-trigger-row">
          <button
            type="button"
            className="task-submit-trigger-button"
            onClick={() => setSubmitPanelOpen((current) => !current)}
            aria-expanded={submitPanelOpen}
          >
            {submitPanelOpen ? "收起提交任务 ▲" : "提交任务 ▼"}
          </button>
        </div>

        <TaskSubmitPanel
          open={submitPanelOpen}
          agents={summary.agents.items}
          runtimeRunning={runtimeRunning}
          onViewTask={onNavigateToTask}
        />

        <div className="dashboard-top-control-grid">
          <article className="welcome-card">
            <div className="welcome-date">
              <span>▢</span>
              {dateText}
            </div>

            <h1>上午好，立行 👋</h1>

            <p>
              {runtimeRunning
                ? "AI CEO 已就绪，为你提供智能决策与运营支持"
                : "RuntimeEngine 尚未启动，AI 员工当前处于待机状态"}
            </p>

            <span>聚焦产品、营销、服务与财务，驱动一人公司的高效增长。</span>
          </article>

          <RuntimeStatusPanel />
        </div>

        <section className="metric-grid">
          <article className="metric-card metric-card-not-integrated">
            <span>经营收入</span>
            <strong>尚未接入</strong>
            <small>暂无真实经营数据</small>
            <em>⌁</em>
          </article>

          <article className="metric-card">
            <span>订单数</span>
            <strong>{summary.orders}</strong>
            <small>实时数据库</small>
            <em>□</em>
          </article>

          <article className="metric-card">
            <span>待发布商品</span>
            <strong>{summary.listings}</strong>
            <small>等待处理</small>
            <em>◇</em>
          </article>

          <article className="metric-card">
            <span>产品数量</span>
            <strong>{summary.products}</strong>
            <small>实时数据库</small>
            <em>○</em>
          </article>

          <article className="metric-card">
            <span>运行中员工</span>
            <strong>
              {summary.agents.running}/{summary.agents.total}
            </strong>
            <small>{runtimeRunning ? "系统运行中" : "系统待机中"}</small>
            <em>▤</em>
          </article>
        </section>

        <section className="main-grid">
          <article className="ceo-command-card">
            <div className="ceo-command-copy">
              <span>
                {runtimeRunning ? "AI CEO 建议" : "AI CEO 当前离线"}
              </span>

              <h2>
                今天公司
                <br />
                应该做什么？
              </h2>

              <p>
                {runtimeRunning
                  ? "基于数据库和经营状态，AI CEO 为你生成今日关键任务。"
                  : "启动 RuntimeEngine 后，AI CEO 将开始生成经营建议。"}
              </p>

              <button type="button" onClick={() => onNavigate("tasks")}>
                {runtimeRunning ? "查看建议任务 →" : "等待系统启动"}
              </button>
            </div>

            <div className="ceo-analysis-card">
              <h3>今日任务分析</h3>

              <ul>
                <li>产品优化建议：{summary.products}</li>
                <li>待发布商品：{summary.listings}</li>
                <li>库存记录：{summary.inventories}</li>
                <li>当前订单：{summary.orders}</li>
              </ul>

              <div className="analysis-divider" />

              <h4>AI 建议</h4>

              {runtimeRunning ? (
                <>
                  <p>优化产品定价策略</p>
                  <p>加强社交媒体内容输出</p>
                  <p>跟进潜在客户回访</p>
                </>
              ) : (
                <>
                  <p>RuntimeEngine 当前未运行</p>
                  <p>AI 员工暂未开始执行任务</p>
                  <p>请先通过 Runtime API 启动系统</p>
                </>
              )}
            </div>
          </article>

          <article className="agents-card">
            <div className="panel-heading">
              <span>
                AI 员工（{summary.agents.running}/{summary.agents.total}）
              </span>

              <button type="button" onClick={() => onNavigate("agents")}>
                查看全部
              </button>
            </div>

            <div className="agents-list">
              {summary.agents.items.length > 0 ? (
                summary.agents.items.map((agent) => {
                  const viewStatus = getAgentViewStatus(agent.status);

                  return (
                    <div className="agent-item" key={agent.name}>
                      <div className="agent-avatar">
                        {agent.name.slice(0, 1)}
                      </div>

                      <div className="agent-information">
                        <strong>{agent.name}</strong>

                        <span>
                          {agent.current_task ||
                            agent.description ||
                            "等待新任务"}
                        </span>
                      </div>

                      <em className={viewStatus.className}>
                        {viewStatus.label}
                      </em>
                    </div>
                  );
                })
              ) : (
                <div className="agent-item">
                  <div className="agent-avatar">AI</div>

                  <div className="agent-information">
                    <strong>正在读取 AI 员工</strong>
                    <span>等待后端返回 Agent 状态</span>
                  </div>

                  <em className="waiting">加载中</em>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="shop-deliverable-summary-grid">
          <article className="metric-card">
            <span>已连接店铺</span>
            <strong>{summary.shops.connected}</strong>
            <small>共 {summary.shops.total} 个店铺</small>
            <em>⛛</em>
          </article>

          <article className="metric-card">
            <span>待配置店铺</span>
            <strong>{summary.shops.pending_configuration}</strong>
            <small>尚未填写凭据</small>
            <em>◇</em>
          </article>

          <article className="metric-card">
            <span>连接器未实现</span>
            <strong>{summary.shops.connector_not_implemented}</strong>
            <small>平台框架已就绪，尚未真实接入</small>
            <em>⚙</em>
          </article>

          <article className="metric-card">
            <span>待审核成果</span>
            <strong>{summary.deliverables.pending_review}</strong>
            <small>需要人工审核</small>
            <em>☑</em>
          </article>

          <article className="metric-card">
            <span>已批准成果</span>
            <strong>{summary.deliverables.approved}</strong>
            <small>已完成审核</small>
            <em>✔</em>
          </article>
        </section>

        <section className="main-grid">
          <article className="agents-card">
            <div className="panel-heading">
              <span>最近成果</span>
              <button type="button" onClick={() => onNavigate("deliverables")}>
                查看全部 →
              </button>
            </div>

            {summary.deliverables.recent.length === 0 ? (
              <div className="task-empty">
                尚无成果。AI 员工完成支持的任务后，成果会出现在成果中心。
              </div>
            ) : (
              <div className="agents-list">
                {summary.deliverables.recent.map((item) => (
                  <div
                    className="agent-item"
                    key={item.id}
                    onClick={() => onNavigateToDeliverable(item.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="agent-information">
                      <strong>{item.title}</strong>
                      <span>
                        {getDeliverableTypeLabel(item.deliverable_type)} ·{" "}
                        {getDeliverableStatusLabel(item.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="agents-card">
            <div className="panel-heading">
              <span>店铺范围</span>
              <button type="button" onClick={() => onNavigate("shops")}>
                店铺中心 →
              </button>
            </div>

            {summary.shops.total === 0 ? (
              <div className="task-empty">
                尚未添加店铺。完成平台注册后，可以在店铺中心添加店铺资料和授权信息。
              </div>
            ) : (
              <div className="reminder-item">
                <span>
                  共 {summary.shops.total} 个店铺，其中 {summary.shops.active} 个正常运行
                </span>
                <small>真实数据库统计</small>
              </div>
            )}
          </article>
        </section>

        <section className="lower-grid">
          <article className="trend-card">
            <div className="panel-heading">
              <span>近 7 天新增任务</span>
              <button type="button" onClick={() => onNavigate("analytics")}>
                查看数据分析 →
              </button>
            </div>

            {trendError ? (
              <div className="trend-empty">加载失败：{trendError}</div>
            ) : trend.length === 0 ? (
              <div className="trend-empty">暂无任务数据</div>
            ) : (
              <div className="trend-chart">
                <svg
                  viewBox="0 0 700 160"
                  preserveAspectRatio="none"
                  aria-label="近 7 天新增任务趋势"
                >
                  <polyline
                    points={trendPolylinePoints}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                </svg>

                <div className="trend-labels">
                  {trend.map((point) => (
                    <span key={point.date}>{formatTrendLabel(point.date)}</span>
                  ))}
                </div>
              </div>
            )}
          </article>

          <article className="reminders-card">
            <div className="panel-heading">
              <span>系统提醒</span>
            </div>

            <div className="reminder-item">
              <span>
                {runtimeRunning
                  ? `RuntimeEngine 正在运行，${summary.agents.running} 名员工在线`
                  : `RuntimeEngine 当前已停止，${summary.agents.idle} 名员工待机`}
              </span>

              <small>实时状态</small>
            </div>

            <div className="reminder-item">
              <span>
                待处理任务 {summary.tasks.pending} 个，执行中{" "}
                {summary.tasks.running} 个
              </span>
              <small>实时统计</small>
            </div>

            <div className="reminder-item">
              <span>
                已完成任务 {summary.tasks.completed} 个，失败{" "}
                {summary.tasks.failed} 个
              </span>
              <small>共 {summary.tasks.total} 个任务</small>
            </div>
          </article>

          <article className="quick-actions-card">
            <div className="panel-heading">
              <span>快捷操作</span>
            </div>

            <div className="quick-actions-grid">
              <button
                type="button"
                onClick={() => setSubmitPanelOpen(true)}
              >
                创建任务
              </button>
              <button type="button" onClick={() => onNavigate("shops")}>
                新增店铺
              </button>
              <button type="button" onClick={() => onNavigate("deliverables")}>
                查看成果
              </button>
              <button type="button" onClick={() => onNavigate("tasks")}>
                任务中心
              </button>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;