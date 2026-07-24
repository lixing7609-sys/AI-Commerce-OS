import { useEffect, useMemo, useState } from "react";
import { getAgents } from "../../../services/agentApi.js";
import { getLlmStatus } from "../../../services/settingsApi.js";
import { safeCall } from "../../realDataSafe.js";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { MODEL_CATALOG, getModelEnabledMap, toggleModelEnabled } from "../../mock/modelRouterMock.js";
import { TASK_TYPES, getAgentConfig } from "../../mock/agentStudioMock.js";

export function ModelRouterModule() {
  const { navigate } = useConsoleNavContext();
  const [agents, setAgents] = useState({ connected: false, data: null });
  const [llmStatus, setLlmStatus] = useState({ connected: false, data: null });
  const [enabledMap, setEnabledMap] = useState(() => getModelEnabledMap());
  const [testAgent, setTestAgent] = useState("");
  const [testTaskType, setTestTaskType] = useState(TASK_TYPES[0].key);

  useEffect(() => {
    safeCall(getAgents).then(setAgents);
    safeCall(getLlmStatus).then(setLlmStatus);
  }, []);

  const items = useMemo(
    () => (Array.isArray(agents.data?.items) ? agents.data.items : []),
    [agents.data]
  );

  const routingRows = useMemo(() => {
    return items.flatMap((agent) => {
      const config = getAgentConfig(agent.name);
      return config.modelRouting.map((route) => ({
        agent: agent.name,
        taskType: TASK_TYPES.find((t) => t.key === route.taskType)?.label ?? route.taskType,
        model: MODEL_CATALOG.find((m) => m.id === route.modelId)?.label ?? route.modelId,
        fallback: MODEL_CATALOG.find((m) => m.id === route.fallbackModelId)?.label ?? route.fallbackModelId,
      }));
    });
  }, [items]);

  const resolvedModel = useMemo(() => {
    if (!testAgent) return null;
    const config = getAgentConfig(testAgent);
    const route = config.modelRouting.find((r) => r.taskType === testTaskType);
    if (!route) return null;
    return MODEL_CATALOG.find((m) => m.id === route.modelId);
  }, [testAgent, testTaskType]);

  return (
    <div>
      <PageHeader
        title="模型路由"
        subtitle="按 Agent × 任务类型查看与测试模型路由"
        actions={
          llmStatus.connected ? (
            <StatusPill tone="success">LLM 服务已连接</StatusPill>
          ) : (
            <StatusPill tone="neutral">LLM 状态未接入</StatusPill>
          )
        }
      />

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>模型目录</h3>
          <DemoBadge />
        </div>
        <DataTable
          columns={[
            { key: "label", label: "模型" },
            { key: "provider", label: "供应商" },
            { key: "contextWindow", label: "上下文" },
            { key: "costPer1kIn", label: "输入成本/1K", render: (r) => `$${r.costPer1kIn}` },
            { key: "costPer1kOut", label: "输出成本/1K", render: (r) => `$${r.costPer1kOut}` },
            { key: "latencyP50Ms", label: "P50 延迟", render: (r) => `${r.latencyP50Ms}ms` },
            {
              key: "status",
              label: "状态",
              render: (r) => <StatusPill tone={r.status === "healthy" ? "success" : "warning"}>{r.status}</StatusPill>,
            },
            {
              key: "enabled",
              label: "启用",
              render: (r) => (
                <Button
                  size="sm"
                  variant={enabledMap[r.id] ? "primary" : "secondary"}
                  onClick={() => setEnabledMap(toggleModelEnabled(r.id))}
                >
                  {enabledMap[r.id] ? "已启用" : "已停用"}
                </Button>
              ),
            },
          ]}
          rows={MODEL_CATALOG}
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">按任务类型的路由规则</h3>
        {!agents.connected ? (
          <EmptyState icon="○" message="Agent 数据尚未接入" />
        ) : (
          <DataTable
            columns={[
              { key: "agent", label: "Agent" },
              { key: "taskType", label: "任务类型" },
              { key: "model", label: "主模型" },
              { key: "fallback", label: "备用模型" },
            ]}
            rows={routingRows}
            onRowClick={(row) => navigate("agentStudio", { entityId: row.agent, tab: "modelRouter" })}
          />
        )}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">测试路由</h3>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <select className="fdr-select" style={{ maxWidth: 200 }} value={testAgent} onChange={(e) => setTestAgent(e.target.value)}>
            <option value="">选择 Agent</option>
            {items.map((agent) => (
              <option key={agent.name} value={agent.name}>{agent.name}</option>
            ))}
          </select>
          <select className="fdr-select" style={{ maxWidth: 200 }} value={testTaskType} onChange={(e) => setTestTaskType(e.target.value)}>
            {TASK_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        {resolvedModel ? (
          <p style={{ fontSize: 13 }}>
            将路由到 <strong>{resolvedModel.label}</strong>（{resolvedModel.provider}）
          </p>
        ) : (
          <EmptyState icon="⇆" message="选择 Agent 和任务类型查看解析结果" />
        )}
      </div>
    </div>
  );
}
