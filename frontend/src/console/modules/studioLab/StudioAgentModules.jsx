import { useState } from "react";
import {
  getStudioLabState, publishPromptVersion, rollbackPromptVersion, updateModelRoute,
} from "../../../studio/mock/studioAgentMock.js";
import { DIRECTOR_STAGES } from "../../../studio/mock/directorMock.js";
import { GRAPHIC_WORKFLOW_STAGES } from "../../../studio/mock/graphicContentMock.js";
import { PageHeader, DataTable, StatusPill, DemoBadge, Tabs, useToast } from "../../kit/index.js";

/**
 * Founder「Studio 实验室」实验控制层（阶段：Studio V3 Integration
 * §十八 / 补充§五）——只在 Founder 内可见的系统级研发配置：Agent
 * 状态与配置、Prompt 版本管理、Skill 管理、Workflow 查看、模型路由。
 * 复用 Founder 自己的 kit（DataTable/StatusPill/Tabs/useToast），与
 * Agent 工作室（console/modules/agentStudio/）同一套视觉语言，但这里
 * 管理的是 Studio 的内容/图文生产 Agent，不是 Operator 的经营 Agent。
 */
function FounderStudioLabBadge() {
  return <StatusPill tone="info">Founder · Studio 实验室</StatusPill>;
}

const STATUS_LABEL = { idle: "空闲", running: "运行中", completed: "已完成", needs_attention: "需人工介入", error: "异常" };
const STATUS_TONE = { idle: "neutral", running: "info", completed: "success", needs_attention: "warning", error: "danger" };

export function StudioAgentsModule() {
  const { agents } = getStudioLabState();
  const [selected, setSelected] = useState(null);
  const agent = selected ?? agents[0];

  return (
    <div>
      <PageHeader title="Studio Agent" subtitle="内容生产 14 个 + 图文生产/运营 13 个，共 27 个角色化 Agent" actions={<FounderStudioLabBadge />} />
      <DataTable
        columns={[
          { key: "name", label: "名称" }, { key: "responsibility", label: "职责" },
          { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
          { key: "currentTask", label: "当前任务" }, { key: "progress", label: "进度", render: (r) => `${r.progress}%` },
          { key: "primaryModel", label: "当前模型" }, { key: "backupModel", label: "备用模型" },
          { key: "promptVersion", label: "Prompt版本" }, { key: "cost", label: "成本", render: (r) => `¥${r.cost}` },
          { key: "successRate", label: "成功率", render: (r) => `${r.successRate}%` }, { key: "latencyMs", label: "延迟", render: (r) => `${r.latencyMs}ms` },
          { key: "needsHumanIntervention", label: "需人工介入", render: (r) => (r.needsHumanIntervention ? <StatusPill tone="warning">是</StatusPill> : "否") },
        ]}
        rows={agents}
        onRowClick={setSelected}
      />
      {agent ? (
        <div className="fdr-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>{agent.name} · 编辑入口</h3>
          <p style={{ fontSize: 13, color: "var(--fdr-text-secondary)" }}>
            工作流：{agent.workflow} · 技能组合：{agent.skillCombo.join("、")} · 工具权限：{agent.toolPermissions.join("、")}
          </p>
          <p style={{ fontSize: 12, color: "var(--fdr-text-secondary)" }}>Prompt/Skill/模型路由的编辑请前往对应的「Studio Prompt」「Studio Skill」「Studio 模型路由」页面（左侧同一分组内）。</p>
        </div>
      ) : null}
    </div>
  );
}

export function StudioPromptsModule() {
  const { agents, prompts } = getStudioLabState();
  const [agentId, setAgentId] = useState(agents[0]?.agentId);
  const [, forceUpdate] = useState(0);
  const showToast = useToast();

  const agentPrompts = prompts.filter((p) => p.agentId === agentId).sort((a, b) => b.version - a.version);

  async function handlePublish(promptId) {
    await publishPromptVersion(promptId);
    showToast("已发布该 Prompt 版本", "success");
    forceUpdate((t) => t + 1);
  }

  async function handleRollback(version) {
    await rollbackPromptVersion(agentId, version);
    showToast(`已回滚到 v${version}`, "success");
    forceUpdate((t) => t + 1);
  }

  return (
    <div>
      <PageHeader title="Studio Prompt" subtitle="按 Agent 管理正式/草稿/历史版本，支持对比、测试与回滚" actions={<FounderStudioLabBadge />} />
      <div className="fdr-filter-bar" style={{ marginBottom: 12 }}>
        <select className="fdr-select" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
        </select>
      </div>
      <DataTable
        columns={[
          { key: "version", label: "版本", render: (r) => `v${r.version}` },
          { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "published" ? "success" : r.status === "draft" ? "warning" : "neutral"}>{{ published: "正式", draft: "草稿", deprecated: "历史" }[r.status]}</StatusPill> },
          { key: "content", label: "内容" }, { key: "note", label: "说明" },
          { key: "publishedAt", label: "发布时间", render: (r) => r.publishedAt ? new Date(r.publishedAt).toLocaleString("zh-CN") : "—" },
          { key: "publishedBy", label: "发布人" },
          {
            key: "actions", label: "操作", render: (r) => (
              <span style={{ display: "flex", gap: 6 }}>
                {r.status === "draft" ? <button type="button" className="fdr-btn" onClick={(e) => { e.stopPropagation(); handlePublish(r.promptId); }}>发布</button> : null}
                {r.status === "deprecated" ? <button type="button" className="fdr-btn" onClick={(e) => { e.stopPropagation(); handleRollback(r.version); }}>回滚到此版本</button> : null}
              </span>
            ),
          },
        ]}
        rows={agentPrompts}
      />
    </div>
  );
}

export function StudioSkillsModule() {
  const { skills, agents } = getStudioLabState();
  return (
    <div>
      <PageHeader title="Studio Skill" subtitle="行业知识、工作步骤、输出模板、禁止事项、质量检查规则" actions={<FounderStudioLabBadge />} />
      <DataTable
        columns={[
          { key: "name", label: "Skill 名称" }, { key: "domainKnowledge", label: "行业知识" },
          { key: "workSteps", label: "工作步骤" }, { key: "outputTemplate", label: "输出模板" },
          { key: "prohibitions", label: "禁止事项" }, { key: "qualityRules", label: "质量检查规则" },
          { key: "callableTools", label: "可调用工具", render: (r) => r.callableTools.join("、") },
          { key: "example", label: "示例" }, { key: "version", label: "版本", render: (r) => `v${r.version}` },
          { key: "applicableAgentIds", label: "适用 Agent", render: (r) => r.applicableAgentIds.map((id) => agents.find((a) => a.agentId === id)?.name ?? id).join("、") },
        ]}
        rows={skills}
      />
    </div>
  );
}

export function StudioWorkflowsModule() {
  const [tab, setTab] = useState("content");
  return (
    <div>
      <PageHeader title="Studio Workflow" subtitle="内容生产十阶段流程 / AI图文十四阶段流程" actions={<FounderStudioLabBadge />} />
      <Tabs tabs={[{ key: "content", label: "内容生产十阶段流程" }, { key: "graphic", label: "AI图文十四阶段流程" }]} activeTab={tab} onChange={setTab} />
      <DataTable
        columns={[
          { key: "order", label: "阶段" }, { key: "name", label: "名称" }, { key: "agentName", label: "负责 Agent" },
        ]}
        rows={(tab === "content" ? DIRECTOR_STAGES : GRAPHIC_WORKFLOW_STAGES).map((s) => ({ id: s.stageKey, ...s }))}
      />
    </div>
  );
}

export function StudioModelRoutingModule() {
  const { agents, modelRoutes } = getStudioLabState();
  const [agentId, setAgentId] = useState(agents[0]?.agentId);
  const [route, setRoute] = useState(() => modelRoutes.find((r) => r.agentId === agentId));
  const showToast = useToast();

  function selectAgent(id) {
    setAgentId(id);
    setRoute(modelRoutes.find((r) => r.agentId === id));
  }

  function setField(key, value) {
    setRoute((r) => ({ ...r, [key]: value }));
  }

  async function handleSave() {
    await updateModelRoute(agentId, route);
    showToast("模型路由配置已保存", "success");
  }

  return (
    <div>
      <PageHeader title="Studio 模型路由" subtitle="每个 Agent 独立配置主模型/备用模型/图像/视频/语音模型与成本上限" actions={<FounderStudioLabBadge />} />
      <div className="fdr-filter-bar" style={{ marginBottom: 12 }}>
        <select className="fdr-select" value={agentId} onChange={(e) => selectAgent(e.target.value)}>
          {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
        </select>
      </div>
      {route ? (
        <div className="fdr-card">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Field label="主模型"><input value={route.primaryModel} onChange={(e) => setField("primaryModel", e.target.value)} /></Field>
            <Field label="备用模型"><input value={route.backupModel} onChange={(e) => setField("backupModel", e.target.value)} /></Field>
            <Field label="图像模型"><input value={route.imageModel} onChange={(e) => setField("imageModel", e.target.value)} /></Field>
            <Field label="视频模型"><input value={route.videoModel} onChange={(e) => setField("videoModel", e.target.value)} /></Field>
            <Field label="语音模型"><input value={route.voiceModel} onChange={(e) => setField("voiceModel", e.target.value)} /></Field>
            <Field label="最大Token"><input type="number" value={route.maxTokens} onChange={(e) => setField("maxTokens", Number(e.target.value))} /></Field>
            <Field label="温度"><input type="number" step="0.1" value={route.temperature} onChange={(e) => setField("temperature", Number(e.target.value))} /></Field>
            <Field label="超时(秒)"><input type="number" value={route.timeoutSeconds} onChange={(e) => setField("timeoutSeconds", Number(e.target.value))} /></Field>
            <Field label="重试次数"><input type="number" value={route.retryCount} onChange={(e) => setField("retryCount", Number(e.target.value))} /></Field>
            <Field label="单次成本上限"><input type="number" value={route.perCallCostLimit} onChange={(e) => setField("perCallCostLimit", Number(e.target.value))} /></Field>
            <Field label="每日成本上限"><input type="number" value={route.dailyCostLimit} onChange={(e) => setField("dailyCostLimit", Number(e.target.value))} /></Field>
            <Field label="自动切换模型">
              <select className="fdr-select" value={route.autoSwitchModel ? "1" : "0"} onChange={(e) => setField("autoSwitchModel", e.target.value === "1")}>
                <option value="1">开启</option><option value="0">关闭</option>
              </select>
            </Field>
          </div>
          <Field label="降级策略"><input value={route.fallbackStrategy} onChange={(e) => setField("fallbackStrategy", e.target.value)} /></Field>
          <button type="button" className="fdr-btn fdr-btn--primary" onClick={handleSave}>保存配置</button>
        </div>
      ) : <DemoBadge />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 11, color: "var(--fdr-text-secondary)", marginBottom: 4, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}
