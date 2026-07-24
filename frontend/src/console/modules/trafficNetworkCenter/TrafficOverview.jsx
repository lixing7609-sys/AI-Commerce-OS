import { useMemo } from "react";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { Button } from "../../kit/Button.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getTrafficAiRecommendations, getTrafficOverviewStats } from "../../mock/trafficNetworkMock.js";

export function TrafficOverview() {
  const { navigate } = useConsoleNavContext();
  const stats = useMemo(() => getTrafficOverviewStats(), []);
  const recommendations = useMemo(() => getTrafficAiRecommendations(), []);

  return (
    <div>
      <div className="fdr-card" style={{ background: "rgba(79,70,229,.06)" }}>
        <strong style={{ fontSize: 13 }}>核心理念</strong>
        <p style={{ fontSize: 13, marginBottom: 0 }}>
          流量不是一个池子，而是一张网络——每个账号、达人、直播、内容资产、广告账户和运营者，都是 AI Commerce Network 里的一个节点。
        </p>
      </div>

      <StatGrid>
        <StatCard label="管理账号总数" value={stats.totalAccounts} />
        <StatCard label="总粉丝数" value={stats.totalFollowers.toLocaleString()} />
        <StatCard label="月曝光量" value={stats.monthlyImpressions.toLocaleString()} />
        <StatCard label="月自然流量" value={stats.monthlyOrganicTraffic.toLocaleString()} />
        <StatCard label="月付费流量" value={stats.monthlyPaidTraffic.toLocaleString()} onClick={() => navigate("adCenter")} />
        <StatCard label="月直播流量" value={stats.monthlyLiveTraffic.toLocaleString()} onClick={() => navigate("liveCenter")} />
        <StatCard label="本周供给内容" value={stats.contentSuppliedThisWeek} onClick={() => navigate("trafficNetworkCenter", { subView: "supply" })} />
        <StatCard label="本周流量分发" value={stats.trafficDistributedThisWeek} onClick={() => navigate("trafficNetworkCenter", { subView: "distribution" })} />
        <StatCard label="接收流量的运营者" value={stats.operatorsReceivingTraffic} />
        <StatCard label="广告收入" value={`$${stats.advertisingRevenueUsd}`} onClick={() => navigate("trafficNetworkCenter", { subView: "revenue" })} />
        <StatCard label="内容授权收入" value={`$${stats.contentLicensingRevenueUsd}`} />
        <StatCard label="流量利用率" value={stats.trafficUtilization} />
      </StatGrid>

      <div className="fdr-card">
        <h3 className="fdr-card__title">表现最好的账号</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {stats.topPerformingAccounts.map((name) => (
            <span key={name} className="fdr-pill fdr-pill--info">{name}</span>
          ))}
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">AI 建议</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recommendations.map((rec) => (
            <div key={rec.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--bg)", flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13 }}>{rec.label}</strong>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{rec.detail}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate("trafficNetworkCenter", { subView: rec.targetSubView })}>去查看</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
