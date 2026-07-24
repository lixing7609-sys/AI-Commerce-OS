import { useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { Modal } from "../../kit/Modal.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { TrendLineChart } from "../../kit/ChartFrame.jsx";
import {
  getRefundableBalance,
  getTokenState,
  grantTokens,
  rechargeTokens,
  refundTokens,
} from "../../mock/tokenCenterMock.js";

const LEDGER_TYPE_LABEL = {
  grant_credit: "授予",
  manual_adjustment: "消耗/调整",
};

function OverviewView({ state, onChange, navigate }) {
  const toast = useToast();
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantAmount, setGrantAmount] = useState(5000);
  const [grantNote, setGrantNote] = useState("");

  const { account, ledger, pricing, burnTrend } = state;
  const lowBalance = account.available < account.lowBalanceThreshold;
  const refundable = getRefundableBalance(account);

  function handleGrant() {
    onChange(grantTokens(Number(grantAmount), grantNote));
    setGrantOpen(false);
    setGrantNote("");
    toast(`已授予 ${grantAmount} Token`, "success");
  }

  return (
    <div>
      <PageHeader
        title="Token 中心"
        subtitle="Founder Token 钱包 — 与广告钱包/RMB 账单严格分离"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <DemoBadge />
            <Button variant="secondary" onClick={() => navigate("tokenCenter", { subView: "refund" })}>
              余额退款
            </Button>
            <Button variant="secondary" onClick={() => navigate("tokenCenter", { subView: "recharge" })}>
              + 充值
            </Button>
            <Button variant="primary" onClick={() => setGrantOpen(true)}>
              Founder 授予
            </Button>
          </div>
        }
      />

      {lowBalance ? (
        <div className="fdr-card" style={{ borderColor: "var(--danger)", background: "rgba(239,68,68,.06)" }}>
          <StatusPill tone="danger">余额预警</StatusPill>{" "}
          <span style={{ fontSize: 13 }}>可用 Token（{account.available}）已低于预警线（{account.lowBalanceThreshold}），建议尽快授予/充值。</span>
        </div>
      ) : null}

      <StatGrid>
        <StatCard label="可用余额" value={account.available.toLocaleString()} />
        <StatCard label="冻结余额" value={account.reserved.toLocaleString()} />
        <StatCard label="可退余额" value={refundable.toLocaleString()} onClick={() => navigate("tokenCenter", { subView: "refund" })} />
        <StatCard label="今日消耗" value={account.todayConsumed.toLocaleString()} />
        <StatCard label="累计消耗" value={account.consumed.toLocaleString()} />
      </StatGrid>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>消耗趋势</h3>
          <DemoBadge />
        </div>
        <TrendLineChart data={burnTrend} xKey="date" series={[{ key: "consumed", label: "消耗 Token" }]} />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">账本</h3>
        <DataTable
          columns={[
            { key: "createdAt", label: "时间", render: (r) => new Date(r.createdAt).toLocaleString("zh-CN") },
            { key: "type", label: "类型", render: (r) => LEDGER_TYPE_LABEL[r.type] ?? r.type },
            { key: "amount", label: "数量", render: (r) => (
              <span style={{ color: r.amount >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                {r.amount >= 0 ? "+" : ""}{r.amount.toLocaleString()}
              </span>
            ) },
            { key: "note", label: "说明" },
          ]}
          rows={ledger}
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">供应商成本 vs 销售价 vs 毛利</h3>
        <DataTable
          columns={[
            { key: "model", label: "模型" },
            { key: "providerCostPer1k", label: "供应商成本/1K", render: (r) => `$${r.providerCostPer1k}` },
            { key: "sellingPricePer1k", label: "销售价/1K", render: (r) => `$${r.sellingPricePer1k}` },
            { key: "grossMarginPct", label: "毛利率", render: (r) => (
              <StatusPill tone={r.grossMarginPct >= 30 ? "success" : r.grossMarginPct >= 0 ? "warning" : "danger"}>
                {r.grossMarginPct}%
              </StatusPill>
            ) },
          ]}
          rows={pricing}
        />
      </div>

      <Modal
        open={grantOpen}
        title="Founder 授予"
        onClose={() => setGrantOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGrantOpen(false)}>取消</Button>
            <Button variant="primary" onClick={handleGrant}>确认授予</Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          Founder 授予是免费额度，不计入实付充值，不可退款。需要可退款的余额请使用「充值」。
        </p>
        <div className="fdr-field">
          <label className="fdr-field__label">数量</label>
          <input className="fdr-input" type="number" value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} />
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">备注</label>
          <input className="fdr-input" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="例如：月度补充" />
        </div>
      </Modal>
    </div>
  );
}

function RechargeView({ state, onChange, navigate }) {
  const toast = useToast();
  const [amount, setAmount] = useState(1000);
  const [method, setMethod] = useState("对公转账");
  const { account, rechargeHistory } = state;

  return (
    <div>
      <PageHeader
        title="Token 充值"
        subtitle="实付充值计入可退余额；与 Founder 授予（免费、不可退）区分记账"
        actions={<Button variant="ghost" onClick={() => navigate("tokenCenter")}>← 返回 Token 中心</Button>}
      />
      <div className="fdr-card">
        <StatGrid>
          <StatCard label="当前余额" value={account.available.toLocaleString()} />
        </StatGrid>
        <div className="fdr-field">
          <label className="fdr-field__label">充值数量</label>
          <input className="fdr-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">支付方式</label>
          <select className="fdr-select" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="对公转账">对公转账</option>
            <option value="支付宝">支付宝</option>
            <option value="微信支付">微信支付</option>
          </select>
        </div>
        <Button
          variant="primary"
          disabled={!amount || Number(amount) <= 0}
          onClick={() => {
            onChange(rechargeTokens(Number(amount), method));
            toast(`已充值 ${amount} Token`, "success");
            setAmount(1000);
          }}
        >
          确认充值
        </Button>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">充值记录</h3>
        <DataTable
          columns={[
            { key: "createdAt", label: "时间", render: (r) => new Date(r.createdAt).toLocaleString("zh-CN") },
            { key: "amount", label: "数量", render: (r) => `+${r.amount.toLocaleString()}` },
            { key: "method", label: "支付方式" },
            { key: "note", label: "说明" },
          ]}
          rows={rechargeHistory}
          emptyMessage={<EmptyState icon="◉" message="暂无充值记录" />}
        />
      </div>
    </div>
  );
}

function RefundView({ state, onChange, navigate }) {
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [refundMethod, setRefundMethod] = useState("原路退回");
  const { account, refundHistory, originalPaymentAccount } = state;
  const refundable = getRefundableBalance(account);

  return (
    <div>
      <PageHeader
        title="Token 余额退款"
        subtitle="只有实付充值中尚未消耗的部分可退，退款固定原路退回原支付账户"
        actions={<Button variant="ghost" onClick={() => navigate("tokenCenter")}>← 返回 Token 中心</Button>}
      />

      <div className="fdr-card">
        <StatGrid>
          <StatCard label="当前可用余额" value={account.available.toLocaleString()} />
          <StatCard label="冻结余额" value={account.reserved.toLocaleString()} />
          <StatCard label="可退余额" value={refundable.toLocaleString()} />
        </StatGrid>

        <div className="fdr-field">
          <label className="fdr-field__label">退款数量（不超过可退余额）</label>
          <input
            className="fdr-input"
            type="number"
            max={refundable}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">原支付账户</label>
          <input className="fdr-input" value={originalPaymentAccount} disabled />
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">退款方式</label>
          <select className="fdr-select" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
            <option value="原路退回">原路退回</option>
          </select>
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">预计到账时间</label>
          <input className="fdr-input" value="1-3 个工作日" disabled />
        </div>

        <div className="fdr-card" style={{ background: "var(--bg)", marginBottom: 16 }}>
          <strong style={{ fontSize: 13 }}>退款规则</strong>
          <ul style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8, paddingLeft: 18 }}>
            <li>只有实付充值中尚未消耗、尚未退款的余额可以退款。</li>
            <li>Founder 授予、营销赠送余额、测试额度、已消耗余额和冻结中余额均不可退款。</li>
            <li>退款一律原路退回原支付账户，不支持指定其他收款账户。</li>
            <li>Token 钱包与广告钱包完全独立，本次退款不影响广告钱包余额。</li>
          </ul>
        </div>

        <Button
          variant="primary"
          disabled={!amount || Number(amount) <= 0 || Number(amount) > refundable}
          onClick={() => {
            onChange(refundTokens(Number(amount), refundMethod));
            toast(`已发起退款 ${amount} Token 至原支付账户`, "success");
            setAmount(0);
          }}
        >
          退回原支付账户
        </Button>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">退款记录</h3>
        <DataTable
          columns={[
            { key: "createdAt", label: "时间", render: (r) => new Date(r.createdAt).toLocaleString("zh-CN") },
            { key: "amount", label: "数量", render: (r) => `-${r.amount.toLocaleString()}` },
            { key: "destination", label: "退款去向" },
            { key: "estimatedArrival", label: "预计到账" },
            { key: "status", label: "状态", render: () => <StatusPill tone="warning">处理中</StatusPill> },
          ]}
          rows={refundHistory}
          emptyMessage={<EmptyState icon="↩" message="暂无退款记录" />}
        />
      </div>
    </div>
  );
}

export function TokenCenterModule() {
  const { subView, navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getTokenState());
  const view = subView ?? "overview";

  if (view === "recharge") {
    return <RechargeView state={state} onChange={setState} navigate={navigate} />;
  }
  if (view === "refund") {
    return <RefundView state={state} onChange={setState} navigate={navigate} />;
  }
  return <OverviewView state={state} onChange={setState} navigate={navigate} />;
}
