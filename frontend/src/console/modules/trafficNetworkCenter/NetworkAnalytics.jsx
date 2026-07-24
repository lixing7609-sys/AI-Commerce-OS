import { useMemo } from "react";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { ComparisonBarChart } from "../../kit/ChartFrame.jsx";
import { getNetworkAnalytics } from "../../mock/trafficNetworkMock.js";

export function NetworkAnalytics() {
  const analytics = useMemo(() => getNetworkAnalytics(), []);

  return (
    <div>
      <StatGrid>
        <StatCard label="流量→订单转化率" value={analytics.trafficToOrderConversion} />
        <StatCard label="流量→直播转化率" value={analytics.trafficToLiveConversion} />
        <StatCard label="流量→广告转化率" value={analytics.trafficToAdConversion} />
        <StatCard label="流量 ROI" value={analytics.trafficRoi} />
      </StatGrid>

      <div className="fdr-card">
        <h3 className="fdr-card__title">流量来源占比</h3>
        <ComparisonBarChart data={analytics.trafficSources} xKey="source" series={[{ key: "share", label: "占比 %", color: "#4F46E5" }]} />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">流量去向占比</h3>
        <ComparisonBarChart data={analytics.trafficDestinations} xKey="destination" series={[{ key: "share", label: "占比 %", color: "#22C55E" }]} />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">平台分布</h3>
        <ComparisonBarChart data={analytics.platformDistribution} xKey="platform" series={[{ key: "share", label: "占比 %", color: "#F59E0B" }]} />
      </div>

      <div className="fdr-card">
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, margin: 0, fontSize: 13 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>表现最好的账号</dt><dd style={{ margin: 0 }}>{analytics.topAccounts.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>表现最好的内容</dt><dd style={{ margin: 0 }}>{analytics.topContent.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>表现最好的短剧</dt><dd style={{ margin: 0 }}>{analytics.topShortDramas.join("、")}</dd></div>
        </dl>
      </div>
    </div>
  );
}
