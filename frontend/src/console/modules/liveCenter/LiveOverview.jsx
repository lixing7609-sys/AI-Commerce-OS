import { useMemo } from "react";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { LIVE_MODES, getLiveAiRecommendations, getLiveOverviewStats } from "../../mock/liveMock.js";

export function LiveOverview() {
  const { navigate } = useConsoleNavContext();
  const stats = useMemo(() => getLiveOverviewStats(), []);
  const recommendations = useMemo(() => getLiveAiRecommendations(), []);

  return (
    <div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">三种直播运营模式</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          {LIVE_MODES.map((mode) => (
            <div key={mode.key} className="fdr-card" style={{ background: "var(--bg)", marginBottom: 0, borderColor: mode.risk === "高" ? "var(--danger)" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>{mode.label}</strong>
                {mode.recommended ? <StatusPill tone="success">Founder Alpha 推荐</StatusPill> : <StatusPill tone={mode.risk === "高" ? "danger" : "warning"}>风险 {mode.risk}</StatusPill>}
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 0 }}>{mode.description}</p>
            </div>
          ))}
        </div>
      </div>

      <StatGrid>
        <StatCard label="今日直播场次" value={stats.todaySessions} onClick={() => navigate("liveCenter", { subView: "planning" })} />
        <StatCard label="待开播" value={stats.pendingStart} />
        <StatCard label="直播中" value={stats.live} />
        <StatCard label="已结束" value={stats.ended} />
        <StatCard label="今日直播GMV" value={`¥${stats.todayGmv.toLocaleString()}`} />
        <StatCard label="今日订单" value={stats.todayOrders} />
        <StatCard label="平均停留" value={`${stats.avgStaySeconds}秒`} />
        <StatCard label="商品点击率" value={stats.productClickRate} />
        <StatCard label="直播转化率" value={stats.liveConversionRate} />
        <StatCard label="投流消耗" value={`¥${stats.adSpend}`} />
        <StatCard label="直播ROI" value={stats.liveRoi} />
        <StatCard label="退款预测" value={stats.refundPrediction} />
        <StatCard label="风险预警" value={stats.riskAlerts} onClick={() => navigate("liveCenter", { subView: "controlRoom" })} />
        <StatCard label="待审批直播计划" value={stats.pendingApprovalPlans} onClick={() => navigate("approvalCenter")} />
        <StatCard label="流量网络直播账号" value="1" onClick={() => navigate("trafficNetworkCenter", { subView: "matrix" })} />
      </StatGrid>

      <div className="fdr-card">
        <h3 className="fdr-card__title">AI 建议</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recommendations.map((rec) => (
            <div key={rec.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--bg)", flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13 }}>{rec.label}</strong>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{rec.detail}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate("liveCenter", { subView: rec.targetSubView })}>去查看</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
