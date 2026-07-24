import { useEffect, useMemo, useState } from "react";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getDashboardSummary, getTasks, getTaskStats } from "../../../services/api.js";
import { getRuntimeStatus } from "../../../services/runtimeApi.js";
import { safeCall } from "../../realDataSafe.js";
import { simulateLatency, nextMockId } from "../../mock/mockUtils.js";
import {
  QUICK_ACTIONS,
  getRecommendationTypeLabel,
  matchReply,
  pickTopPriorityItem,
  seedAiRecommendations,
  seedAttentionItems,
  seedConversation,
  seedCrossSystemAlerts,
  seedOperatingGoals,
  seedTodayHighlights,
} from "../../mock/secretaryMock.js";
import { getModuleConfig } from "../../nav/navConfig.js";
import { Button } from "../../kit/Button.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { ProgressBar } from "../../kit/ProgressBar.jsx";

const SEVERITY_TONE = { danger: "danger", warning: "warning", neutral: "neutral" };

function OperatingState({ runtime, taskStats }) {
  const running = runtime.data?.running;
  const agentsRunning = runtime.data?.agents?.running ?? 0;
  const pendingTasks = taskStats.data?.pending ?? taskStats.data?.by_status?.pending ?? null;

  return (
    <div className="fdr-card" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      {runtime.connected ? (
        <StatusPill tone={running ? "success" : "neutral"}>
          {running ? "系统运行中" : "系统待机"}
        </StatusPill>
      ) : (
        <StatusPill tone="neutral">运行状态尚未接入</StatusPill>
      )}
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {agentsRunning} 个 Agent 正在运行
      </span>
      {pendingTasks !== null ? (
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {pendingTasks} 个任务待执行
        </span>
      ) : null}
    </div>
  );
}

export function SecretaryModule() {
  const { navigate } = useConsoleNavContext();
  const [messages, setMessages] = useState(() => seedConversation());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const attentionItems = useMemo(() => seedAttentionItems(), []);
  const topPriorityItem = useMemo(() => pickTopPriorityItem(attentionItems), [attentionItems]);
  const approvalItems = useMemo(
    () => attentionItems.filter((item) => item.type === "approval"),
    [attentionItems]
  );
  const todayHighlights = useMemo(() => seedTodayHighlights(), []);
  const operatingGoals = useMemo(() => seedOperatingGoals(), []);
  const recommendations = useMemo(() => seedAiRecommendations(), []);
  const crossSystemAlerts = useMemo(() => seedCrossSystemAlerts(), []);

  const [runtime, setRuntime] = useState({ connected: false, data: null });
  const [taskStats, setTaskStats] = useState({ connected: false, data: null });
  const [runningTasks, setRunningTasks] = useState({ connected: false, data: null });
  const [dashboard, setDashboard] = useState({ connected: false, data: null });

  useEffect(() => {
    safeCall(getRuntimeStatus).then(setRuntime);
    safeCall(getTaskStats).then(setTaskStats);
    safeCall(() => getTasks({ status: "running", limit: 5 })).then(setRunningTasks);
    safeCall(getDashboardSummary).then(setDashboard);
  }, []);

  async function handleSend(text, targetModuleOverride) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: nextMockId("msg"), role: "user", text: trimmed, timestamp: new Date().toISOString(), is_demo: true },
    ]);

    const { reply, targetModule } = matchReply(trimmed);
    await simulateLatency();

    setMessages((prev) => [
      ...prev,
      {
        id: nextMockId("msg"),
        role: "assistant",
        text: reply,
        timestamp: new Date().toISOString(),
        relatedModule: targetModuleOverride ?? targetModule,
        is_demo: true,
      },
    ]);
    setSending(false);
  }

  const runningItems = Array.isArray(runningTasks.data?.items)
    ? runningTasks.data.items
    : Array.isArray(runningTasks.data)
      ? runningTasks.data
      : [];

  return (
    <div>
      {/* 1. 指令输入 —— 页面顶部，永远可见 */}
      <div className="fdr-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>和 AI 秘书说点什么</h3>
          <DemoBadge />
        </div>
        <div
          style={{
            maxHeight: 220,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                background: message.role === "user" ? "var(--primary)" : "var(--bg)",
                color: message.role === "user" ? "#fff" : "var(--text)",
                borderRadius: 12,
                padding: "8px 12px",
                fontSize: 13,
              }}
            >
              {message.text}
              {message.relatedModule ? (
                <div style={{ marginTop: 6 }}>
                  <Button size="sm" variant="secondary" onClick={() => navigate(message.relatedModule)}>
                    前往{getModuleConfig(message.relatedModule)?.label ?? message.relatedModule} →
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {sending ? (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>AI 秘书正在输入…</div>
          ) : null}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSend(input);
          }}
          style={{ display: "flex", gap: 8, marginBottom: 10 }}
        >
          <input
            className="fdr-input"
            placeholder="例如：我要发布一个新商品 / 给我今天的报告"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={sending}>
            发送
          </Button>
        </form>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant="secondary"
              onClick={() => handleSend(action.label, action.targetModule)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 2. 当前运营状态 —— 一行 */}
      <OperatingState runtime={runtime} taskStats={taskStats} />

      {/* 3. 经营目标 —— 回答"今天经营目标完成了多少？"，跨全部店铺
          汇总，四组目标各自展示当前值/目标值与完成度进度条 */}
      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>经营目标（全部店铺汇总）</h3>
          <DemoBadge />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20, marginTop: 10 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span>今日 GMV 目标</span>
              <strong>¥{operatingGoals.gmvCurrent.toLocaleString()} / ¥{operatingGoals.gmvTarget.toLocaleString()}</strong>
            </div>
            <ProgressBar
              value={operatingGoals.gmvCurrent}
              max={operatingGoals.gmvTarget}
              tone="success"
              label={`${Math.round((operatingGoals.gmvCurrent / operatingGoals.gmvTarget) * 100)}%`}
            />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span>今日订单目标</span>
              <strong>{operatingGoals.orderCurrent} / {operatingGoals.orderTarget}</strong>
            </div>
            <ProgressBar
              value={operatingGoals.orderCurrent}
              max={operatingGoals.orderTarget}
              tone="primary"
              label={`${Math.round((operatingGoals.orderCurrent / operatingGoals.orderTarget) * 100)}%`}
            />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span>广告预算</span>
              <strong>¥{operatingGoals.adSpend.toLocaleString()} / ¥{operatingGoals.adBudget.toLocaleString()}</strong>
            </div>
            <ProgressBar
              value={operatingGoals.adSpend}
              max={operatingGoals.adBudget}
              tone="warning"
              label={`剩 ¥${(operatingGoals.adBudget - operatingGoals.adSpend).toLocaleString()}`}
            />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span>Token 预算</span>
              <strong>{operatingGoals.tokenSpend.toLocaleString()} / {operatingGoals.tokenBudget.toLocaleString()}</strong>
            </div>
            <ProgressBar
              value={operatingGoals.tokenSpend}
              max={operatingGoals.tokenBudget}
              tone={operatingGoals.tokenBudget - operatingGoals.tokenSpend < 2000 ? "danger" : "primary"}
              label={`剩 ${(operatingGoals.tokenBudget - operatingGoals.tokenSpend).toLocaleString()}`}
            />
          </div>
        </div>
      </div>

      {/* 4. 今天发生了什么 */}
      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>今天发生了什么</h3>
          <DemoBadge />
        </div>
        <p style={{ fontSize: 13, margin: "8px 0 0 0" }}>{todayHighlights.summary}</p>
        <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
          <span>✓ 完成 {todayHighlights.completedTasks} 个任务</span>
          <span>✕ 失败 {todayHighlights.failedTasks} 个任务</span>
          <span>✎ 新增 {todayHighlights.newDeliverables} 份成果</span>
        </div>
      </div>

      {/* 4. 今天最大的风险 + 首要处理事项 —— 同一条最高优先级事项的
          两种问法，避免维护两份互相矛盾的列表 */}
      <div
        className="fdr-card"
        style={{
          marginTop: 16,
          borderColor: topPriorityItem?.severity === "danger" ? "var(--danger)" : undefined,
          background: topPriorityItem?.severity === "danger" ? "rgba(239,68,68,.06)" : undefined,
        }}
      >
        <h3 className="fdr-card__title">今天最大的风险 / 首要处理事项</h3>
        {topPriorityItem ? (
          <div
            onClick={() => navigate(topPriorityItem.targetModule)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          >
            <span style={{ fontSize: 14 }}>{topPriorityItem.label}</span>
            <StatusPill tone={SEVERITY_TONE[topPriorityItem.severity] ?? "neutral"}>立即处理</StatusPill>
          </div>
        ) : (
          <EmptyState icon="✓" message="今天没有需要优先处理的风险" />
        )}
      </div>

      {/* 内容 / 直播 / 售后新经营闭环提醒（阶段 Founder UX Review
          V4）——独立于下方"AI建议"列表的简短跨系统提醒卡片 */}
      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>内容 / 直播 / 售后提醒</h3>
          <DemoBadge />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {crossSystemAlerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              className="fdr-btn fdr-btn--secondary"
              style={{ fontSize: 12 }}
              onClick={() => navigate(alert.targetModule, { subView: alert.targetSubView })}
            >
              {alert.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI 建议 —— 回答"AI建议我现在做什么？"，按优先级排序，每条
          都包含店铺/原因/建议动作，并提供直达处理入口的按钮 */}
      <div className="fdr-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>AI 建议</h3>
          <DemoBadge />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 10,
                background: "var(--bg)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <StatusPill tone={rec.priority === "P0" ? "danger" : rec.priority === "P1" ? "warning" : "neutral"}>
                    {rec.priority}
                  </StatusPill>
                  <strong style={{ fontSize: 13 }}>{getRecommendationTypeLabel(rec.type)}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>· {rec.store}</span>
                </div>
                <p style={{ fontSize: 13, margin: "0 0 4px 0" }}>{rec.reason}</p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>建议：{rec.suggestedAction}</p>
              </div>
              <Button size="sm" variant="primary" onClick={() => navigate(rec.targetModule)}>
                {rec.actionLabel}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 需要我审批 */}
      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 className="fdr-card__title">需要我审批</h3>
        {approvalItems.length === 0 ? (
          <EmptyState icon="✓" message="当前没有待审批事项" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {approvalItems.map((item) => (
              <div
                key={item.id}
                onClick={() => navigate("approvalCenter")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--bg)",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 13 }}>{item.label}</span>
                <StatusPill tone={SEVERITY_TONE[item.severity] ?? "neutral"}>去审批</StatusPill>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. AI 正在做什么 */}
      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 className="fdr-card__title">AI 正在做什么</h3>
        {!runningTasks.connected ? (
          <EmptyState icon="○" message="任务数据尚未接入" />
        ) : runningItems.length === 0 ? (
          <EmptyState icon="○" message="当前没有正在运行的任务" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runningItems.map((task) => (
              <div
                key={task.id}
                onClick={() => navigate("agentStudio", { entityId: task.assigned_agent })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--bg)",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <span>{task.assigned_agent ?? "Agent"} · {task.task_type ?? task.id}</span>
                <StatusPill tone="info">运行中</StatusPill>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 7. 今日营收 / 广告花费 / Token 消耗 */}
      <div style={{ marginTop: 16 }}>
        <h3 className="fdr-card__title">今日营收 · 广告花费 · Token 消耗</h3>
        <StatGrid>
          <StatCard label="今日营收（演示）" value="¥ 12,480" onClick={() => navigate("dashboard")} />
          <StatCard label="今日广告花费（演示）" value="¥ 640" onClick={() => navigate("adCenter")} />
          <StatCard label="今日 Token 消耗（演示）" value="8,760" onClick={() => navigate("tokenCenter")} />
          <StatCard
            label="任务总数"
            value={taskStats.connected ? taskStats.data?.total ?? "—" : "未接入"}
            onClick={() => navigate("dashboard")}
          />
          <StatCard
            label="商品数"
            value={dashboard.connected ? dashboard.data?.products ?? "—" : "未接入"}
            onClick={() => navigate("productCenter")}
          />
        </StatGrid>
      </div>
    </div>
  );
}
