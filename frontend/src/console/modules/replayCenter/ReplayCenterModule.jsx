import { useMemo } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getAllAgentConfigs } from "../../mock/agentStudioMock.js";
import { getOrCreateReplay, getBusinessChainRun, listBusinessChainRuns } from "../../mock/replayMock.js";

const STEP_TONE = { prompt: "info", tool_call: "warning", model_response: "success" };

const REPLAY_TABS = [
  { key: "agent", label: "Agent 运行回放" },
  { key: "loop", label: "经营闭环回放" },
];

/**
 * 经营闭环回放详情——阶段 Founder V4.3：把"店铺/商品选择 → 内容
 * 生成 → 检查 → 审批 → 发布 → 流量 → 订单 → 客服 → 复盘 → 知识候选"
 * 这条跨模块事件链完整重放出来。回放中心只是审计/诊断入口，这里
 * 只读展示事件，不提供从回放里直接修改业务数据的能力。
 */
function BusinessChainDetail({ runId, onBack }) {
  const run = getBusinessChainRun(runId);

  if (!run || run.events.length === 0) {
    return (
      <div>
        <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回经营闭环回放列表</button>
        <div className="fdr-card">
          <EmptyState icon="↻" message="该经营闭环还没有产生任何事件——从内容中心的内容项目详情页点击「生成内容方案」开始" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回经营闭环回放列表</button>
      <PageHeader title={`经营闭环回放：${runId}`} subtitle="按事件发生顺序完整重放跨模块执行链" actions={<DemoBadge />} />
      <div className="fdr-card">
        {run.events.map((event, idx) => (
          <div key={event.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: idx < run.events.length - 1 ? "1px solid var(--border)" : "none" }}>
            <StatusPill tone="info">{event.module ?? "—"}</StatusPill>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{event.outputSummary ?? event.businessObject}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {new Date(event.time).toLocaleString("zh-CN")} · 执行者：{event.actor ?? "—"}
                {event.agent ? ` · Agent：${event.agent}` : ""}
              </div>
              {event.previousState || event.newState ? (
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  状态：{event.previousState ?? "—"} → {event.newState ?? "—"}
                </div>
              ) : null}
              {event.inputSummary ? <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>输入：{event.inputSummary}</div> : null}
              {event.model ? (
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  模型：{event.model}{event.tokenUsage ? ` · Token：${event.tokenUsage}` : ""}
                  {event.promptVersion ? ` · Prompt：${event.promptVersion}` : ""}
                  {event.skillVersion ? ` · Skill：${event.skillVersion}` : ""}
                </div>
              ) : null}
              {event.knowledgeRefs?.length ? (
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Knowledge 引用：{event.knowledgeRefs.join("、")}</div>
              ) : null}
              {event.approvalDecision ? <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>审批决策：{event.approvalDecision}</div> : null}
              {event.businessObject ? <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>业务对象：{event.businessObject}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReplayCenterModule() {
  const { subView, entityId, navigate } = useConsoleNavContext();
  const activeTab = subView === "loop" ? "loop" : "agent";

  const allRuns = useMemo(() => {
    const configs = getAllAgentConfigs();
    return Object.entries(configs).flatMap(([agentName, config]) =>
      config.runHistory.map((run) => ({ ...run, agentName }))
    );
  }, []);

  if (activeTab === "loop") {
    if (entityId) {
      return <BusinessChainDetail runId={entityId} onBack={() => navigate("replayCenter", { subView: "loop" })} />;
    }
    const businessRuns = listBusinessChainRuns();
    return (
      <div>
        <PageHeader title="回放中心" subtitle="回放历史 Agent 运行与跨模块经营闭环，均不影响生产数据" actions={<DemoBadge />} />
        <Tabs tabs={REPLAY_TABS} activeTab={activeTab} onChange={(t) => navigate("replayCenter", { subView: t === "agent" ? undefined : t })} />
        <div className="fdr-card">
          <DataTable
            columns={[
              { key: "runId", label: "闭环 ID" },
              { key: "events", label: "事件数", render: (r) => r.events.length },
              { key: "latest", label: "最近事件时间", render: (r) => (r.events.length ? new Date(r.events[r.events.length - 1].time).toLocaleString("zh-CN") : "—") },
            ]}
            rows={businessRuns}
            onRowClick={(row) => navigate("replayCenter", { subView: "loop", entityId: row.runId })}
            emptyMessage={<EmptyState icon="↻" message="暂无经营闭环回放记录——从内容中心发起「生成内容方案」即可开始产生事件" />}
          />
        </div>
      </div>
    );
  }

  if (entityId) {
    const run = allRuns.find((r) => r.replayId === entityId);
    const replay = getOrCreateReplay(entityId, run?.agentName);

    return (
      <div>
        <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={() => navigate("replayCenter")}>
          ← 返回回放列表
        </button>
        <PageHeader title={`回放：${replay.agentName}`} actions={<DemoBadge />} />
        <div className="fdr-card">
          {replay.steps.map((step, idx) => (
            <div key={step.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: idx < replay.steps.length - 1 ? "1px solid var(--border)" : "none" }}>
              <StatusPill tone={STEP_TONE[step.type] ?? "neutral"}>{step.type}</StatusPill>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{step.label}</div>
                <pre style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0", whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(step.payload, null, 2)}
                </pre>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {step.durationMs}ms{step.tokensUsed ? ` · ${step.tokensUsed} tokens` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="回放中心" subtitle="回放历史 Agent 运行与跨模块经营闭环，均不影响生产数据" actions={<DemoBadge />} />
      <Tabs tabs={REPLAY_TABS} activeTab={activeTab} onChange={(t) => navigate("replayCenter", { subView: t === "agent" ? undefined : t })} />
      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "agentName", label: "Agent" },
            { key: "startedAt", label: "开始时间", render: (r) => new Date(r.startedAt).toLocaleString("zh-CN") },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "completed" ? "success" : "danger"}>{r.status}</StatusPill> },
            { key: "tokensUsed", label: "Token 用量" },
          ]}
          rows={allRuns}
          onRowClick={(row) => navigate("replayCenter", { entityId: row.replayId })}
          emptyMessage={<EmptyState icon="↻" message="暂无可回放的运行记录" />}
        />
      </div>
    </div>
  );
}
