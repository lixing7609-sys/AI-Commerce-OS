import { useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { KeyValueList } from "../../kit/KeyValueList.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { Button } from "../../kit/Button.jsx";
import { FEATURED_AGENT, FEATURED_WORKFLOW, CAPABILITY_LIFECYCLE_STAGES } from "../../../demoData/capabilityDemoData.js";

/**
 * 能力目录——Agent/Prompt/Skill/Workflow 四类能力的统一清单，交办
 * 要求"Studio 范围能力/Operator 范围能力/Cloud 范围能力"直接用顶部
 * 版本范围过滤器过滤同一份目录，而不是分别再建三个 tab，所以这里
 * 只提供一份数据 + 按 `scope` prop 过滤，由 CapabilityCenterModule
 * 传入当前选中的版本范围。复用 FEATURED_AGENT/FEATURED_WORKFLOW
 * （与今日总览、补货建议共用同一条记录），Prompt/Skill 两类补充
 * 与 Prompt 中心/Skill 中心种子数据口径一致的示例条目。
 */
const CATALOG = [
  {
    id: FEATURED_AGENT.id,
    type: "Agent",
    name: FEATURED_AGENT.name,
    scope: FEATURED_AGENT.scope,
    stage: "观察",
    status: FEATURED_AGENT.status === "running" ? "运行中" : FEATURED_AGENT.status,
    version: FEATURED_AGENT.version,
    successRate: FEATURED_AGENT.successRate,
    costToday: FEATURED_AGENT.costToday,
  },
  {
    id: FEATURED_WORKFLOW.id,
    type: "Workflow",
    name: FEATURED_WORKFLOW.name,
    scope: FEATURED_WORKFLOW.scope,
    stage: "优化",
    status: FEATURED_WORKFLOW.status === "active" ? "已启用" : FEATURED_WORKFLOW.status,
    version: "v1.4",
    successRate: FEATURED_WORKFLOW.successRate,
    costToday: null,
  },
  {
    id: "prompt-restock-suggestion",
    type: "Prompt",
    name: "广告投放建议",
    scope: "founder",
    stage: "审批",
    status: "草稿",
    version: "v1",
    successRate: null,
    costToday: 0.6,
  },
  {
    id: "skill-restock-suggestion",
    type: "Skill",
    name: "库存补货建议",
    scope: "operator",
    stage: "测试",
    status: "草稿",
    version: "v1",
    successRate: 0.88,
    costToday: 0.2,
  },
  {
    id: "skill-script-qc",
    type: "Skill",
    name: "分镜脚本质检",
    scope: "studio",
    stage: "发布",
    status: "已发布",
    version: "v3",
    successRate: 0.95,
    costToday: 1.1,
  },
  {
    id: "workflow-content-review-01",
    type: "Workflow",
    name: "内容生成 → 合规检查 → 发布",
    scope: "studio",
    stage: "优化",
    status: "已启用",
    version: "v2.1",
    successRate: 0.97,
    costToday: 3.4,
  },
];

const STATUS_TONE = { 运行中: "success", 已发布: "success", 已启用: "success", 草稿: "neutral", 已停用: "warning" };
const TYPE_ICON = { Agent: "⚙", Prompt: "✎", Skill: "🧩", Workflow: "☲" };

export function CapabilityCatalogModule({ scope = "all" }) {
  const [selectedId, setSelectedId] = useState(null);
  const rows = scope === "all" ? CATALOG : CATALOG.filter((c) => c.scope === scope);
  const selected = selectedId ? CATALOG.find((c) => c.id === selectedId) : null;

  if (selected) {
    const stageIdx = CAPABILITY_LIFECYCLE_STAGES.indexOf(selected.stage);
    return (
      <div>
        <Button variant="ghost" onClick={() => setSelectedId(null)} style={{ marginBottom: 12 }}>← 返回能力目录</Button>
        <PageHeader title={`${TYPE_ICON[selected.type] ?? ""} ${selected.name}`} subtitle={`${selected.type} · 版本 ${selected.version}`} actions={<DemoBadge />} />
        <div className="fdr-card">
          <h3 className="fdr-card__title">生命周期进度</h3>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {CAPABILITY_LIFECYCLE_STAGES.map((stage, idx) => (
              <span
                key={stage}
                style={{
                  fontSize: 11,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: idx <= stageIdx ? "var(--primary, #4f46e5)" : "var(--canvas-subtle, #f1f2f6)",
                  color: idx <= stageIdx ? "#fff" : "var(--text-secondary)",
                }}
              >
                {idx + 1}. {stage}
              </span>
            ))}
          </div>
        </div>
        <div className="fdr-card">
          <KeyValueList
            items={[
              { label: "类型", value: selected.type },
              { label: "适用版本", value: selected.scope },
              { label: "状态", value: selected.status },
              { label: "当前版本", value: selected.version },
              { label: "成功率", value: selected.successRate != null ? `${Math.round(selected.successRate * 100)}%` : "—" },
              { label: "今日成本", value: selected.costToday != null ? `¥${selected.costToday.toFixed(2)}` : "—" },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="能力目录" subtitle="Agent / Prompt / Skill / Workflow 四类能力的统一清单，按版本范围过滤" actions={<DemoBadge />} />
      <div className="fdr-card">
        {rows.length === 0 ? (
          <EmptyState icon="◈" message="该版本范围下暂无能力记录" />
        ) : (
          <DataTable
            columns={[
              { key: "type", label: "类型", render: (r) => `${TYPE_ICON[r.type] ?? ""} ${r.type}` },
              { key: "name", label: "名称" },
              { key: "scope", label: "适用版本" },
              { key: "stage", label: "当前生命周期阶段" },
              { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
              { key: "version", label: "版本" },
              { key: "successRate", label: "成功率", render: (r) => (r.successRate != null ? `${Math.round(r.successRate * 100)}%` : "—") },
              { key: "costToday", label: "今日成本", render: (r) => (r.costToday != null ? `¥${r.costToday.toFixed(2)}` : "—") },
            ]}
            rows={rows}
            onRowClick={(row) => setSelectedId(row.id)}
          />
        )}
      </div>
    </div>
  );
}
