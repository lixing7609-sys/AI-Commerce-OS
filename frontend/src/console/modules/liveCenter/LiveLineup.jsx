import { useState } from "react";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { PRODUCT_ROLES, generateLineup, getLiveState, reorderLineup } from "../../mock/liveMock.js";

const ROLE_TONE = { hero: "success", traffic: "info", welfare: "warning", profit: "neutral", carry: "neutral", clearance: "danger" };

export function LiveLineup() {
  const [state, setState] = useState(() => getLiveState());
  const [selectedPlanId, setSelectedPlanId] = useState(() => state.plans[0]?.id ?? null);
  const items = (state.lineups[selectedPlanId] ?? []).sort((a, b) => a.sequence - b.sequence);
  const plan = state.plans.find((p) => p.id === selectedPlanId);

  return (
    <div>
      <div className="fdr-card">
        <div className="fdr-field" style={{ margin: 0, maxWidth: 320 }}>
          <label className="fdr-field__label">选择直播计划</label>
          <select className="fdr-select" value={selectedPlanId ?? ""} onChange={(e) => setSelectedPlanId(e.target.value)}>
            {state.plans.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="fdr-card">
          <EmptyState icon="▤" message="该直播计划尚未生成排品" />
          <Button variant="primary" onClick={() => setState(generateLineup(selectedPlanId))}>生成排品</Button>
        </div>
      ) : (
        <>
          <div className="fdr-card" style={{ background: "rgba(79,70,229,.06)" }}>
            <strong style={{ fontSize: 13 }}>AI 排品说明</strong>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 0 }}>
              「{plan?.title}」采用「爆款开场承接流量 → 引流款持续曝光 → 清库存款处理积压库存 → 福利款收尾促单」的顺序，兼顾流量承接与库存周转。
            </p>
          </div>

          {items.map((item, idx) => (
            <div key={item.id} className="fdr-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-secondary)", minWidth: 28 }}>{item.sequence}</div>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <strong style={{ fontSize: 14 }}>{item.product}</strong>
                    <StatusPill tone={ROLE_TONE[item.role] ?? "neutral"}>{PRODUCT_ROLES.find((r) => r.key === item.role)?.label}</StatusPill>
                    {item.risk === "中" ? <StatusPill tone="warning">库存风险</StatusPill> : null}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                    {item.sku} · ¥{item.price} · {item.coupon} · 库存 {item.inventory} · 计划 {item.plannedMinutes} 分钟 · 脚本环节：{item.scriptSection}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                    预期点击 {item.expectedClicks.toLocaleString()} · 预期转化 {item.expectedConversion} · 预期 GMV ¥{item.expectedGmv.toLocaleString()} · 备用商品：{item.replacementProduct}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => setState(reorderLineup(selectedPlanId, item.id, "up"))}>↑ 上移</Button>
                <Button size="sm" variant="ghost" disabled={idx === items.length - 1} onClick={() => setState(reorderLineup(selectedPlanId, item.id, "down"))}>↓ 下移</Button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
