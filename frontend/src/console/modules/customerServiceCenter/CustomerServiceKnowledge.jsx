import { useMemo, useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getKnowledgeState, getScopeLabel } from "../../mock/knowledgeMock.js";

const CS_AGENT_NAMES = [
  "咨询受理Agent", "商品问答Agent", "订单查询Agent", "物流查询Agent", "销售转化Agent",
  "客户情绪Agent", "客服风控Agent", "会话总结Agent",
  "售后受理Agent", "规则匹配Agent", "责任判定Agent", "方案决策Agent", "沟通Agent", "执行Agent", "售后风控Agent", "售后复盘Agent",
];

/**
 * 客服 Knowledge——只做客服相关资产的筛选展示，正文编辑仍然统一
 * 在 Agent 工作室的 Knowledge 资产库完成，避免同一份编辑界面出现
 * 在两个地方（沿用 V4 P0-4 的架构原则）。
 */
export function CustomerServiceKnowledge() {
  const { navigate } = useConsoleNavContext();
  const [state] = useState(() => getKnowledgeState());

  const csAssets = useMemo(
    () => state.assets.filter((a) => a.linkedAgentIds.some((id) => CS_AGENT_NAMES.includes(id)) || a.type === "售后知识"),
    [state]
  );

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -8 }}>
        与客服相关的 Knowledge 资产（按绑定的客服 Agent 与"售后知识"类型筛选）。正文编辑请前往 Agent 工作室的 Knowledge 资产库。
      </p>
      <div className="fdr-card">
        {csAssets.length === 0 ? (
          <EmptyState icon="▤" message="暂无客服相关 Knowledge 资产" />
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "名称" },
              { key: "type", label: "类型" },
              { key: "scope", label: "绑定层级", render: (r) => <StatusPill tone={r.scope === "global" ? "neutral" : "info"}>{getScopeLabel(r.scope)}</StatusPill> },
              { key: "linkedAgentIds", label: "关联 Agent", render: (r) => r.linkedAgentIds.filter((id) => CS_AGENT_NAMES.includes(id)).join("、") || "—" },
              { key: "version", label: "版本", render: (r) => `v${r.version}` },
              { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "published" ? "success" : "neutral"}>{r.status === "published" ? "已发布" : "草稿"}</StatusPill> },
              { key: "updatedAt", label: "最近更新", render: (r) => new Date(r.updatedAt).toLocaleDateString("zh-CN") },
              {
                key: "actions",
                label: "操作",
                render: () => <Button size="sm" variant="ghost" onClick={() => navigate("agentStudio")}>在 Agent 工作室中打开 →</Button>,
              },
            ]}
            rows={csAssets}
          />
        )}
      </div>
    </div>
  );
}
