import { useEffect, useMemo, useState } from "react";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getDashboardSummary, getTasks, getTaskStats } from "../../../services/api.js";
import { getRuntimeStatus } from "../../../services/runtimeApi.js";
import { safeCall } from "../../realDataSafe.js";
import { simulateLatency, nextMockId } from "../../mock/mockUtils.js";
import {
  QUICK_ACTIONS,
  getOperatingLoopBriefCards,
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
import { TextButton } from "../../kit/TextButton.jsx";
import { Input } from "../../kit/Input.jsx";
import { Icon } from "../../kit/Icon.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { ProgressBar } from "../../kit/ProgressBar.jsx";
import { Divider } from "../../kit/Divider.jsx";
import { AIRecommendation } from "../../kit/AIRecommendation.jsx";
import { AIRiskAlert } from "../../kit/AIRiskAlert.jsx";
import { ApprovalQueue } from "../../kit/ApprovalQueue.jsx";
import { ActivityFeed } from "../../kit/ActivityFeed.jsx";

const SEVERITY_TO_RISK = { danger: "high", warning: "medium", neutral: "low" };

/**
 * Decision Home pilot — Design DNA v1.0 (docs/01-foundation/design/).
 * Replaces the previous ten-section equal-weight stack with the
 * spec's required order: AI executive statement → decisions needing
 * action → exceptions/risks → execution status → business summary →
 * detail (moved to DashboardModule, the tab's "detail" sibling).
 * Chat remains available but is no longer the first/primary surface
 * (Design DNA Principle 6 — AI is not chat-box-only).
 */

function ExecutiveStatement({ statement, pendingCount, agentsRunning }) {
  return (
    <div style={{ marginBottom: "var(--space-32)" }}>
      <p className="fdr-type-display-section" style={{ margin: "0 0 var(--space-8)" }}>
        {statement}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-16)" }}>
        <span className="fdr-type-body-small" style={{ color: "var(--text-secondary)" }}>
          {pendingCount} 件事需要你决定 · {agentsRunning} 个 Agent 正在运行
        </span>
        <DemoBadge />
      </div>
    </div>
  );
}

function SectionHeading({ children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-12)" }}>
      <h2 className="fdr-type-heading-section" style={{ margin: 0 }}>{children}</h2>
      {action}
    </div>
  );
}

export function SecretaryModule() {
  const { navigate } = useConsoleNavContext();
  const [messages, setMessages] = useState(() => seedConversation());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const attentionItems = useMemo(() => seedAttentionItems(), []);
  const topPriorityItem = useMemo(() => pickTopPriorityItem(attentionItems), [attentionItems]);
  const [pendingApprovals, setPendingApprovals] = useState(() =>
    seedAttentionItems().filter((item) => item.type === "approval")
  );
  const [decidedCount, setDecidedCount] = useState(0);
  const todayHighlights = useMemo(() => seedTodayHighlights(), []);
  const operatingGoals = useMemo(() => seedOperatingGoals(), []);
  const recommendations = useMemo(() => seedAiRecommendations(), []);
  const crossSystemAlerts = useMemo(() => [...seedCrossSystemAlerts(), ...getOperatingLoopBriefCards()], []);

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

  function handleApprove(id) {
    setPendingApprovals((prev) => prev.filter((item) => item.id !== id));
    setDecidedCount((prev) => prev + 1);
  }

  function handleReject(id) {
    setPendingApprovals((prev) => prev.filter((item) => item.id !== id));
    setDecidedCount((prev) => prev + 1);
  }

  const runningItems = Array.isArray(runningTasks.data?.items)
    ? runningTasks.data.items
    : Array.isArray(runningTasks.data)
      ? runningTasks.data
      : [];

  const pendingDecisionCount = recommendations.length + pendingApprovals.length;
  const executiveStatement = messages[0]?.text ?? "早上好，Founder。";

  return (
    <div>
      <ExecutiveStatement
        statement={executiveStatement}
        pendingCount={pendingDecisionCount}
        agentsRunning={runtime.data?.agents?.running ?? 0}
      />

      {topPriorityItem ? (
        <div style={{ marginBottom: "var(--space-24)" }}>
          <AIRiskAlert
            level={SEVERITY_TO_RISK[topPriorityItem.severity] ?? "low"}
            concern={topPriorityItem.label}
          />
          <TextButton style={{ marginLeft: "var(--space-12)" }} onClick={() => navigate(topPriorityItem.targetModule)}>
            立即处理
          </TextButton>
        </div>
      ) : null}

      <SectionHeading>决策 — AI 建议</SectionHeading>
      <div style={{ marginBottom: "var(--space-32)" }}>
        {recommendations.map((rec) => (
          <AIRecommendation
            key={rec.id}
            title={`${getRecommendationTypeLabel(rec.type)} · ${rec.store}`}
            reason={`${rec.reason} 建议：${rec.suggestedAction}`}
            priority={rec.priority}
            action={{ label: rec.actionLabel, onClick: () => navigate(rec.targetModule, { subView: rec.targetSubView }) }}
          />
        ))}
      </div>

      <SectionHeading action={decidedCount > 0 ? <span className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>已处理 {decidedCount} 项</span> : null}>
        需要我审批
      </SectionHeading>
      <div style={{ marginBottom: "var(--space-32)" }}>
        <ApprovalQueue
          items={pendingApprovals.map((item) => ({ id: item.id, title: "审批请求", reason: item.label }))}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      </div>

      <SectionHeading>执行状态</SectionHeading>
      <div className="fdr-card" style={{ marginBottom: "var(--space-32)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-16)", flexWrap: "wrap", marginBottom: "var(--space-12)" }}>
          {runtime.connected ? (
            <StatusPill tone={runtime.data?.running ? "success" : "neutral"}>
              {runtime.data?.running ? "系统运行中" : "系统待机"}
            </StatusPill>
          ) : (
            <StatusPill tone="neutral">运行状态尚未接入</StatusPill>
          )}
          {taskStats.data?.pending != null ? (
            <span className="fdr-type-body-small" style={{ color: "var(--text-secondary)" }}>
              {taskStats.data.pending} 个任务待执行
            </span>
          ) : null}
        </div>
        {!runningTasks.connected ? (
          <EmptyState message="任务数据尚未接入" />
        ) : runningItems.length === 0 ? (
          <EmptyState message="当前没有正在运行的任务" />
        ) : (
          <ActivityFeed
            items={runningItems.map((task) => ({
              title: `${task.assigned_agent ?? "Agent"} · ${task.task_type ?? task.id}`,
              status: "info",
              statusLabel: "运行中",
            }))}
          />
        )}
      </div>

      <SectionHeading action={<DemoBadge />}>业务概况</SectionHeading>
      <div className="fdr-card" style={{ marginBottom: "var(--space-32)" }}>
        <p className="fdr-type-body" style={{ margin: "0 0 var(--space-16)" }}>{todayHighlights.summary}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "var(--space-20)" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }} className="fdr-type-body-small">
              <span>今日 GMV 目标</span>
              <strong className="fdr-tabular-num">¥{operatingGoals.gmvCurrent.toLocaleString()} / ¥{operatingGoals.gmvTarget.toLocaleString()}</strong>
            </div>
            <ProgressBar value={operatingGoals.gmvCurrent} max={operatingGoals.gmvTarget} tone="success" label={`${Math.round((operatingGoals.gmvCurrent / operatingGoals.gmvTarget) * 100)}%`} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }} className="fdr-type-body-small">
              <span>今日订单目标</span>
              <strong className="fdr-tabular-num">{operatingGoals.orderCurrent} / {operatingGoals.orderTarget}</strong>
            </div>
            <ProgressBar value={operatingGoals.orderCurrent} max={operatingGoals.orderTarget} tone="primary" label={`${Math.round((operatingGoals.orderCurrent / operatingGoals.orderTarget) * 100)}%`} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }} className="fdr-type-body-small">
              <span>广告预算</span>
              <strong className="fdr-tabular-num">¥{operatingGoals.adSpend.toLocaleString()} / ¥{operatingGoals.adBudget.toLocaleString()}</strong>
            </div>
            <ProgressBar value={operatingGoals.adSpend} max={operatingGoals.adBudget} tone="warning" label={`剩 ¥${(operatingGoals.adBudget - operatingGoals.adSpend).toLocaleString()}`} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }} className="fdr-type-body-small">
              <span>Token 预算</span>
              <strong className="fdr-tabular-num">{operatingGoals.tokenSpend.toLocaleString()} / {operatingGoals.tokenBudget.toLocaleString()}</strong>
            </div>
            <ProgressBar
              value={operatingGoals.tokenSpend}
              max={operatingGoals.tokenBudget}
              tone={operatingGoals.tokenBudget - operatingGoals.tokenSpend < 2000 ? "danger" : "primary"}
              label={`剩 ${(operatingGoals.tokenBudget - operatingGoals.tokenSpend).toLocaleString()}`}
            />
          </div>
        </div>
        <Divider />
        <div style={{ display: "flex", gap: "var(--space-20)", flexWrap: "wrap" }} className="fdr-type-body-small">
          <span style={{ color: "var(--success)" }}>完成 {todayHighlights.completedTasks} 个任务</span>
          <span style={{ color: "var(--danger)" }}>失败 {todayHighlights.failedTasks} 个任务</span>
          <span style={{ color: "var(--text-secondary)" }}>新增 {todayHighlights.newDeliverables} 份成果</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-8)", marginTop: "var(--space-16)" }}>
          {crossSystemAlerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              className="fdr-btn fdr-btn--secondary fdr-btn--sm"
              onClick={() => navigate(alert.targetModule, { subView: alert.targetSubView, entityId: alert.targetEntityId })}
            >
              {alert.label}
            </button>
          ))}
        </div>
        <p className="fdr-type-caption" style={{ color: "var(--text-tertiary)", marginTop: "var(--space-12)" }}>
          详细指标见「今日经营」标签页 · 商品数 {dashboard.connected ? dashboard.data?.products ?? "—" : "未接入"}
        </p>
      </div>

      <div className="fdr-card">
        <button
          type="button"
          onClick={() => setChatOpen((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <Icon name="MessageSquareText" size={18} />
          <span className="fdr-type-heading-card" style={{ flex: 1, textAlign: "left" }}>和 AI 秘书说点什么</span>
          <Icon name={chatOpen ? "ChevronUp" : "ChevronDown"} size={16} />
        </button>
        {chatOpen ? (
          <div style={{ marginTop: "var(--space-16)" }}>
            <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    background: message.role === "user" ? "var(--action-primary)" : "var(--canvas-subtle)",
                    color: message.role === "user" ? "var(--text-inverse)" : "var(--text-primary)",
                    borderRadius: "var(--radius-md)",
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
              {sending ? <div className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>AI 秘书正在输入…</div> : null}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleSend(input);
              }}
              style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-end" }}
            >
              <div style={{ flex: 1 }}>
                <Input
                  label=""
                  placeholder="例如：我要发布一个新商品 / 给我今天的报告"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" disabled={sending}>发送</Button>
            </form>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {QUICK_ACTIONS.map((action) => (
                <Button key={action.id} size="sm" variant="secondary" onClick={() => handleSend(action.label, action.targetModule)}>
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
