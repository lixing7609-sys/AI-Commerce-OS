import { useMemo, useState } from "react";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";
import { Modal } from "../../../kit/Modal.jsx";
import { EmptyState } from "../../../kit/EmptyState.jsx";
import { useToast } from "../../../kit/useToast.js";
import { DEMO_STORES } from "../../../mock/storesMock.js";
import {
  addCustomerNote,
  getAllTags,
  getCustomer,
  getCustomerStats,
  getCustomers,
  getMemberLevelLabel,
  getRiskLabel,
  toggleRiskFlag,
} from "../mock/customersMock.js";

const ALL = "all";

function CustomerDetailModal({ customerId, onClose, onChanged }) {
  const toast = useToast();
  const [noteDraft, setNoteDraft] = useState("");
  const customer = customerId ? getCustomer(customerId) : null;
  if (!customer) return null;

  return (
    <Modal open={!!customerId} title={customer.name} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <StatusPill tone={customer.memberLevel === "gold" ? "success" : "neutral"}>{getMemberLevelLabel(customer.memberLevel)}会员</StatusPill>
        <StatusPill tone={customer.riskFlag === "watch" ? "warning" : "neutral"}>风险：{getRiskLabel(customer.riskFlag)}</StatusPill>
        <DemoBadge />
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, fontSize: 13, margin: 0 }}>
        <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>所属店铺</dt><dd style={{ margin: 0 }}>{customer.storeName}</dd></div>
        <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>联系电话</dt><dd style={{ margin: 0 }}>{customer.phone}</dd></div>
        <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>累计订单</dt><dd style={{ margin: 0 }}>{customer.totalOrders}</dd></div>
        <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>累计消费</dt><dd style={{ margin: 0 }}>¥{customer.totalSpend.toLocaleString()}</dd></div>
        <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>最近下单</dt><dd style={{ margin: 0 }}>{new Date(customer.lastOrderAt).toLocaleDateString("zh-CN")}</dd></div>
        <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>标签</dt><dd style={{ margin: 0 }}>{customer.tags.length ? customer.tags.join("、") : "无"}</dd></div>
      </dl>

      <div style={{ marginTop: 16 }}>
        <Button
          size="sm"
          variant={customer.riskFlag === "watch" ? "secondary" : "danger"}
          onClick={() => {
            toggleRiskFlag(customer.id);
            toast(customer.riskFlag === "watch" ? "已取消风险关注" : "已标记为需关注", "success");
            onChanged();
          }}
        >
          {customer.riskFlag === "watch" ? "取消风险关注" : "标记为需关注"}
        </Button>
      </div>

      <h4 style={{ fontSize: 13, margin: "16px 0 6px" }}>备注（{customer.notes.length}）</h4>
      {customer.notes.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>暂无备注</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {customer.notes.map((n) => (
            <li key={n.id}>{n.text}<span style={{ color: "var(--text-secondary)", fontSize: 11, marginLeft: 6 }}>{new Date(n.createdAt).toLocaleString("zh-CN")}</span></li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input className="fdr-input" style={{ flex: 1 }} placeholder="添加备注" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
        <Button
          size="sm"
          variant="primary"
          disabled={!noteDraft.trim()}
          onClick={() => {
            addCustomerNote(customer.id, noteDraft.trim());
            setNoteDraft("");
            toast("备注已添加", "success");
            onChanged();
          }}
        >
          添加
        </Button>
      </div>
    </Modal>
  );
}

export function CustomersPage() {
  const [storeId, setStoreId] = useState(ALL);
  const [search, setSearch] = useState("");
  const [riskOnly, setRiskOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [, forceRerender] = useState(0);
  const [loading, setLoading] = useState(false);

  const rows = useMemo(() => getCustomers({ storeId, search, riskOnly }), [storeId, search, riskOnly, forceRerender]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => getCustomerStats(storeId), [storeId, forceRerender]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = useMemo(() => getAllTags(), [forceRerender]); // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    forceRerender((n) => n + 1);
  }

  function simulateRefresh() {
    setLoading(true);
    window.setTimeout(() => {
      refresh();
      setLoading(false);
    }, 300);
  }

  return (
    <div>
      <PageHeader
        title="客户"
        subtitle="按店铺汇总的客户画像——复购、消费、风险标记，不是订单的附属视图"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DemoBadge />
            <Button size="sm" variant="secondary" onClick={simulateRefresh}>刷新</Button>
          </div>
        }
      />

      <StatGrid>
        <StatCard label="客户总数" value={stats.total} />
        <StatCard label="金卡会员" value={stats.gold} />
        <StatCard label="需关注" value={stats.atRisk} onClick={() => setRiskOnly(true)} />
        <StatCard label="累计消费" value={`¥${stats.totalSpend.toLocaleString()}`} />
      </StatGrid>

      <div className="fdr-card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select className="fdr-select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value={ALL}>全部店铺</option>
          {DEMO_STORES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input className="fdr-input" placeholder="搜索姓名 / 手机号" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={riskOnly} onChange={(e) => setRiskOnly(e.target.checked)} />
          只看需关注
        </label>
        {tags.length > 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>常见标签：{tags.slice(0, 4).join("、")}</span>
        ) : null}
      </div>

      <div className="fdr-card">
        {loading ? (
          <EmptyState icon="…" message="正在刷新客户数据" />
        ) : rows.length === 0 ? (
          <EmptyState icon="◐" message={search || riskOnly ? "没有匹配当前筛选条件的客户" : "该店铺暂无客户数据"} />
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "客户" },
              { key: "storeName", label: "店铺" },
              { key: "memberLevel", label: "会员等级", render: (r) => getMemberLevelLabel(r.memberLevel) },
              { key: "totalOrders", label: "累计订单" },
              { key: "totalSpend", label: "累计消费", render: (r) => `¥${r.totalSpend.toLocaleString()}` },
              { key: "lastOrderAt", label: "最近下单", render: (r) => new Date(r.lastOrderAt).toLocaleDateString("zh-CN") },
              { key: "riskFlag", label: "风险", render: (r) => <StatusPill tone={r.riskFlag === "watch" ? "warning" : "neutral"}>{getRiskLabel(r.riskFlag)}</StatusPill> },
              { key: "actions", label: "操作", render: (r) => <Button size="sm" variant="secondary" onClick={() => setSelectedId(r.id)}>详情</Button> },
            ]}
            rows={rows}
          />
        )}
      </div>

      {selectedId ? <CustomerDetailModal customerId={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} /> : null}
    </div>
  );
}
