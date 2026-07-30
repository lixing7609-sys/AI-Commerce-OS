import { useState } from "react";
import { Tabs } from "../../../kit/Tabs.jsx";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { ApprovalCenterModule } from "../../../modules/approvalCenter/ApprovalCenterModule.jsx";
import { AutoOpsPage } from "./AutoOpsPage.jsx";

const TABS = [
  { key: "approvals", label: "审批" },
  { key: "autoOps", label: "自动经营" },
  { key: "team", label: "团队与权限" },
];

const TEAM_MEMBERS = [
  { id: "u1", name: "王经理", role: "运营主管", scope: "全部店铺", status: "active" },
  { id: "u2", name: "李客服", role: "客服专员", scope: "新城、淘宝旗舰店", status: "active" },
  { id: "u3", name: "张广告", role: "广告投手", scope: "新城", status: "active" },
  { id: "u4", name: "赵实习", role: "运营助理", scope: "演示店铺", status: "invited" },
];

const STATUS_LABEL = { active: "已激活", invited: "待接受邀请" };
const STATUS_TONE = { active: "success", invited: "warning" };

/**
 * Operator Lab · Organization (Charter §3.3) — the governance/ops-
 * control side of running the business: who can approve what
 * (Approvals), what runs automatically (Auto-Ops), and who has access
 * to which shops (Team & Permissions, net new — no prior implementation).
 */
export function OrganizationPage({ activeKey }) {
  const [tab, setTab] = useState(activeKey === "autoOps" ? "autoOps" : "approvals");

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "approvals" ? <ApprovalCenterModule /> : null}
      {tab === "autoOps" ? <AutoOpsPage /> : null}
      {tab === "team" ? (
        <div>
          <PageHeader title="团队与权限" subtitle="谁能访问哪些店铺、谁能审批哪些操作" actions={<DemoBadge />} />
          <div className="fdr-card">
            <DataTable
              columns={[
                { key: "name", label: "姓名" },
                { key: "role", label: "角色" },
                { key: "scope", label: "店铺范围" },
                { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
              ]}
              rows={TEAM_MEMBERS}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
