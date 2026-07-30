import { useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { TrendLineChart } from "../../kit/ChartFrame.jsx";
import { useToast } from "../../kit/useToast.js";
import { FEATURED_AGENT, FEATURED_WORKFLOW } from "../../../demoData/capabilityDemoData.js";

/**
 * 能力中心的审批中心/发布中心/使用观察——都是"AI 能力"（Agent/
 * Prompt/Skill/Workflow）本身的生命周期动作，和 Founder 工作台里
 * 通用的业务审批中心（订单/退款等）是不同领域，所以不复用/不跳转
 * 到那个模块，这里单独实现一份轻量版本，数据规模不需要很大——
 * 只是让"审批中心/发布中心/使用观察"这三个交办要求的子板块在页面
 * 上真实存在，而不是链接到别处或留空。
 */

const APPROVAL_QUEUE = [
  { id: "ap1", type: "Prompt", name: "广告投放建议", requestedBy: "广告 Agent 维护者", reason: "新增变量 {{roas}}，需审批后发布", status: "pending" },
  { id: "ap2", type: "Skill", name: "库存补货建议", requestedBy: "运营团队", reason: "调整输出结构，新增 suggestedQty 字段", status: "pending" },
  { id: "ap3", type: "Workflow", name: FEATURED_WORKFLOW.name, requestedBy: "系统自动化", reason: "节点3人工审批阈值调整为 ¥5,000", status: "approved" },
];

const APPROVAL_STATUS_LABEL = { pending: "待审批", approved: "已批准", rejected: "已驳回" };
const APPROVAL_STATUS_TONE = { pending: "warning", approved: "success", rejected: "danger" };

export function CapabilityApprovalModule() {
  const toast = useToast();
  const [rows, setRows] = useState(APPROVAL_QUEUE);

  function decide(id, decision) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: decision } : r)));
    toast(decision === "approved" ? "已批准该能力变更" : "已驳回该能力变更", "success");
  }

  return (
    <div>
      <PageHeader title="审批中心" subtitle="Agent / Prompt / Skill / Workflow 变更的审批队列（能力域，非订单/退款等业务审批）" actions={<DemoBadge />} />
      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "type", label: "类型" },
            { key: "name", label: "名称" },
            { key: "requestedBy", label: "提交人" },
            { key: "reason", label: "变更说明" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={APPROVAL_STATUS_TONE[r.status]}>{APPROVAL_STATUS_LABEL[r.status]}</StatusPill> },
            {
              key: "actions",
              label: "操作",
              render: (r) =>
                r.status === "pending" ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <Button size="sm" variant="primary" onClick={() => decide(r.id, "approved")}>批准</Button>
                    <Button size="sm" variant="ghost" onClick={() => decide(r.id, "rejected")}>驳回</Button>
                  </div>
                ) : null,
            },
          ]}
          rows={rows}
          emptyMessage="暂无待处理的能力变更"
        />
      </div>
    </div>
  );
}

const RELEASE_QUEUE = [
  { id: "rl1", type: "Agent", name: FEATURED_AGENT.name, version: FEATURED_AGENT.version, status: "已发布", rolloutProgress: 100 },
  { id: "rl2", type: "Workflow", name: "内容生成 → 合规检查 → 发布", version: "v2.1", status: "灰度中", rolloutProgress: 60 },
  { id: "rl3", type: "Skill", name: "分镜脚本质检", version: "v3", status: "已发布", rolloutProgress: 100 },
  { id: "rl4", type: "Prompt", name: "广告投放建议", version: "v1", status: "草稿", rolloutProgress: 0 },
];
const RELEASE_STATUS_TONE = { 已发布: "success", 灰度中: "warning", 草稿: "neutral" };

export function CapabilityReleaseModule() {
  const toast = useToast();
  const [rows, setRows] = useState(RELEASE_QUEUE);

  function act(id, action) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (action === "publish") return { ...r, status: "已发布", rolloutProgress: 100 };
        if (action === "expand") return { ...r, rolloutProgress: Math.min(100, r.rolloutProgress + 20) };
        if (action === "rollback") return { ...r, status: "灰度中", rolloutProgress: 0 };
        return r;
      })
    );
    toast(
      action === "publish" ? `已发布「${rows.find((r) => r.id === id)?.name}」（演示）` :
      action === "expand" ? "已扩大灰度范围（演示）" : "已回滚（演示）",
      "success"
    );
  }

  return (
    <div>
      <PageHeader title="发布中心" subtitle="Agent / Prompt / Skill / Workflow 的版本发布、灰度与回滚" actions={<DemoBadge />} />
      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "type", label: "类型" },
            { key: "name", label: "名称" },
            { key: "version", label: "版本" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={RELEASE_STATUS_TONE[r.status]}>{r.status}</StatusPill> },
            { key: "rolloutProgress", label: "灰度进度", render: (r) => `${r.rolloutProgress}%` },
            {
              key: "actions",
              label: "操作",
              render: (r) => (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {r.status === "草稿" ? <Button size="sm" variant="primary" onClick={() => act(r.id, "publish")}>发布</Button> : null}
                  {r.status === "灰度中" ? <Button size="sm" variant="secondary" onClick={() => act(r.id, "expand")}>扩大灰度</Button> : null}
                  {r.status === "已发布" ? <Button size="sm" variant="ghost" onClick={() => act(r.id, "rollback")}>回滚</Button> : null}
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </div>
    </div>
  );
}

const USAGE_TREND = [
  { day: "周一", calls: 320, cost: 18.2 },
  { day: "周二", calls: 410, cost: 21.5 },
  { day: "周三", calls: 380, cost: 19.8 },
  { day: "周四", calls: 460, cost: 24.1 },
  { day: "周五", calls: 500, cost: 26.0 },
  { day: "周六", calls: 300, cost: 15.6 },
  { day: "周日", calls: 270, cost: 13.9 },
];
const TOP_CONSUMERS = [
  { id: "c1", name: FEATURED_AGENT.name, type: "Agent", calls: 1280, successRate: FEATURED_AGENT.successRate, costTotal: 86.8 },
  { id: "c2", name: "分镜脚本质检", type: "Skill", calls: 940, successRate: 0.95, costTotal: 51.2 },
  { id: "c3", name: FEATURED_WORKFLOW.name, type: "Workflow", calls: 210, successRate: FEATURED_WORKFLOW.successRate, costTotal: 34.5 },
];

export function CapabilityUsageModule() {
  const totalCalls = USAGE_TREND.reduce((s, d) => s + d.calls, 0);
  const totalCost = USAGE_TREND.reduce((s, d) => s + d.cost, 0);

  return (
    <div>
      <PageHeader title="使用观察" subtitle="全部 AI 能力近 7 天的调用量、成本趋势与高频消费方" actions={<DemoBadge />} />
      <StatGrid>
        <StatCard label="近7天调用量" value={totalCalls.toLocaleString()} />
        <StatCard label="近7天成本" value={`¥${totalCost.toFixed(2)}`} />
        <StatCard label="监控中的能力数" value={TOP_CONSUMERS.length} />
      </StatGrid>
      <div className="fdr-card">
        <h3 className="fdr-card__title">调用量趋势</h3>
        <TrendLineChart data={USAGE_TREND} xKey="day" series={[{ key: "calls", label: "调用次数" }]} />
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">高频消费方</h3>
        <DataTable
          columns={[
            { key: "name", label: "名称" },
            { key: "type", label: "类型" },
            { key: "calls", label: "调用次数" },
            { key: "successRate", label: "成功率", render: (r) => `${Math.round(r.successRate * 100)}%` },
            { key: "costTotal", label: "累计成本", render: (r) => `¥${r.costTotal.toFixed(2)}` },
          ]}
          rows={TOP_CONSUMERS}
        />
      </div>
    </div>
  );
}
