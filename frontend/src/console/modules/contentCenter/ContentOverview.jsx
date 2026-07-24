import { useMemo } from "react";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { Button } from "../../kit/Button.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getContentAiRecommendations, getContentOverviewStats } from "../../mock/contentMock.js";

export function ContentOverview() {
  const { navigate } = useConsoleNavContext();
  const stats = useMemo(() => getContentOverviewStats(), []);
  const recommendations = useMemo(() => getContentAiRecommendations(), []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -8 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          回答一个问题："今天内容工作应该做什么？"
        </p>
        <Button size="sm" variant="ghost" onClick={() => navigate("trafficNetworkCenter", { subView: "supply" })}>
          高表现内容可分发到流量网络 →
        </Button>
      </div>

      <StatGrid>
        <StatCard label="今日发现热点" value={stats.todayTrendsFound} onClick={() => navigate("contentCenter", { subView: "trendRadar" })} />
        <StatCard label="推荐跟进热点" value={stats.recommendedTrends} onClick={() => navigate("contentCenter", { subView: "trendRadar" })} />
        <StatCard label="进行中的内容项目" value={stats.activeProjects} onClick={() => navigate("contentCenter", { subView: "projects" })} />
        <StatCard label="待审核内容" value={stats.pendingReview} onClick={() => navigate("contentCenter", { subView: "repurposing" })} />
        <StatCard label="待发布内容" value={stats.pendingPublish} onClick={() => navigate("contentCenter", { subView: "calendar" })} />
        <StatCard label="今日已发布" value={stats.publishedToday} />
        <StatCard label="发布失败" value={stats.publishFailed} />
        <StatCard label="今日内容成本" value={`$${stats.todayCostUsd}`} />
        <StatCard label="今日内容带来商品访问" value={stats.productVisits.toLocaleString()} />
        <StatCard label="今日内容成交" value={stats.productOrders} />
        <StatCard label="内容 ROI" value={stats.contentRoi} onClick={() => navigate("contentCenter", { subView: "performance" })} />
        <StatCard label="高表现内容" value={stats.highPerformingCount} />
        <StatCard label="即将过期热点" value={stats.expiringTrendsCount} onClick={() => navigate("contentCenter", { subView: "topicPool" })} />
      </StatGrid>

      <div className="fdr-card">
        <h3 className="fdr-card__title">AI 建议</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 10, background: "var(--bg)", flexWrap: "wrap",
              }}
            >
              <div>
                <strong style={{ fontSize: 13 }}>{rec.label}</strong>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{rec.detail}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate(rec.targetModule, { subView: rec.targetSubView })}>
                去处理
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
