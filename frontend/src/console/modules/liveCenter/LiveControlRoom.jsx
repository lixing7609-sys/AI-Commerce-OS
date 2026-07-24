import { useState } from "react";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useToast } from "../../kit/useToast.js";
import { getControlRoomRecommendations, getLiveState, triggerMockRecommendation } from "../../mock/liveMock.js";

export function LiveControlRoom() {
  const toast = useToast();
  const [state] = useState(() => getLiveState());
  const [triggering, setTriggering] = useState(null);
  const cr = state.controlRoom;
  const recs = getControlRoomRecommendations();
  const plan = state.plans.find((p) => p.id === cr.livePlanId);

  async function handleTrigger(rec) {
    setTriggering(rec.id);
    await triggerMockRecommendation(rec.id);
    setTriggering(null);
    toast(`（模拟）已执行建议：${rec.label}——未连接真实直播平台，不产生真实操作`, "success");
  }

  return (
    <div>
      <div className="fdr-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: 14 }}>{plan?.title ?? "演示直播间"}</strong>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
            所有指标与操作均为模拟数据，不会对任何真实直播间产生影响。
          </p>
        </div>
        <DemoBadge />
      </div>

      <StatGrid>
        <StatCard label="在线观众" value={cr.onlineViewers.toLocaleString()} />
        <StatCard label="新增观众" value={cr.newViewers} />
        <StatCard label="平均停留" value={`${cr.avgStaySeconds}秒`} />
        <StatCard label="评论数" value={cr.comments} />
        <StatCard label="商品点击" value={cr.productClicks} />
        <StatCard label="加购" value={cr.addToCart} />
        <StatCard label="订单数" value={cr.orders} />
        <StatCard label="GMV" value={`¥${cr.gmv.toLocaleString()}`} />
        <StatCard label="投流消耗" value={`¥${cr.adSpend}`} />
      </StatGrid>

      <div className="fdr-card">
        <h3 className="fdr-card__title">当前状态</h3>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, margin: 0 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>当前讲解商品</dt><dd style={{ margin: 0 }}>{cr.currentProduct}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>当前脚本环节</dt><dd style={{ margin: 0 }}>{cr.currentScriptSection}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>库存</dt><dd style={{ margin: 0 }}>{cr.inventory}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>优惠券状态</dt><dd style={{ margin: 0 }}>{cr.couponStatus}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>网络状态</dt><dd style={{ margin: 0 }}><StatusPill tone="success">{cr.networkStatus}</StatusPill></dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>音频状态</dt><dd style={{ margin: 0 }}><StatusPill tone="success">{cr.audioStatus}</StatusPill></dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>视频状态</dt><dd style={{ margin: 0 }}><StatusPill tone="success">{cr.videoStatus}</StatusPill></dd></div>
        </dl>
      </div>

      <div className="fdr-card" style={{ borderColor: cr.riskAlerts.length ? "var(--danger)" : undefined, background: cr.riskAlerts.length ? "rgba(239,68,68,.06)" : undefined }}>
        <h3 className="fdr-card__title">直播风控</h3>
        {cr.riskAlerts.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>当前没有风险预警</p>
        ) : (
          cr.riskAlerts.map((alert) => (
            <div key={alert} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusPill tone="danger">风险</StatusPill>
              <span style={{ fontSize: 13 }}>{alert}</span>
            </div>
          ))
        )}
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="secondary" onClick={() => toast("（模拟）已升级人工介入", "success")}>升级人工介入</Button>
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">AI 建议卡片</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recs.map((rec) => (
            <div key={rec.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--bg)", flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13 }}>{rec.label}</strong>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{rec.detail}</p>
              </div>
              <Button size="sm" variant="primary" disabled={triggering === rec.id} onClick={() => handleTrigger(rec)}>
                {triggering === rec.id ? "执行中…" : "模拟执行"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
