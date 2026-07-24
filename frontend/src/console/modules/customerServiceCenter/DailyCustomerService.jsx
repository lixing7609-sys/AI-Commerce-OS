import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { getStoreName } from "../../mock/storesMock.js";
import {
  AUTOMATION_MODES,
  CONVERSATION_TYPES,
  TAKEOVER_ACTIONS,
  getDailyCsAnalytics,
  getDailyCsState,
  performTakeoverAction,
} from "../../mock/dailyCustomerServiceMock.js";

const STATUS_TONE = {
  "AI 处理中": "info", "AI 等待信息": "neutral", "建议人工接管": "warning", "等待人工接管": "warning",
  "人工处理中": "info", "人工暂时离开": "warning", "已交还 AI": "neutral", "已完成": "success",
};

function ConversationDetail({ conversation, onBack, onChange }) {
  const toast = useToast();
  const [running, setRunning] = useState(null);

  async function handleAction(actionKey, label) {
    setRunning(actionKey);
    await performTakeoverAction(conversation.id, actionKey);
    setRunning(null);
    onChange();
    toast(`（演示）已执行：${label}`, "success");
  }

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回日常客服列表</button>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div>
          <div className="fdr-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0" }}>{conversation.customer} · {conversation.conversationType}</h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                  {conversation.platform} · {getStoreName(conversation.storeId)} · {conversation.product}
                  {conversation.orderNumber ? ` · 订单 ${conversation.orderNumber}` : ""}
                </p>
              </div>
              <StatusPill tone={STATUS_TONE[conversation.status] ?? "neutral"}>{conversation.status}</StatusPill>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {conversation.messages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: m.from === "customer" ? "flex-start" : "flex-end",
                    maxWidth: "80%",
                    background: m.from === "customer" ? "var(--bg)" : m.from === "system" ? "rgba(79,70,229,.08)" : "var(--primary)",
                    color: m.from === "agent" ? "#fff" : "var(--text)",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 13,
                  }}
                >
                  {m.text}
                </div>
              ))}
            </div>
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">人工接管 / AI 交接动作</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TAKEOVER_ACTIONS.map((a) => (
                <Button key={a.key} size="sm" variant="secondary" disabled={running === a.key} onClick={() => handleAction(a.key, a.label)}>
                  {running === a.key ? "处理中…" : a.label}
                </Button>
              ))}
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginTop: 14 }}>
              <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>负责 Agent</dt><dd style={{ margin: 0 }}>{conversation.responsibleAgent}</dd></div>
              <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>人工负责人</dt><dd style={{ margin: 0 }}>{conversation.humanOwner ?? "未指派"}</dd></div>
              <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>自动化模式</dt><dd style={{ margin: 0 }}>{AUTOMATION_MODES.find((m) => m.key === conversation.automationMode)?.label}</dd></div>
              <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>响应时限</dt><dd style={{ margin: 0 }}>{new Date(conversation.responseDeadline).toLocaleString("zh-CN")}</dd></div>
            </dl>
          </div>
        </div>

        <div className="fdr-card" style={{ background: "rgba(79,70,229,.04)" }}>
          <h3 className="fdr-card__title">AI 助手面板</h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
            人工接管后 AI 不会消失——始终提供建议回复与背景信息辅助人工判断。
          </p>
          <dl style={{ display: "grid", gap: 12, margin: 0 }}>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>建议回复</dt><dd style={{ margin: 0, fontSize: 13 }}>{conversation.suggestedReply ?? "暂无建议"}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>商品信息</dt><dd style={{ margin: 0, fontSize: 13 }}>{conversation.product}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>订单信息</dt><dd style={{ margin: 0, fontSize: 13 }}>{conversation.orderNumber ?? "本次咨询未关联订单"}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>平台规则</dt><dd style={{ margin: 0, fontSize: 13 }}>{conversation.platform}平台客服响应时效规则</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>知识来源</dt><dd style={{ margin: 0, fontSize: 13 }}>商品短视频脚本结构知识 · 售后沟通话术规范</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>客户情绪</dt><dd style={{ margin: 0 }}>
              <StatusPill tone={conversation.sentiment === "负面" ? "danger" : conversation.sentiment === "正面" ? "success" : "neutral"}>{conversation.sentiment}</StatusPill>
            </dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>风险提示</dt><dd style={{ margin: 0 }}>
              <StatusPill tone={conversation.riskLevel === "高" ? "danger" : conversation.riskLevel === "中" ? "warning" : "success"}>风险 {conversation.riskLevel}</StatusPill>
            </dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>建议下一步动作</dt><dd style={{ margin: 0, fontSize: 13 }}>
              {conversation.status === "建议人工接管" || conversation.status === "等待人工接管" ? "建议立即接管并安抚客户情绪" : "继续观察，AI 可自主处理"}
            </dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}

export function DailyCustomerService() {
  const [state, setState] = useState(() => getDailyCsState());
  const analytics = getDailyCsAnalytics();
  const [selectedId, setSelectedId] = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const selected = selectedId ? state.conversations.find((c) => c.id === selectedId) : null;
  const conversations = state.conversations.filter((c) => {
    if (typeFilter && c.conversationType !== typeFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  if (selected) {
    return <ConversationDetail conversation={selected} onBack={() => setSelectedId(null)} onChange={() => setState(getDailyCsState())} />;
  }

  return (
    <div>
      <StatGrid>
        <StatCard label="咨询量" value={analytics.enquiryVolume} />
        <StatCard label="首响时长" value={`${analytics.firstResponseTimeSeconds}秒`} />
        <StatCard label="AI 解决率" value={analytics.aiResolutionRate} />
        <StatCard label="人工接管率" value={analytics.humanTakeoverRate} />
        <StatCard label="咨询转化率" value={analytics.enquiryToOrderConversion} />
        <StatCard label="Agent 辅助 GMV" value={`$${analytics.agentAssistedGmvUsd}`} />
        <StatCard label="推荐商品点击率" value={analytics.recommendedProductClickRate} />
        <StatCard label="满意度" value={analytics.satisfaction} />
      </StatGrid>

      <div className="fdr-card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="fdr-select" style={{ maxWidth: 180 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">全部咨询类型</option>
            {CONVERSATION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            {Object.keys(STATUS_TONE).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "customer", label: "客户" },
            { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
            { key: "platform", label: "平台" },
            { key: "product", label: "关联商品" },
            { key: "conversationType", label: "咨询类型" },
            { key: "responsibleAgent", label: "负责 Agent" },
            { key: "riskLevel", label: "风险" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
          ]}
          rows={conversations}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyMessage={<EmptyState icon="✦" message="当前筛选条件下暂无会话" />}
        />
      </div>
    </div>
  );
}
