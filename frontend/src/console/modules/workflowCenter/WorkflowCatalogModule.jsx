import { useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { FEATURED_WORKFLOW } from "../../../demoData/capabilityDemoData.js";

/**
 * Workflow 列表 + 简化流程画布——中文框架审查版新增（Workflow 中心
 * 交办要求："Workflow 列表 / 流程画布框架（不用真的做可视化编排
 * 引擎，一个简化的节点顺序展示即可）/ 节点列表 / 触发条件 / 执行
 * 记录 / 任务回放 / 失败节点 / 重试按钮 / 版本 / 发布"）。
 *
 * 自动化策略中心/回放中心/Studio Workflow 已经分别覆盖了"触发+动作
 * 配置""跨模块事件回放""内容生产阶段列表"，但都不是一个以
 * "Workflow"为主体、能看到节点顺序+失败节点+重试的目录页——这里补
 * 这一层，同时复用 FEATURED_WORKFLOW（库存预警→补货建议→Founder
 * 审批）作为与今日总览共用的锚点记录，不凭空发明一个不相关的示例。
 */
const WORKFLOWS = [
  {
    id: FEATURED_WORKFLOW.id,
    name: FEATURED_WORKFLOW.name,
    scope: "operator",
    status: FEATURED_WORKFLOW.status,
    version: "v1.4",
    published: true,
    successRate: FEATURED_WORKFLOW.successRate,
    lastRunAt: FEATURED_WORKFLOW.lastRunAt,
    nodes: [
      { id: "n1", name: "库存水位监测", type: "触发", trigger: "库存 ≤ 安全库存阈值", status: "success" },
      { id: "n2", name: "生成补货建议", type: "Agent 执行", trigger: "上一节点成功", status: "success" },
      { id: "n3", name: "Founder 审批", type: "人工审批", trigger: "建议金额 > ¥5,000", status: "failed" },
      { id: "n4", name: "同步采购系统", type: "Connector 调用", trigger: "审批通过", status: "pending" },
    ],
    runs: [
      { id: "r1", startedAt: new Date(Date.now() - 3600_000).toISOString(), result: "失败·节点3超时", durationMs: 4200 },
      { id: "r2", startedAt: new Date(Date.now() - 90000_000).toISOString(), result: "成功", durationMs: 3100 },
      { id: "r3", startedAt: new Date(Date.now() - 176400_000).toISOString(), result: "成功", durationMs: 2800 },
    ],
  },
  {
    id: "workflow-content-review-01",
    name: "内容生成 → 合规检查 → 发布",
    scope: "studio",
    status: "active",
    version: "v2.1",
    published: true,
    successRate: 0.97,
    lastRunAt: new Date(Date.now() - 7200_000).toISOString(),
    nodes: [
      { id: "n1", name: "生成短剧分镜脚本", type: "Agent 执行", trigger: "选题确认", status: "success" },
      { id: "n2", name: "分镜脚本质检 Skill", type: "Skill 调用", trigger: "上一节点成功", status: "success" },
      { id: "n3", name: "发布到内容平台", type: "Connector 调用", trigger: "质检通过", status: "success" },
    ],
    runs: [
      { id: "r1", startedAt: new Date(Date.now() - 7200_000).toISOString(), result: "成功", durationMs: 5600 },
      { id: "r2", startedAt: new Date(Date.now() - 93600_000).toISOString(), result: "成功", durationMs: 5200 },
    ],
  },
  {
    id: "workflow-refund-risk-01",
    name: "退款申请 → 风险评估 → 自动/人工处理",
    scope: "founder",
    status: "draft",
    version: "v0.3",
    published: false,
    successRate: 0.81,
    lastRunAt: null,
    nodes: [
      { id: "n1", name: "退款申请接入", type: "触发", trigger: "客户提交退款申请", status: "pending" },
      { id: "n2", name: "风险评估 Skill", type: "Skill 调用", trigger: "上一节点成功", status: "pending" },
      { id: "n3", name: "自动退款 / 转人工", type: "条件分支", trigger: "风险分 < 阈值 → 自动", status: "pending" },
    ],
    runs: [],
  },
];

const NODE_STATUS_TONE = { success: "success", failed: "danger", pending: "neutral" };
const NODE_STATUS_LABEL = { success: "成功", failed: "失败", pending: "未执行" };

function WorkflowCanvas({ nodes, onRetry, retryingId }) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, padding: "8px 0" }}>
      {nodes.map((node, idx) => (
        <div key={node.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              minWidth: 140,
              border: node.status === "failed" ? "1px solid var(--danger, #dc2626)" : "1px solid var(--border, #e5e7eb)",
              background: node.status === "failed" ? "rgba(220,38,38,.06)" : "var(--surface, #fff)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>{node.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", margin: "2px 0" }}>{node.type}</div>
            <StatusPill tone={NODE_STATUS_TONE[node.status]}>{NODE_STATUS_LABEL[node.status]}</StatusPill>
            {node.status === "failed" ? (
              <div style={{ marginTop: 6 }}>
                <Button size="sm" variant="danger" disabled={retryingId === node.id} onClick={() => onRetry(node)}>
                  {retryingId === node.id ? "重试中…" : "重试此节点"}
                </Button>
              </div>
            ) : null}
          </div>
          {idx < nodes.length - 1 ? <span style={{ fontSize: 16, color: "var(--text-secondary)" }}>→</span> : null}
        </div>
      ))}
    </div>
  );
}

function WorkflowDetail({ workflow, onBack, onTogglePublish }) {
  const toast = useToast();
  const [nodes, setNodes] = useState(workflow.nodes);
  const [retryingId, setRetryingId] = useState(null);
  const failedNode = nodes.find((n) => n.status === "failed");

  function handleRetry(node) {
    setRetryingId(node.id);
    setTimeout(() => {
      setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, status: "success" } : n)));
      setRetryingId(null);
      toast(`节点「${node.name}」已重新执行成功（本地演示，未触发真实调用）`, "success");
    }, 600);
  }

  return (
    <div>
      <Button variant="ghost" onClick={onBack} style={{ marginBottom: 12 }}>← 返回 Workflow 列表</Button>
      <PageHeader
        title={workflow.name}
        subtitle={`版本 ${workflow.version} · 成功率 ${Math.round(workflow.successRate * 100)}%`}
        actions={
          <Button variant={workflow.published ? "secondary" : "primary"} onClick={() => onTogglePublish(workflow.id)}>
            {workflow.published ? "下线该版本" : "发布该版本"}
          </Button>
        }
      />

      {failedNode ? (
        <div className="fdr-card" style={{ borderColor: "var(--danger, #dc2626)" }}>
          <StatusPill tone="danger">失败节点：{failedNode.name}</StatusPill>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0 0" }}>
            触发条件：{failedNode.trigger} —— 可在下方流程画布中点击「重试此节点」进行本地演示重试。
          </p>
        </div>
      ) : null}

      <div className="fdr-card">
        <h3 className="fdr-card__title">流程画布（简化节点顺序展示）</h3>
        <WorkflowCanvas nodes={nodes} onRetry={handleRetry} retryingId={retryingId} />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">节点列表 / 触发条件</h3>
        <DataTable
          columns={[
            { key: "name", label: "节点名称" },
            { key: "type", label: "节点类型" },
            { key: "trigger", label: "触发条件" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={NODE_STATUS_TONE[nodes.find((n) => n.id === r.id)?.status]}>{NODE_STATUS_LABEL[nodes.find((n) => n.id === r.id)?.status]}</StatusPill> },
          ]}
          rows={nodes}
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">执行记录 / 任务回放</h3>
        <DataTable
          columns={[
            { key: "startedAt", label: "开始时间", render: (r) => new Date(r.startedAt).toLocaleString("zh-CN") },
            { key: "result", label: "结果", render: (r) => <StatusPill tone={r.result === "成功" ? "success" : "danger"}>{r.result}</StatusPill> },
            { key: "durationMs", label: "耗时", render: (r) => `${r.durationMs}ms` },
            {
              key: "replay",
              label: "操作",
              render: () => <Button size="sm" variant="ghost" onClick={() => toast("已生成回放任务（本地演示，详见「回放中心」Tab）", "success")}>回放此次执行</Button>,
            },
          ]}
          rows={workflow.runs}
          emptyMessage={<EmptyState icon="↻" message="该 Workflow 尚未产生执行记录" />}
        />
      </div>
    </div>
  );
}

export function WorkflowCatalogModule({ scope = "all" }) {
  const [selectedId, setSelectedId] = useState(null);
  const [publishState, setPublishState] = useState(() => Object.fromEntries(WORKFLOWS.map((w) => [w.id, w.published])));

  const rows = (scope === "all" ? WORKFLOWS : WORKFLOWS.filter((w) => w.scope === scope)).map((w) => ({
    ...w,
    published: publishState[w.id],
  }));

  const selected = selectedId ? rows.find((w) => w.id === selectedId) : null;

  function togglePublish(id) {
    setPublishState((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (selected) {
    return <WorkflowDetail workflow={selected} onBack={() => setSelectedId(null)} onTogglePublish={togglePublish} />;
  }

  return (
    <div>
      <PageHeader title="Workflow 列表" subtitle="每个 Workflow 的节点顺序、触发条件、执行记录与发布状态" actions={<DemoBadge />} />
      <div className="fdr-card">
        {rows.length === 0 ? (
          <EmptyState icon="☲" message="该版本范围下暂无 Workflow 演示数据" />
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "名称" },
              { key: "scope", label: "适用版本" },
              { key: "status", label: "运行状态", render: (r) => <StatusPill tone={r.status === "active" || r.status === "running" ? "success" : r.status === "draft" ? "neutral" : "warning"}>{r.status}</StatusPill> },
              { key: "version", label: "版本" },
              { key: "published", label: "发布状态", render: (r) => <StatusPill tone={r.published ? "success" : "neutral"}>{r.published ? "已发布" : "未发布"}</StatusPill> },
              { key: "successRate", label: "成功率", render: (r) => `${Math.round(r.successRate * 100)}%` },
              { key: "lastRunAt", label: "最近执行", render: (r) => (r.lastRunAt ? new Date(r.lastRunAt).toLocaleString("zh-CN") : "—") },
            ]}
            rows={rows}
            onRowClick={(row) => setSelectedId(row.id)}
          />
        )}
      </div>
    </div>
  );
}
