import { useState } from "react";
import { getStudioLabState } from "../../../studio/mock/studioAgentMock.js";
import { PageHeader, DataTable, StatusPill, useToast } from "../../kit/index.js";

function FounderStudioLabBadge() {
  return <StatusPill tone="info">Founder · Studio 实验室</StatusPill>;
}

/* ============================ 运行日志 ============================ */

export function StudioLogsModule() {
  const { runLogs, agents } = getStudioLabState();
  const [agentFilter, setAgentFilter] = useState("");
  const rows = agentFilter ? runLogs.filter((l) => l.agentId === agentFilter) : runLogs;

  return (
    <div>
      <PageHeader title="运行日志" subtitle="全部 Studio Agent 的执行日志，可按 Agent 过滤" actions={<FounderStudioLabBadge />} />
      <div className="fdr-filter-bar" style={{ marginBottom: 12 }}>
        <select className="fdr-select" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
          <option value="">全部 Agent</option>
          {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
        </select>
      </div>
      <DataTable
        columns={[
          { key: "agentName", label: "Agent" }, { key: "message", label: "日志内容" },
          { key: "level", label: "级别", render: (r) => <StatusPill tone={r.level === "warning" ? "warning" : "neutral"}>{r.level === "warning" ? "警告" : "信息"}</StatusPill> },
          { key: "tokenCost", label: "Token", render: (r) => r.tokenCost.toLocaleString() },
          { key: "durationMs", label: "耗时", render: (r) => `${r.durationMs}ms` },
          { key: "at", label: "时间", render: (r) => new Date(r.at).toLocaleString("zh-CN") },
        ]}
        rows={rows}
      />
    </div>
  );
}

/* ============================ 成本分析 ============================ */

export function StudioCostsModule() {
  const { agents, runLogs } = getStudioLabState();
  const totalAgentCost = agents.reduce((sum, a) => sum + a.cost, 0);
  const totalLogCost = runLogs.reduce((sum, l) => sum + l.tokenCost, 0);
  const topSpenders = [...agents].sort((a, b) => b.cost - a.cost).slice(0, 10);

  return (
    <div>
      <PageHeader title="成本分析" subtitle="按 Agent 汇总模型调用成本，识别高成本项" actions={<FounderStudioLabBadge />} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        <div className="fdr-stat-card"><p className="fdr-stat-card__label">Agent 累计成本</p><div className="fdr-stat-card__value">¥{totalAgentCost.toFixed(2)}</div></div>
        <div className="fdr-stat-card"><p className="fdr-stat-card__label">运行日志累计 Token</p><div className="fdr-stat-card__value">{totalLogCost.toLocaleString()}</div></div>
      </div>
      <DataTable
        columns={[
          { key: "name", label: "Agent" }, { key: "cost", label: "累计成本", render: (r) => `¥${r.cost}` },
          { key: "successRate", label: "成功率", render: (r) => `${r.successRate}%` }, { key: "latencyMs", label: "平均延迟", render: (r) => `${r.latencyMs}ms` },
        ]}
        rows={topSpenders}
      />
    </div>
  );
}

/* ============================ 版本与发布 ============================ */

export function StudioReleasesModule() {
  const { releases } = getStudioLabState();
  const showToast = useToast();

  return (
    <div>
      <PageHeader title="版本与发布" subtitle="Prompt Pack / Skill Pack / Model Routing Policy / Platform Rule Pack / Studio Workflow Pack / 内容模板包" actions={<FounderStudioLabBadge />} />
      <DataTable
        columns={[
          { key: "packType", label: "类型" }, { key: "name", label: "名称" }, { key: "version", label: "版本号" },
          { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "已发布" ? "success" : r.status === "灰度中" ? "warning" : "neutral"}>{r.status}</StatusPill> },
          { key: "rolloutProgress", label: "灰度进度", render: (r) => `${r.rolloutProgress}%` },
          {
            key: "actions", label: "操作", render: (r) => (
              <span style={{ display: "flex", gap: 6 }}>
                {r.status === "灰度中" ? <button type="button" className="fdr-btn" onClick={(e) => { e.stopPropagation(); showToast(`已扩大 ${r.name} 灰度范围（演示）`, "success"); }}>扩大灰度</button> : null}
                {r.status === "草稿" ? <button type="button" className="fdr-btn" onClick={(e) => { e.stopPropagation(); showToast(`已发布 ${r.name}（演示）`, "success"); }}>发布</button> : null}
                {r.status === "已发布" ? <button type="button" className="fdr-btn" onClick={(e) => { e.stopPropagation(); showToast(`已回滚 ${r.name}（演示）`, "default"); }}>回滚</button> : null}
              </span>
            ),
          },
        ]}
        rows={releases}
      />
      <p style={{ fontSize: 12, color: "var(--fdr-text-secondary)", marginTop: 12 }}>安装状态为占位展示——本轮未接入真实的包分发/安装执行系统。</p>
    </div>
  );
}
