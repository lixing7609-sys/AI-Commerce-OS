import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getStoreName } from "../../mock/storesMock.js";
import {
  AUTOMATION_MODES,
  CONVERSATION_STATES,
  TAKEOVER_ACTIONS,
  getDailyCsState,
  performTakeoverAction,
} from "../../mock/dailyCustomerServiceMock.js";
import { getAfterSalesState } from "../../mock/afterSalesMock.js";

const TAKEOVER_RELEVANT_STATES = ["建议人工接管", "等待人工接管", "人工处理中", "人工暂时离开"];

const STATE_TONE = {
  "AI 处理中": "info", "AI 等待信息": "neutral", "建议人工接管": "warning", "等待人工接管": "warning",
  "人工处理中": "info", "人工暂时离开": "warning", "已交还 AI": "neutral", "已完成": "success",
};

/**
 * 人工接管——日常客服 + 售后客服共用同一套接管语言（三种处理模式、
 * 七种状态、七个交接动作），AI 在人工接管后不消失，始终继续提供
 * 建议回复/背景信息辅助判断（阶段客服中心修正核心能力）。
 */
export function HumanTakeover() {
  const toast = useToast();
  const { navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getDailyCsState());
  const [running, setRunning] = useState(null);

  const needsTakeover = state.conversations.filter((c) => TAKEOVER_RELEVANT_STATES.includes(c.status));
  const afterSalesPending = getAfterSalesState().cases.filter((c) => ["待经营者确认", "平台介入"].includes(c.status));

  async function handleAction(id, actionKey, label) {
    setRunning(id + actionKey);
    await performTakeoverAction(id, actionKey);
    setRunning(null);
    setState(getDailyCsState());
    toast(`（演示）已执行：${label}`, "success");
  }

  return (
    <div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">三种处理模式</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {AUTOMATION_MODES.map((m) => (
            <div key={m.key} className="fdr-card" style={{ background: "var(--bg)", marginBottom: 0 }}>
              <strong style={{ fontSize: 13 }}>{m.label}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">会话状态</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CONVERSATION_STATES.map((s) => (
            <StatusPill key={s} tone={STATE_TONE[s] ?? "neutral"}>{s}</StatusPill>
          ))}
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">日常客服 · 需要人工关注</h3>
        {needsTakeover.length === 0 ? (
          <EmptyState icon="✓" message="当前没有需要人工接管的日常客服会话" />
        ) : (
          <DataTable
            columns={[
              { key: "customer", label: "客户" },
              { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
              { key: "conversationType", label: "咨询类型" },
              { key: "humanOwner", label: "人工负责人", render: (r) => r.humanOwner ?? "未指派" },
              { key: "status", label: "状态", render: (r) => <StatusPill tone={STATE_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
              {
                key: "actions",
                label: "操作",
                render: (r) => (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {TAKEOVER_ACTIONS.slice(0, 3).map((a) => (
                      <Button key={a.key} size="sm" variant="secondary" disabled={running === r.id + a.key} onClick={() => handleAction(r.id, a.key, a.label)}>
                        {a.label}
                      </Button>
                    ))}
                  </div>
                ),
              },
            ]}
            rows={needsTakeover}
          />
        )}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">售后客服 · 需要人工关注</h3>
        {afterSalesPending.length === 0 ? (
          <EmptyState icon="✓" message="当前没有需要人工关注的售后工单" />
        ) : (
          <DataTable
            columns={[
              { key: "buyer", label: "买家" },
              { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
              { key: "caseType", label: "工单类型" },
              { key: "status", label: "状态", render: (r) => <StatusPill tone="warning">{r.status}</StatusPill> },
              {
                key: "actions",
                label: "操作",
                render: () => (
                  <Button size="sm" variant="secondary" onClick={() => navigate("customerServiceCenter", { subView: "afterSales" })}>打开工单</Button>
                ),
              },
            ]}
            rows={afterSalesPending}
          />
        )}
      </div>
    </div>
  );
}
