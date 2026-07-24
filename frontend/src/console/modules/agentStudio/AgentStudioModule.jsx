import { useEffect, useState } from "react";
import { getAgents } from "../../../services/agentApi.js";
import { safeCall } from "../../realDataSafe.js";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getAgentConfig } from "../../mock/agentStudioMock.js";
import { DEMO_STORES } from "../../mock/storesMock.js";
import { AGENT_TEMPLATES, getAgentCategoryOf } from "../../mock/agentTemplatesMock.js";
import { AgentListView } from "./AgentListView.jsx";
import { AgentDetailView } from "./AgentDetailView.jsx";
import { AgentOperatingChain } from "./AgentOperatingChain.jsx";

export function AgentStudioModule() {
  const { subView, entityId, tab, navigate } = useConsoleNavContext();
  const [agents, setAgents] = useState({ connected: false, data: null });
  const [configVersion, setConfigVersion] = useState(0);
  const [showChain, setShowChain] = useState(false);
  const storeId = DEMO_STORES.find((s) => s.id === subView)?.id ?? DEMO_STORES[0].id;

  useEffect(() => {
    safeCall(getAgents).then(setAgents);
  }, []);

  const items = Array.isArray(agents.data?.items) ? agents.data.items : [];
  const templateAgents = AGENT_TEMPLATES.map((t) => ({ name: t.key, role: `${t.category} · 系统模板`, description: t.description }));
  const allAgents = [...items, ...templateAgents];
  const selectedAgent = entityId ? allAgents.find((agent) => agent.name === entityId) : null;

  function handleStoreChange(nextStoreId) {
    navigate("agentStudio", { subView: nextStoreId, entityId, tab });
  }

  const storeSelector = (
    <div className="fdr-field" style={{ margin: 0, minWidth: 180 }}>
      <label className="fdr-field__label">当前店铺</label>
      <select className="fdr-select" value={storeId} onChange={(e) => handleStoreChange(e.target.value)}>
        {DEMO_STORES.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );

  if (!agents.connected) {
    return (
      <div>
        <PageHeader title="Agent 工作室" subtitle="Agent 列表尚未接入" />
        <EmptyState icon="○" message="无法获取 Agent 列表，请确认后端服务已启动" />
      </div>
    );
  }

  if (selectedAgent) {
    const config = getAgentConfig(selectedAgent.name, storeId);
    return (
      <div>
        <PageHeader
          title="Agent 工作室"
          subtitle={`${DEMO_STORES.find((s) => s.id === storeId)?.name ?? storeId} · ${getAgentCategoryOf(selectedAgent.name)}`}
          actions={
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              {storeSelector}
              <button className="fdr-btn fdr-btn--ghost" onClick={() => navigate("agentStudio", { subView: storeId })}>← 返回列表</button>
            </div>
          }
        />
        <AgentDetailView
          agent={selectedAgent}
          storeId={storeId}
          config={config}
          allAgents={allAgents}
          onConfigChange={() => setConfigVersion((v) => v + 1)}
          key={`${storeId}:${selectedAgent.name}:${configVersion}`}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Agent 工作室"
        subtitle="Founder 不能新建 Agent 类型——每个店铺拥有自己独立的一份 Agent 配置实例，Prompt / Skill / Knowledge 完全隔离"
        actions={
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            {storeSelector}
            <Button variant="secondary" onClick={() => setShowChain((v) => !v)}>
              {showChain ? "返回 Agent 列表" : "查看 Agent 关系图"}
            </Button>
            <DemoBadge />
          </div>
        }
      />
      {showChain ? (
        <AgentOperatingChain />
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: -10, marginBottom: 16 }}>
            当前查看「{DEMO_STORES.find((s) => s.id === storeId)?.name}」的 Agent 配置，共 {allAgents.length} 个标准 Agent 类型（{items.length} 个核心 + {templateAgents.length} 个系统模板），点击进入配置。
          </p>
          <AgentListView agents={items} storeId={storeId} />
        </>
      )}
    </div>
  );
}
