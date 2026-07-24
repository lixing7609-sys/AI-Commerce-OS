import { useRef, useState } from "react";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { useToast } from "../../kit/useToast.js";
import { Tabs } from "../../kit/Tabs.jsx";
import { Button } from "../../kit/Button.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { Modal, ConfirmModal } from "../../kit/Modal.jsx";
import { TrendLineChart } from "../../kit/ChartFrame.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import {
  MODEL_OPTIONS,
  TASK_TYPES,
  appendRunHistory,
  duplicateConfigToAgent,
  exportAgentConfigJson,
  getAllAgentConfigs,
  importAgentConfigJson,
  parseConfigKey,
  publishAgentVersion,
  resetAgentConfigToDefault,
  rollbackAgentVersion,
  updateAgentConfig,
} from "../../mock/agentStudioMock.js";
import {
  getPromptSkillState,
  testSkill,
  updatePromptContent,
} from "../../mock/promptSkillMock.js";
import {
  duplicateKnowledgeAsset,
  getKnowledgeState,
  getScopeLabel,
  updateKnowledgeContent,
} from "../../mock/knowledgeMock.js";
import { DEMO_STORES, getStoreName } from "../../mock/storesMock.js";
import { simulateLatency, nextMockId } from "../../mock/mockUtils.js";

const TABS = [
  { key: "config", label: "Agent 配置" },
  { key: "promptLibrary", label: "Prompt 资产库" },
  { key: "skillLibrary", label: "Skill 资产库" },
  { key: "knowledgeLibrary", label: "Knowledge 资产库" },
  { key: "testEval", label: "测试与评测" },
  { key: "version", label: "版本与回滚" },
];

function computeLinkedLabels(predicate) {
  const configs = getAllAgentConfigs();
  return Object.entries(configs)
    .filter(([, config]) => predicate(config))
    .map(([key]) => {
      const { storeId, agentName } = parseConfigKey(key);
      return `${getStoreName(storeId)} · ${agentName}`;
    });
}

function computeLinkedForPrompt(promptId) {
  return computeLinkedLabels((config) => config.promptId === promptId);
}

function computeLinkedForSkill(skillId) {
  return computeLinkedLabels((config) => config.skillBindings?.some((b) => b.skillId === skillId && b.enabled));
}

function computeLinkedForKnowledge(knowledgeId) {
  return computeLinkedLabels((config) => config.knowledgeBindings?.some((b) => b.knowledgeId === knowledgeId && b.enabled));
}

/* ----------------------------------------------------------------
 * Agent 配置：这个店铺这个 Agent 的完整配置面板——绑定 Prompt /
 * Skill / Knowledge / Model，配置工具权限，并展示运营成本与表现
 * 指标。Prompt/Skill/Knowledge 的正文编辑不在这里，只做"引用/
 * 启用"，正文编辑在各自的资产库标签页完成。
 * ---------------------------------------------------------------- */
function ConfigTab({ agentName, storeId, config, onChange, navigate }) {
  const toast = useToast();
  const { prompts, skills } = getPromptSkillState();
  const { assets: knowledgeAssets } = getKnowledgeState();
  const linkedPrompt = prompts.find((p) => p.id === config.promptId);
  const enabledSkillCount = config.skillBindings.filter((b) => b.enabled).length;
  const enabledKnowledgeCount = (config.knowledgeBindings ?? []).filter((b) => b.enabled).length;
  const currentModel = MODEL_OPTIONS.find((m) => m.id === config.modelRouting[0]?.modelId);
  const m = config.operatingMetrics;

  function toggleSkill(skillId) {
    const skillBindings = config.skillBindings.map((binding) =>
      binding.skillId === skillId ? { ...binding, enabled: !binding.enabled } : binding
    );
    onChange(updateAgentConfig(agentName, storeId, { skillBindings }));
    toast("Skill 绑定已更新", "success");
  }

  function toggleKnowledge(knowledgeId) {
    const knowledgeBindings = (config.knowledgeBindings ?? []).map((binding) =>
      binding.knowledgeId === knowledgeId ? { ...binding, enabled: !binding.enabled } : binding
    );
    onChange(updateAgentConfig(agentName, storeId, { knowledgeBindings }));
    toast("Knowledge 绑定已更新", "success");
  }

  function updateRoute(taskType, field, value) {
    const modelRouting = config.modelRouting.map((route) =>
      route.taskType === taskType ? { ...route, [field]: value } : route
    );
    onChange(updateAgentConfig(agentName, storeId, { modelRouting }));
  }

  function toggleTool(toolId) {
    const toolPermissions = config.toolPermissions.map((tool) =>
      tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool
    );
    onChange(updateAgentConfig(agentName, storeId, { toolPermissions }));
    toast("工具权限已更新", "success");
  }

  return (
    <div>
      {/* 运营成本与表现 —— Agent 组合链路 Agent → Prompt → Skill →
          Knowledge → Tools → Model 一目了然 */}
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>运营成本与表现</h3>
          <DemoBadge />
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginTop: 12 }}>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>当前店铺</dt><dd style={{ margin: 0, fontWeight: 600 }}>{getStoreName(storeId)}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>健康度</dt><dd style={{ margin: 0, fontWeight: 600 }}>{m.healthPercent}%</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>运行状态</dt><dd style={{ margin: 0 }}>
            <StatusPill tone={m.activeStatus === "active" ? "success" : m.activeStatus === "paused" ? "neutral" : m.activeStatus === "warning" ? "warning" : "danger"}>
              {{ active: "运行中", paused: "已暂停", warning: "告警", failed: "失败" }[m.activeStatus] ?? m.activeStatus}
            </StatusPill>
          </dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>今日花费</dt><dd style={{ margin: 0, fontWeight: 600 }}>${m.todayCostUsd.toFixed(2)}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>近 7 天花费</dt><dd style={{ margin: 0, fontWeight: 600 }}>${m.sevenDayCostUsd.toFixed(2)}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>完成任务数</dt><dd style={{ margin: 0, fontWeight: 600 }}>{m.tasksCompleted}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>成功率</dt><dd style={{ margin: 0, fontWeight: 600 }}>{m.successRate}%</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>单任务平均成本</dt><dd style={{ margin: 0, fontWeight: 600 }}>${m.avgCostPerTaskUsd.toFixed(2)}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>平均延迟</dt><dd style={{ margin: 0, fontWeight: 600 }}>{m.avgLatencyMs} ms</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>Token 消耗</dt><dd style={{ margin: 0, fontWeight: 600 }}>{m.tokenConsumption.toLocaleString()}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>当前 Prompt 版本</dt><dd style={{ margin: 0, fontWeight: 600 }}>{linkedPrompt ? `v${linkedPrompt.version}` : "未绑定"}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>当前 Skill 绑定</dt><dd style={{ margin: 0, fontWeight: 600 }}>{enabledSkillCount} 个已启用</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>当前 Knowledge 绑定</dt><dd style={{ margin: 0, fontWeight: 600 }}>{enabledKnowledgeCount} 个已启用</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>当前模型</dt><dd style={{ margin: 0, fontWeight: 600 }}>{currentModel?.label ?? "—"}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>最近一次成功运行</dt><dd style={{ margin: 0, fontWeight: 600 }}>{new Date(m.lastSuccessfulRunAt).toLocaleString("zh-CN")}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>最近一次失败</dt><dd style={{ margin: 0, fontWeight: 600 }}>{m.lastFailureAt ? new Date(m.lastFailureAt).toLocaleString("zh-CN") : "无"}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>重试次数</dt><dd style={{ margin: 0, fontWeight: 600 }}>{m.retryCount}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>待审批数</dt><dd style={{ margin: 0, fontWeight: 600 }}>{m.pendingApprovals}</dd></div>
        </dl>
      </div>

      {/* 绑定 Prompt */}
      <div className="fdr-card">
        <h3 className="fdr-card__title">绑定 Prompt</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          这里只选择「{getStoreName(storeId)} · {agentName}」引用资产库里的哪一条 Prompt；正文编辑与版本管理在「Prompt 资产库」标签页完成。
        </p>
        <div className="fdr-field">
          <label className="fdr-field__label">引用的 Prompt</label>
          <select
            className="fdr-select"
            value={config.promptId ?? ""}
            onChange={(e) => {
              onChange(updateAgentConfig(agentName, storeId, { promptId: e.target.value }));
              toast("已切换引用的 Prompt", "success");
            }}
          >
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}（{p.category}）</option>
            ))}
          </select>
        </div>
        {linkedPrompt ? (
          <div className="fdr-card" style={{ background: "var(--bg)", marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>{linkedPrompt.name}（当前 v{linkedPrompt.version}）</strong>
              <Button size="sm" variant="ghost" onClick={() => navigate("agentStudio", { subView: storeId, entityId: agentName, tab: "promptLibrary" })}>
                在 Prompt 资产库中编辑 →
              </Button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 0, whiteSpace: "pre-wrap" }}>
              {linkedPrompt.content}
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--danger)" }}>未引用任何 Prompt</p>
        )}
      </div>

      {/* 绑定 Skill */}
      <div className="fdr-card">
        <h3 className="fdr-card__title">绑定 Skill</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          一个 Skill 可以被多个店铺/多个 Agent 引用；这里的开关只决定本店铺本 Agent 是否使用它。
        </p>
        {skills.map((skill) => {
          const binding = config.skillBindings.find((b) => b.skillId === skill.id);
          return (
            <div key={skill.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <span style={{ fontSize: 13 }}>{skill.name}</span>
                <button
                  className="fdr-btn fdr-btn--ghost"
                  style={{ marginLeft: 8, fontSize: 12, padding: "2px 8px" }}
                  onClick={() => navigate("agentStudio", { subView: storeId, entityId: agentName, tab: "skillLibrary" })}
                >
                  查看定义
                </button>
              </div>
              <Button size="sm" variant={binding?.enabled ? "primary" : "secondary"} onClick={() => toggleSkill(skill.id)}>
                {binding?.enabled ? "已启用" : "已停用"}
              </Button>
            </div>
          );
        })}
      </div>

      {/* 绑定 Knowledge */}
      <div className="fdr-card">
        <h3 className="fdr-card__title">绑定 Knowledge</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          店铺专属 / 类目专属知识优先级高于全局通用知识；开关只决定本店铺本 Agent 是否使用该知识。
        </p>
        {knowledgeAssets
          .filter((asset) => asset.applicableStore === null || asset.applicableStore === storeId)
          .map((asset) => {
            const binding = (config.knowledgeBindings ?? []).find((b) => b.knowledgeId === asset.id);
            return (
              <div key={asset.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span style={{ fontSize: 13 }}>{asset.name}</span>
                  <StatusPill tone="neutral">{getScopeLabel(asset.scope)}</StatusPill>
                  <button
                    className="fdr-btn fdr-btn--ghost"
                    style={{ marginLeft: 8, fontSize: 12, padding: "2px 8px" }}
                    onClick={() => navigate("agentStudio", { subView: storeId, entityId: agentName, tab: "knowledgeLibrary" })}
                  >
                    查看定义
                  </button>
                </div>
                <Button size="sm" variant={binding?.enabled ? "primary" : "secondary"} onClick={() => toggleKnowledge(asset.id)}>
                  {binding?.enabled ? "已启用" : "已停用"}
                </Button>
              </div>
            );
          })}
      </div>

      {/* 选择模型 */}
      <div className="fdr-card">
        <h3 className="fdr-card__title">选择模型（按任务类型路由）</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          同一个 Agent 内，不同任务类型可以路由到不同模型（含备用模型），不是整个 Agent 只能绑定一个模型。
        </p>
        {config.modelRouting.map((route) => {
          const taskLabel = TASK_TYPES.find((t) => t.key === route.taskType)?.label ?? route.taskType;
          return (
            <div key={route.taskType} className="fdr-card" style={{ background: "var(--bg)", marginBottom: 10 }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: 13 }}>{taskLabel}</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                <div className="fdr-field" style={{ margin: 0 }}>
                  <label className="fdr-field__label">主模型</label>
                  <select
                    className="fdr-select"
                    value={route.modelId}
                    onChange={(e) => {
                      const model = MODEL_OPTIONS.find((mm) => mm.id === e.target.value);
                      updateRoute(route.taskType, "modelId", model.id);
                      updateRoute(route.taskType, "provider", model.provider);
                    }}
                  >
                    {MODEL_OPTIONS.map((mm) => (
                      <option key={mm.id} value={mm.id}>{mm.label}</option>
                    ))}
                  </select>
                </div>
                <div className="fdr-field" style={{ margin: 0 }}>
                  <label className="fdr-field__label">备用模型</label>
                  <select
                    className="fdr-select"
                    value={route.fallbackModelId}
                    onChange={(e) => updateRoute(route.taskType, "fallbackModelId", e.target.value)}
                  >
                    {MODEL_OPTIONS.map((mm) => (
                      <option key={mm.id} value={mm.id}>{mm.label}</option>
                    ))}
                  </select>
                </div>
                <div className="fdr-field" style={{ margin: 0 }}>
                  <label className="fdr-field__label">温度 {route.temperature}</label>
                  <div className="fdr-slider-row">
                    <input
                      type="range" min="0" max="1" step="0.1"
                      value={route.temperature}
                      onChange={(e) => updateRoute(route.taskType, "temperature", Number(e.target.value))}
                    />
                    <span className="fdr-slider-row__value">{route.temperature}</span>
                  </div>
                </div>
                <div className="fdr-field" style={{ margin: 0 }}>
                  <label className="fdr-field__label">最大 Token</label>
                  <input
                    type="number" className="fdr-input"
                    value={route.maxTokens}
                    onChange={(e) => updateRoute(route.taskType, "maxTokens", Number(e.target.value))}
                  />
                </div>
                <div className="fdr-field" style={{ margin: 0 }}>
                  <label className="fdr-field__label">成本上限（USD/次）</label>
                  <input
                    type="number" step="0.1" className="fdr-input"
                    value={route.costLimitUsd}
                    onChange={(e) => updateRoute(route.taskType, "costLimitUsd", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 工具与权限 */}
      <div className="fdr-card">
        <h3 className="fdr-card__title">工具与权限</h3>
        {config.toolPermissions.map((tool) => (
          <div key={tool.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 13 }}>{tool.name}</div>
              <StatusPill tone={tool.permission === "write" ? "warning" : "neutral"}>{tool.permission}</StatusPill>
            </div>
            <Button size="sm" variant={tool.enabled ? "primary" : "secondary"} onClick={() => toggleTool(tool.id)}>
              {tool.enabled ? "已授权" : "未授权"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Prompt 资产库：企业级可复用 Prompt 资产，一条 Prompt 可以被多个
 * 店铺/多个 Agent 引用。列表展示表现指标，详情页可编辑正文并发布
 * 新版本。
 * ---------------------------------------------------------------- */
function PromptLibraryTab() {
  const [state, setState] = useState(() => getPromptSkillState());
  const [selectedId, setSelectedId] = useState(null);
  const toast = useToast();
  const selected = selectedId ? state.prompts.find((p) => p.id === selectedId) : null;

  if (selected) {
    return <PromptDetail prompt={selected} onBack={() => setSelectedId(null)} onChange={setState} toast={toast} />;
  }

  return (
    <div className="fdr-card">
      <DataTable
        columns={[
          { key: "name", label: "名称" },
          { key: "category", label: "分类" },
          { key: "version", label: "版本", render: (r) => `v${r.version}` },
          { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "published" ? "success" : "neutral"}>{r.status === "published" ? "已发布" : "草稿"}</StatusPill> },
          { key: "linked", label: "关联 Agent", render: (r) => { const linked = computeLinkedForPrompt(r.id); return linked.length ? linked.join("、") : "暂无引用"; } },
          { key: "successRate", label: "成功率", render: (r) => `${r.metrics.successRate}%` },
          { key: "avgCostUsd", label: "平均成本", render: (r) => `$${r.metrics.avgCostUsd}` },
          { key: "avgTokens", label: "平均 Token", render: (r) => r.metrics.avgTokens.toLocaleString() },
          { key: "avgLatencyMs", label: "平均延迟", render: (r) => `${r.metrics.avgLatencyMs}ms` },
          { key: "evaluationScore", label: "评测分", render: (r) => r.metrics.evaluationScore },
        ]}
        rows={state.prompts}
        onRowClick={(row) => setSelectedId(row.id)}
        emptyMessage={<EmptyState icon="✎" message="暂无 Prompt" />}
      />
    </div>
  );
}

function PromptDetail({ prompt, onBack, onChange, toast }) {
  const [draft, setDraft] = useState(prompt.content);
  const linkedAgents = computeLinkedForPrompt(prompt.id);

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回 Prompt 列表</button>
      <div className="fdr-card">
        <h3 className="fdr-card__title">{prompt.name}（v{prompt.version}）</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          当前被引用：{linkedAgents.length > 0 ? linkedAgents.join("、") : "暂无 Agent 引用"}
        </p>
        <StatGridInline
          items={[
            ["成功率", `${prompt.metrics.successRate}%`],
            ["平均成本", `$${prompt.metrics.avgCostUsd}`],
            ["平均 Token 用量", prompt.metrics.avgTokens.toLocaleString()],
            ["平均延迟", `${prompt.metrics.avgLatencyMs}ms`],
            ["评测分", prompt.metrics.evaluationScore],
          ]}
        />
        <textarea className="fdr-textarea" style={{ minHeight: 160, marginTop: 12 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <Button
            variant="secondary"
            onClick={() => toast("草稿已暂存（未发布新版本）", "success")}
          >
            保存草稿
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onChange(updatePromptContent(prompt.id, draft));
              toast("已发布为新版本，所有引用该 Prompt 的 Agent 会使用新版本内容", "success");
            }}
          >
            测试并发布新版本
          </Button>
        </div>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">版本历史</h3>
        <DataTable columns={[{ key: "version", label: "版本", render: (r) => `v${r.version}` }, { key: "note", label: "说明" }]} rows={[...prompt.history].reverse()} />
      </div>
    </div>
  );
}

function StatGridInline({ items }) {
  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10 }}>
      {items.map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Skill 资产库：企业级可复用 Skill 资产，含 Schema/示例/测试调用。
 * ---------------------------------------------------------------- */
function SkillLibraryTab() {
  const [state] = useState(() => getPromptSkillState());
  const [selectedId, setSelectedId] = useState(null);
  const selected = selectedId ? state.skills.find((s) => s.id === selectedId) : null;

  if (selected) {
    return <SkillDetail skill={selected} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="fdr-card">
      <DataTable
        columns={[
          { key: "name", label: "名称" },
          { key: "description", label: "描述" },
          { key: "version", label: "版本", render: (r) => `v${r.version}` },
          { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "published" ? "success" : "neutral"}>{r.status === "published" ? "已发布" : "草稿"}</StatusPill> },
          { key: "linked", label: "关联 Agent", render: (r) => { const linked = computeLinkedForSkill(r.id); return linked.length ? linked.join("、") : "暂无引用"; } },
        ]}
        rows={state.skills}
        onRowClick={(row) => setSelectedId(row.id)}
        emptyMessage={<EmptyState icon="⚙" message="暂无 Skill" />}
      />
    </div>
  );
}

function SkillDetail({ skill, onBack }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const linkedAgents = computeLinkedForSkill(skill.id);

  async function handleTest() {
    setRunning(true);
    const result = await testSkill(skill.id, input);
    setOutput(result.output);
    setRunning(false);
  }

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回 Skill 列表</button>
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>{skill.name}</h3>
          <StatusPill tone={skill.status === "published" ? "success" : "neutral"}>v{skill.version} · {skill.status === "published" ? "已发布" : "草稿"}</StatusPill>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{skill.description}</p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          当前被引用：{linkedAgents.length > 0 ? linkedAgents.join("、") : "暂无 Agent 引用"}
        </p>
        <p style={{ fontSize: 12 }}><strong>输入结构：</strong>{skill.inputSchema}</p>
        <p style={{ fontSize: 12 }}><strong>输出结构：</strong>{skill.outputSchema}</p>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">测试调用</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          不确定该输入什么？点击「使用示例」自动填入一份符合输入结构的示例数据，不需要手写 JSON。
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <div>
            <label className="fdr-field__label">示例输入</label>
            <pre className="task-drawer-json" style={{ fontSize: 12, maxHeight: 100, overflow: "auto" }}>{skill.exampleInput}</pre>
          </div>
          <div>
            <label className="fdr-field__label">示例输出</label>
            <pre className="task-drawer-json" style={{ fontSize: 12, maxHeight: 100, overflow: "auto" }}>{skill.exampleOutput}</pre>
          </div>
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">测试数据</label>
          <textarea
            className="fdr-textarea"
            style={{ minHeight: 80 }}
            placeholder="输入测试数据（JSON），或点击下方「使用示例」自动填入"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => setInput(skill.exampleInput)}>使用示例</Button>
          <Button variant="primary" disabled={running} onClick={handleTest}>{running ? "运行中…" : "测试调用"}</Button>
        </div>
        {output ? (
          <pre className="task-drawer-json" style={{ marginTop: 10, fontSize: 13, whiteSpace: "pre-wrap" }}>{output}</pre>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Knowledge 资产库：Agent 组合链路 Agent → Prompt → Skill →
 * Knowledge → Tools → Model 的第三类可复用资产。支持全局/店铺/
 * 类目/Agent 四级绑定，店铺级、类目级优先于全局通用知识。
 * ---------------------------------------------------------------- */
function KnowledgeLibraryTab() {
  const [state, setState] = useState(() => getKnowledgeState());
  const [selectedId, setSelectedId] = useState(null);
  const toast = useToast();
  const selected = selectedId ? state.assets.find((a) => a.id === selectedId) : null;

  if (selected) {
    return (
      <KnowledgeDetail
        asset={selected}
        onBack={() => setSelectedId(null)}
        onChange={setState}
        toast={toast}
      />
    );
  }

  return (
    <div className="fdr-card">
      <DataTable
        columns={[
          { key: "name", label: "名称" },
          { key: "type", label: "类型" },
          { key: "scope", label: "绑定层级", render: (r) => <StatusPill tone={r.scope === "global" ? "neutral" : "info"}>{getScopeLabel(r.scope)}</StatusPill> },
          { key: "applicableStore", label: "适用店铺", render: (r) => (r.applicableStore ? getStoreName(r.applicableStore) : "全部店铺") },
          { key: "applicableCategory", label: "适用类目", render: (r) => r.applicableCategory ?? "不限类目" },
          { key: "linked", label: "关联 Agent", render: (r) => { const linked = computeLinkedForKnowledge(r.id); return linked.length ? linked.join("、") : "暂无引用"; } },
          { key: "version", label: "版本", render: (r) => `v${r.version}` },
          { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "published" ? "success" : "neutral"}>{r.status === "published" ? "已发布" : "草稿"}</StatusPill> },
          { key: "updatedAt", label: "最近更新", render: (r) => new Date(r.updatedAt).toLocaleDateString("zh-CN") },
        ]}
        rows={state.assets}
        onRowClick={(row) => setSelectedId(row.id)}
        emptyMessage={<EmptyState icon="▤" message="暂无 Knowledge 资产" />}
      />
    </div>
  );
}

function KnowledgeDetail({ asset, onBack, onChange, toast }) {
  const [draft, setDraft] = useState(asset.content);
  const [editing, setEditing] = useState(false);
  const linkedAgents = computeLinkedForKnowledge(asset.id);

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回 Knowledge 列表</button>
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 className="fdr-card__title" style={{ marginBottom: 4 }}>{asset.name}</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{asset.type} · v{asset.version} · {asset.status === "published" ? "已发布" : "草稿"}</p>
          </div>
          <StatusPill tone={asset.scope === "global" ? "neutral" : "info"}>{getScopeLabel(asset.scope)}</StatusPill>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginTop: 14 }}>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>适用店铺</dt><dd style={{ margin: 0 }}>{asset.applicableStore ? getStoreName(asset.applicableStore) : "全部店铺"}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>适用类目</dt><dd style={{ margin: 0 }}>{asset.applicableCategory ?? "不限类目"}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>关联 Agent</dt><dd style={{ margin: 0 }}>{linkedAgents.length ? linkedAgents.join("、") : "暂无引用"}</dd></div>
          <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>最近更新</dt><dd style={{ margin: 0 }}>{new Date(asset.updatedAt).toLocaleString("zh-CN")}</dd></div>
        </dl>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>{asset.description}</p>

        <h4 style={{ fontSize: 13, marginBottom: 6 }}>内容预览</h4>
        {editing ? (
          <textarea className="fdr-textarea" style={{ minHeight: 140 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
        ) : (
          <pre className="task-drawer-json" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{asset.content}</pre>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {editing ? (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  onChange(updateKnowledgeContent(asset.id, { content: draft }));
                  setEditing(false);
                  toast("已保存为新版本", "success");
                }}
              >
                保存为新版本
              </Button>
              <Button variant="secondary" onClick={() => { setDraft(asset.content); setEditing(false); }}>取消</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>编辑</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  onChange(duplicateKnowledgeAsset(asset.id));
                  toast("已复制为新的草稿资产", "success");
                  onBack();
                }}
              >
                复制
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">版本历史</h3>
        <DataTable
          columns={[
            { key: "version", label: "版本", render: (r) => `v${r.version}` },
            { key: "note", label: "说明" },
            { key: "updatedAt", label: "时间", render: (r) => new Date(r.updatedAt).toLocaleString("zh-CN") },
          ]}
          rows={[...asset.versionHistory].reverse()}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * 测试与评测：运行测试并记录历史，配合质量分趋势判断这份配置是否
 * 达标。
 * ---------------------------------------------------------------- */
function TestEvalTab({ agentName, storeId, config, onChange }) {
  const toast = useToast();
  const [running, setRunning] = useState(false);

  async function handleTestRun() {
    setRunning(true);
    await simulateLatency(600, 1200);
    onChange(
      appendRunHistory(agentName, storeId, {
        id: nextMockId("run"),
        startedAt: new Date().toISOString(),
        status: "completed",
        tokensUsed: 200 + Math.round(Math.random() * 1500),
        replayId: nextMockId("replay"),
      })
    );
    setRunning(false);
    toast("测试运行完成，已记录到历史", "success");
  }

  return (
    <div>
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>质量分趋势（演示）</h3>
          <Button variant="secondary" disabled={running} onClick={handleTestRun}>
            {running ? "运行中…" : "测试运行"}
          </Button>
        </div>
        <TrendLineChart data={config.evaluationScores} xKey="date" series={[{ key: "score", label: "质量分" }]} />
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">运行历史</h3>
        <DataTable
          columns={[
            { key: "startedAt", label: "开始时间", render: (r) => new Date(r.startedAt).toLocaleString("zh-CN") },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "completed" ? "success" : "danger"}>{r.status}</StatusPill> },
            { key: "tokensUsed", label: "Token 用量" },
          ]}
          rows={config.runHistory}
          emptyMessage="暂无运行历史"
        />
      </div>
    </div>
  );
}

function VersionTab({ agentName, storeId, config, onChange }) {
  const toast = useToast();
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(null);

  return (
    <div className="fdr-card">
      <DataTable
        columns={[
          { key: "version", label: "版本", render: (r) => `v${r.version}` },
          { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "published" ? "success" : "neutral"}>{r.status}</StatusPill> },
          { key: "publishedAt", label: "时间", render: (r) => new Date(r.publishedAt).toLocaleString("zh-CN") },
          { key: "snapshot", label: "说明" },
          {
            key: "actions",
            label: "操作",
            render: (r) =>
              r.status !== "published" ? (
                <Button size="sm" variant="secondary" onClick={() => setConfirmRollback(r.version)}>
                  回滚到此版本
                </Button>
              ) : (
                <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>当前版本</span>
              ),
          },
        ]}
        rows={[...config.versions].reverse()}
      />
      <div style={{ marginTop: 12 }}>
        <Button variant="primary" onClick={() => setConfirmPublish(true)}>
          发布当前草稿为新版本
        </Button>
      </div>

      <ConfirmModal
        open={confirmPublish}
        title="发布新版本"
        message="将当前 Prompt / Skill / Knowledge / 模型路由 / 工具权限配置发布为新版本，旧的已发布版本会变为已归档。确认发布？"
        confirmLabel="发布"
        onConfirm={() => {
          onChange(publishAgentVersion(agentName, storeId));
          toast("已发布新版本", "success");
        }}
        onClose={() => setConfirmPublish(false)}
      />

      <ConfirmModal
        open={confirmRollback !== null}
        title="回滚版本"
        message={`确认回滚到 v${confirmRollback} 吗？该版本会成为当前已发布版本。`}
        confirmLabel="回滚"
        danger
        onConfirm={() => {
          onChange(rollbackAgentVersion(agentName, storeId, confirmRollback));
          toast(`已回滚到 v${confirmRollback}`, "success");
        }}
        onClose={() => setConfirmRollback(null)}
      />
    </div>
  );
}

/**
 * 配置管理工具栏：Founder 不手工创建/删除 Agent，只管理"某个店铺
 * 的某个 Agent 配置"这份数据本身的生命周期——复制到另一个店铺/
 * Agent 作为起点、导出/导入 JSON、重置为默认值。
 */
function ConfigLifecycleToolbar({ agent, storeId, allAgents, onChange }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [targetStore, setTargetStore] = useState(DEMO_STORES.find((s) => s.id !== storeId)?.id ?? storeId);
  const [targetAgent, setTargetAgent] = useState(agent.name);
  const [confirmReset, setConfirmReset] = useState(false);

  function handleExport() {
    const json = exportAgentConfigJson(agent.name, storeId);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${storeId}-${agent.name}-config.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast("配置已导出", "success");
  }

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        onChange(importAgentConfigJson(agent.name, storeId, reader.result));
        toast("配置已导入", "success");
      } catch {
        toast("导入失败：文件不是有效的配置 JSON", "danger");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button variant="secondary" onClick={() => setDuplicateOpen(true)}>
        复制配置到其他店铺 / Agent
      </Button>
      <Button variant="secondary" onClick={handleExport}>导出配置</Button>
      <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>导入配置</Button>
      <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportFile} />
      <Button variant="ghost" onClick={() => setConfirmReset(true)}>重置为默认</Button>

      <Modal
        open={duplicateOpen}
        title="复制配置到其他店铺 / Agent"
        onClose={() => setDuplicateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicateOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={targetStore === storeId && targetAgent === agent.name}
              onClick={() => {
                duplicateConfigToAgent(
                  { agentName: agent.name, storeId },
                  { agentName: targetAgent, storeId: targetStore }
                );
                setDuplicateOpen(false);
                toast(`已将「${getStoreName(storeId)} · ${agent.name}」的配置复制到「${getStoreName(targetStore)} · ${targetAgent}」`, "success");
              }}
            >
              确认复制
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, marginTop: 0 }}>
          把「{getStoreName(storeId)} · {agent.name}」当前的 Prompt / Skill / Knowledge / 模型路由 / 工具权限，作为目标店铺 + Agent 的新起点配置（会覆盖目标现有配置的草稿，目标的运行历史不受影响）。
        </p>
        <div className="fdr-field">
          <label className="fdr-field__label">目标店铺</label>
          <select className="fdr-select" value={targetStore} onChange={(e) => setTargetStore(e.target.value)}>
            {DEMO_STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">目标 Agent</label>
          <select className="fdr-select" value={targetAgent} onChange={(e) => setTargetAgent(e.target.value)}>
            {allAgents.map((a) => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </select>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmReset}
        title="重置为默认配置"
        message={`将「${getStoreName(storeId)} · ${agent.name}」的 Prompt / Skill / Knowledge / 模型路由 / 工具权限重置为系统默认值，当前草稿会被覆盖（已发布的历史版本不受影响）。确认重置？`}
        confirmLabel="重置"
        danger
        onConfirm={() => {
          onChange(resetAgentConfigToDefault(agent.name, storeId));
          toast("配置已重置为默认值", "success");
        }}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}

export function AgentDetailView({ agent, storeId, config, onConfigChange, allAgents = [] }) {
  const { tab, navigate } = useConsoleNavContext();
  const activeTab = tab ?? "config";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>{agent.name}</h2>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{agent.role} · {getStoreName(storeId)}</p>
        </div>
        <DemoBadge />
      </div>

      <div style={{ marginBottom: 12 }}>
        <ConfigLifecycleToolbar agent={agent} storeId={storeId} allAgents={allAgents} onChange={onConfigChange} />
      </div>

      <Tabs
        tabs={TABS}
        activeTab={activeTab}
        onChange={(nextTab) => navigate("agentStudio", { subView: storeId, entityId: agent.name, tab: nextTab })}
      />

      {activeTab === "config" && (
        <ConfigTab agentName={agent.name} storeId={storeId} config={config} onChange={onConfigChange} navigate={navigate} />
      )}
      {activeTab === "promptLibrary" && <PromptLibraryTab />}
      {activeTab === "skillLibrary" && <SkillLibraryTab />}
      {activeTab === "knowledgeLibrary" && <KnowledgeLibraryTab />}
      {activeTab === "testEval" && (
        <TestEvalTab agentName={agent.name} storeId={storeId} config={config} onChange={onConfigChange} />
      )}
      {activeTab === "version" && <VersionTab agentName={agent.name} storeId={storeId} config={config} onChange={onConfigChange} />}
    </div>
  );
}
