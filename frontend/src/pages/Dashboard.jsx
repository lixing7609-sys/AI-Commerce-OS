import { useEffect, useState } from "react";

import RuntimeStatusPanel from "../components/runtime/RuntimeStatusPanel";
import { getDashboardSummary } from "../services/api";

function Dashboard({ onNavigate = () => {} }) {
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

  const runtimeRunning = summary.runtime.running;

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
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">☀</span>
          <strong>AI CEO</strong>
        </div>

        <nav className="sidebar-navigation">
          <button className="sidebar-link active">
            <span>⌂</span>
            首页
          </button>

          <button className="sidebar-link">
            <span>◎</span>
            运营概览
          </button>

          <button className="sidebar-link">
            <span>♙</span>
            AI 员工
          </button>

          <button
            className="sidebar-link"
            onClick={() => onNavigate("tasks")}
          >
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
                background: runtimeRunning ? "#26b85d" : "#a7a8ad",
              }}
            />

            {runtimeRunning ? "AI CEO 在线" : "AI CEO 离线"}
          </div>

          <div className="account-plan">
            <span>一人公司</span>
            <small>专业版</small>
          </div>
        </div>
      </aside>

      <main className="dashboard-workspace">
        <header className="workspace-header">
          <div>
            <h1>上午好，立行 👋</h1>

            <p>
              {runtimeRunning
                ? "AI CEO 已就绪，为你提供智能决策与运营支持"
                : "RuntimeEngine 尚未启动，AI 员工当前处于待机状态"}
            </p>

            <span>
              聚焦产品、营销、服务、财务，打造一人公司的高效增长引擎。
            </span>
          </div>

          <div className="workspace-date">
            <span>▢</span>
            {dateText}
          </div>
        </header>

        <RuntimeStatusPanel />

        <section className="metric-grid">
          <article className="metric-card">
            <span>今日收入</span>
            <strong>¥186,000</strong>
            <small>较昨日 +18%</small>
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

              <button>
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

              <button>查看全部</button>
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

        <section className="lower-grid">
          <article className="trend-card">
            <div className="panel-heading">
              <span>关键数据趋势</span>
              <button>近 7 天⌄</button>
            </div>

            <div className="trend-chart">
              <svg
                viewBox="0 0 700 160"
                preserveAspectRatio="none"
                aria-label="关键数据趋势"
              >
                <polyline
                  points="0,135 90,58 180,73 270,55 360,45 450,36 540,25 620,16 700,48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                />
              </svg>

              <div className="trend-labels">
                <span>07-11</span>
                <span>07-12</span>
                <span>07-13</span>
                <span>07-14</span>
                <span>07-15</span>
                <span>07-16</span>
                <span>07-17</span>
              </div>
            </div>
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
              <button>创建任务</button>
              <button>添加客户</button>
              <button>录入收入</button>
              <button>生成报告</button>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;