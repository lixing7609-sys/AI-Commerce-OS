import { useMemo, useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { Button } from "../../kit/Button.jsx";
import { Modal } from "../../kit/Modal.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { KeyValueList } from "../../kit/KeyValueList.jsx";
import { useToast } from "../../kit/useToast.js";
import { AgentStudioModule } from "../agentStudio/AgentStudioModule.jsx";
import { ModelRouterModule } from "../modelRouter/ModelRouterModule.jsx";
import { StudioAgentsModule, StudioModelRoutingModule } from "../studioLab/StudioAgentModules.jsx";
import { CapabilityScopeLifecycleBar } from "../../shared/CapabilityScopeLifecycleBar.jsx";
import { CAPABILITY_SCOPE_OPTIONS, FEATURED_AGENT } from "../../../demoData/capabilityDemoData.js";

/**
 * Agent Center — AI Capability Center §design/configure stage
 * (docs/architecture/Founder_Master_Edition_Development_Charter.md §3.2).
 * Composes the previously-standalone Founder Agent 工作室/模型路由
 * modules with the previously-orphaned "Studio 实验控制层" Agent/模型
 * 路由 modules as scope tabs — Founder-scope agents (per-store Operator
 * agents) and Studio-scope agents (content-production agents) are the
 * same capability type, just consumed by different editions, so they
 * live in one Center instead of two disconnected nav trees.
 *
 * Local (non-URL) tab state, matching the existing convention used by
 * StudioWorkflowsModule/GraphicContentEditorPage — AgentStudioModule/
 * ModelRouterModule self-navigate via `navigate("agentStudio"/"modelRouter", …)`
 * for their own list/detail state, so a URL-driven subView would fight
 * their internal navigation. Drilling into an agent's detail view will
 * therefore un-mount this tab chrome (the bare module renders directly,
 * same as any other hiddenFromSidebar deep-linkable module) — returning
 * to "Agent Center" via the sidebar restores it.
 *
 * 顶部新增版本范围选择器（中文框架审查版新增）：Founder/Studio 各自
 * 已有对应 tab，选择这两个范围时只显示相关 tab；Operator/Cloud 范围
 * 目前还没有独立的 Agent 管理入口，选中后展示跨页面锚点 Agent
 * （FEATURED_AGENT，与今日总览/补货建议共用同一条记录）作为占位说明，
 * 而不是空白页。
 */
const TABS = [
  { key: "founder", label: "Founder Agent", scope: "founder" },
  { key: "modelRouter", label: "模型路由", scope: "founder" },
  { key: "studioAgents", label: "Studio Agent", scope: "studio" },
  { key: "studioModelRouting", label: "Studio 模型路由", scope: "studio" },
];

const NEW_AGENT_CATEGORIES = ["经营决策", "机会发现", "内容运营", "直播运营", "售后运营"];

function NewAgentModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(NEW_AGENT_CATEGORIES[0]);
  const [scope, setScope] = useState("founder");

  function handleCreate() {
    if (!name.trim()) return;
    toast(`已创建 Agent「${name}」（演示，未真实持久化，不会出现在下方列表中）`, "success");
    onCreated?.({ name, category, scope });
    setName("");
    onClose();
  }

  return (
    <Modal open={open} title="新建 Agent" onClose={onClose}>
      <div className="fdr-field">
        <label className="fdr-field__label">Agent 名称</label>
        <input className="fdr-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：售后退款建议 Agent" />
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">Agent 分类</label>
        <select className="fdr-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {NEW_AGENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">适用版本</label>
        <select className="fdr-select" value={scope} onChange={(e) => setScope(e.target.value)}>
          {CAPABILITY_SCOPE_OPTIONS.filter((o) => o.key !== "all").map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        演示框架：本轮未接入真实的 Agent 创建服务，此处仅验证新建流程的框架是否完整。
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <Button variant="secondary" onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={!name.trim()} onClick={handleCreate}>创建</Button>
      </div>
    </Modal>
  );
}

function RestrictedScopeState({ scopeLabel }) {
  return (
    <div className="fdr-card">
      <EmptyState
        icon="○"
        message={`「${scopeLabel}」范围暂无独立的 Agent 管理入口——以下为该范围的跨页面锚点 Agent 示例（与今日总览、补货建议共用同一条记录）`}
      />
      <KeyValueList
        items={[
          { label: "Agent 名称", value: FEATURED_AGENT.name },
          { label: "分类", value: FEATURED_AGENT.category },
          { label: "状态", value: FEATURED_AGENT.status === "running" ? "运行中" : FEATURED_AGENT.status },
          { label: "当前版本", value: FEATURED_AGENT.version },
          { label: "成功率", value: `${Math.round(FEATURED_AGENT.successRate * 100)}%` },
          { label: "今日成本", value: `¥${FEATURED_AGENT.costToday.toFixed(2)}` },
        ]}
      />
    </div>
  );
}

export function AgentCenterModule() {
  const [tab, setTab] = useState("founder");
  const [scope, setScope] = useState("all");
  const [newAgentOpen, setNewAgentOpen] = useState(false);

  const visibleTabs = useMemo(
    () => (scope === "all" ? TABS : TABS.filter((t) => t.scope === scope)),
    [scope]
  );

  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0]?.key;

  function handleScopeChange(nextScope) {
    setScope(nextScope);
    const nextVisible = nextScope === "all" ? TABS : TABS.filter((t) => t.scope === nextScope);
    if (nextVisible.length && !nextVisible.some((t) => t.key === tab)) {
      setTab(nextVisible[0].key);
    }
  }

  const scopeLabel = CAPABILITY_SCOPE_OPTIONS.find((o) => o.key === scope)?.label ?? scope;

  return (
    <div>
      <CapabilityScopeLifecycleBar scope={scope} onScopeChange={handleScopeChange} activeStage="配置" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
        {visibleTabs.length ? <Tabs tabs={visibleTabs} activeTab={activeTab} onChange={setTab} /> : <div />}
        <Button variant="primary" onClick={() => setNewAgentOpen(true)}>+ 新建 Agent</Button>
      </div>

      {visibleTabs.length === 0 ? <RestrictedScopeState scopeLabel={scopeLabel} /> : null}
      {activeTab === "founder" ? <AgentStudioModule /> : null}
      {activeTab === "modelRouter" ? <ModelRouterModule /> : null}
      {activeTab === "studioAgents" ? <StudioAgentsModule /> : null}
      {activeTab === "studioModelRouting" ? <StudioModelRoutingModule /> : null}

      <NewAgentModal open={newAgentOpen} onClose={() => setNewAgentOpen(false)} />
    </div>
  );
}
