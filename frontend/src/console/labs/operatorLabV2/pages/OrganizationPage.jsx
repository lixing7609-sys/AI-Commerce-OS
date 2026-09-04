import { useState } from "react";
import { Tabs } from "../../../kit/Tabs.jsx";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Switch } from "../../../kit/Switch.jsx";
import { useToast } from "../../../kit/useToast.js";
import { ApprovalCenterModule } from "../../../modules/approvalCenter/ApprovalCenterModule.jsx";
import { AutoOpsPage } from "./AutoOpsPage.jsx";

const TABS = [
  { key: "approvals", label: "审批" },
  { key: "autoOps", label: "自动经营" },
  { key: "team", label: "团队与权限" },
];

const TEAM_MEMBERS = [
  { id: "u1", name: "王经理", role: "运营主管", scope: "全部店铺", permission: "全部权限（含财务）", status: "active" },
  { id: "u2", name: "李客服", role: "客服专员", scope: "抖音店A、淘宝店A", permission: "客服中心、订单查看", status: "active" },
  { id: "u3", name: "张广告", role: "广告投手", scope: "抖音店A", permission: "广告投放、营销中心", status: "active" },
  { id: "u4", name: "赵实习", role: "运营助理", scope: "小红书店A", permission: "商品中心（只读）", status: "invited" },
];

const AI_ROLES = [
  { id: "ai1", name: "Operator 秘书", responsibility: "汇总今日建议、经营异常与待审批事项", permission: "只读经营数据，不能自动下单/发货/退款", status: "running" },
  { id: "ai2", name: "补货建议 Agent", responsibility: "监控库存并生成补货建议", permission: "可生成建议，实际补货需人工确认", status: "running" },
  { id: "ai3", name: "广告投放 Agent", responsibility: "监控投放效果并生成预算调整建议", permission: "可生成建议，预算变更需人工批准", status: "running" },
  { id: "ai4", name: "客服自动应答 Agent", responsibility: "自动回复常见售前/售后问题", permission: "复杂/高风险问题自动转人工", status: "running" },
];

const ORG_ANOMALIES = [
  { id: "oa1", title: "「广告投手」张广告 7 天未登录", severity: "low" },
  { id: "oa2", title: "客服自动应答 Agent 近 24 小时误判率上升", severity: "medium" },
];

const STATUS_LABEL = { active: "已激活", invited: "待接受邀请", running: "运行中" };
const STATUS_TONE = { active: "success", invited: "warning", running: "success" };
const SEVERITY_LABEL = { high: "高", medium: "中", low: "低" };
const SEVERITY_TONE = { high: "danger", medium: "warning", low: "neutral" };

/**
 * Operator Lab · Organization (Charter §3.3) — the governance/ops-
 * control side of running the business: who can approve what
 * (Approvals), what runs automatically (Auto-Ops), and who has access
 * to which shops (Team & Permissions, net new — no prior implementation).
 */
export function OrganizationPage({ activeKey }) {
  const toast = useToast();
  const [tab, setTab] = useState(activeKey === "autoOps" ? "autoOps" : "approvals");
  const [manualTakeover, setManualTakeover] = useState(false);

  function handleTakeoverToggle(next) {
    setManualTakeover(next);
    toast(next ? "已开启人工接管——所有 AI 角色的自动执行已暂停，需人工逐项确认" : "已关闭人工接管，AI 角色恢复正常自动执行范围", next ? "warning" : "success");
  }

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "approvals" ? <ApprovalCenterModule /> : null}
      {tab === "autoOps" ? <AutoOpsPage /> : null}
      {tab === "team" ? (
        <div>
          <PageHeader
            title="团队与权限"
            subtitle="谁能访问哪些店铺、AI 角色负责什么、谁能审批哪些操作"
            actions={<DemoBadge />}
          />

          <StatGrid>
            <StatCard label="成员数" value={TEAM_MEMBERS.length} />
            <StatCard label="AI 角色数" value={AI_ROLES.length} />
            <StatCard label="异常事项" value={ORG_ANOMALIES.length} />
          </StatGrid>

          <div className="fdr-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 className="fdr-card__title" style={{ margin: 0 }}>人工接管</h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0" }}>
                  开启后，所有 AI 角色暂停自动执行，改为逐项生成建议等待人工确认
                </p>
              </div>
              <Switch checked={manualTakeover} onChange={handleTakeoverToggle} label={manualTakeover ? "已接管" : "AI 自动执行中"} />
            </div>
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">成员</h3>
            <DataTable
              columns={[
                { key: "name", label: "姓名" },
                { key: "role", label: "职责" },
                { key: "scope", label: "店铺范围" },
                { key: "permission", label: "权限" },
                { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
              ]}
              rows={TEAM_MEMBERS}
            />
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">AI 角色</h3>
            <DataTable
              columns={[
                { key: "name", label: "AI 角色" },
                { key: "responsibility", label: "职责" },
                { key: "permission", label: "权限" },
                { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{manualTakeover ? "已暂停（人工接管中）" : STATUS_LABEL[r.status]}</StatusPill> },
              ]}
              rows={AI_ROLES}
            />
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">异常事项</h3>
            {ORG_ANOMALIES.map((a) => (
              <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>{a.title}</strong>
                <StatusPill tone={SEVERITY_TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</StatusPill>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
