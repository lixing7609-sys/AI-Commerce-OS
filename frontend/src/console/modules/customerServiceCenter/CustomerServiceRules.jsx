import { useMemo, useState } from "react";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { getStoreName } from "../../mock/storesMock.js";
import { AFTER_SALES_AUTOMATION_EXAMPLES, getAfterSalesState } from "../../mock/afterSalesMock.js";

/**
 * 客服规则——日常客服与售后客服共用同一套规则优先级模型与自动化
 * 分级语言，售后场景的具体规则/风险案例完整保留（阶段客服中心
 * 修正：规则控制能力从原"售后中心 · 风险控制"标签页移入客服中心）。
 */
export function CustomerServiceRules() {
  const [nowTs] = useState(() => Date.now());
  const { cases } = useMemo(() => getAfterSalesState(), []);
  const highRisk = cases.filter((c) => c.riskLevel === "高");
  const nearDeadline = cases.filter((c) => new Date(c.deadline).getTime() - nowTs < 6 * 3600000 && new Date(c.deadline).getTime() > nowTs);

  return (
    <div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">规则优先级模型</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          日常客服与售后客服共用同一套优先级：平台强制规则 + 适用法律法规基线 &gt; 店铺政策 &gt; 类目政策 &gt; 商品专属政策 &gt; AI 建议。以下规则均为演示数据，不构成真实法律或平台依据。
        </p>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">自动化处理等级</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {AFTER_SALES_AUTOMATION_EXAMPLES.levels.map((l) => (
            <div key={l.key} style={{ fontSize: 12 }}>
              <StatusPill tone={l.key === "L0" ? "neutral" : l.key === "L4" ? "danger" : "info"}>{l.label}</StatusPill> {l.description}
            </div>
          ))}
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">自动处理策略示例</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <StatusPill tone="success">{AFTER_SALES_AUTOMATION_EXAMPLES.autoLowRisk.title}</StatusPill>
            <ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 18 }}>
              {AFTER_SALES_AUTOMATION_EXAMPLES.autoLowRisk.conditions.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
          <div>
            <StatusPill tone="danger">{AFTER_SALES_AUTOMATION_EXAMPLES.mandatoryApproval.title}</StatusPill>
            <ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 18 }}>
              {AFTER_SALES_AUTOMATION_EXAMPLES.mandatoryApproval.conditions.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 12, marginBottom: 0 }}>
          以上策略为演示数据，不构成真实法律或平台依据，不执行任何真实退款/换货/回复。
        </p>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">高风险售后案例</h3>
        {highRisk.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>当前没有高风险案例</p>
        ) : (
          highRisk.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,.06)", marginBottom: 8 }}>
              <div>
                <strong style={{ fontSize: 13 }}>{c.caseType} · {c.product}</strong>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{getStoreName(c.storeId)} · {c.orderNumber} · {c.reason}</p>
              </div>
              <StatusPill tone="danger">高风险</StatusPill>
            </div>
          ))
        )}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">临近超时售后案例</h3>
        {nearDeadline.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>当前没有临近超时的案例</p>
        ) : (
          nearDeadline.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "rgba(245,158,11,.08)", marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>{c.caseType} · {c.orderNumber}</span>
              <StatusPill tone="warning">{new Date(c.deadline).toLocaleString("zh-CN")} 前处理</StatusPill>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
