import { useMemo } from "react";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { Button } from "../../kit/Button.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getAfterSalesAiRecommendations, getAfterSalesOverviewStats } from "../../mock/afterSalesMock.js";
import { getDailyCsAiRecommendations, getDailyCsAnalytics } from "../../mock/dailyCustomerServiceMock.js";

export function CustomerServiceOverview() {
  const { navigate } = useConsoleNavContext();
  const daily = useMemo(() => getDailyCsAnalytics(), []);
  const afterSales = useMemo(() => getAfterSalesOverviewStats(), []);
  const dailyRecs = useMemo(() => getDailyCsAiRecommendations(), []);
  const afterSalesRecs = useMemo(() => getAfterSalesAiRecommendations(), []);

  return (
    <div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">日常客服</h3>
        <StatGrid>
          <StatCard label="咨询量" value={daily.enquiryVolume} onClick={() => navigate("customerServiceCenter", { subView: "daily" })} />
          <StatCard label="首响时长" value={`${daily.firstResponseTimeSeconds}秒`} />
          <StatCard label="AI 解决率" value={daily.aiResolutionRate} />
          <StatCard label="人工接管率" value={daily.humanTakeoverRate} onClick={() => navigate("customerServiceCenter", { subView: "takeover" })} />
          <StatCard label="咨询转化率" value={daily.enquiryToOrderConversion} />
          <StatCard label="Agent 辅助 GMV" value={`$${daily.agentAssistedGmvUsd}`} />
          <StatCard label="推荐商品点击率" value={daily.recommendedProductClickRate} />
          <StatCard label="满意度" value={daily.satisfaction} />
          <StatCard label="超时风险会话" value={daily.timeoutRisk} />
        </StatGrid>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">售后客服</h3>
        <StatGrid>
          <StatCard label="今日新增售后" value={afterSales.newToday} onClick={() => navigate("customerServiceCenter", { subView: "afterSales" })} />
          <StatCard label="待处理" value={afterSales.pending} onClick={() => navigate("customerServiceCenter", { subView: "afterSales" })} />
          <StatCard label="即将超时" value={afterSales.nearTimeout} />
          <StatCard label="平台介入" value={afterSales.platformIntervention} />
          <StatCard label="待审批" value={afterSales.pendingApproval} onClick={() => navigate("approvalCenter")} />
          <StatCard label="退款金额" value={`¥${afterSales.refundAmount.toLocaleString()}`} />
          <StatCard label="售后率" value={afterSales.afterSalesRate} />
          <StatCard label="退款率" value={afterSales.refundRate} />
          <StatCard label="售后健康度" value={`${afterSales.healthScore}/100`} />
        </StatGrid>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">AI 建议</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...dailyRecs, ...afterSalesRecs].map((rec) => (
            <div key={rec.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--bg)", flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13 }}>{rec.label}</strong>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{rec.detail}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate("customerServiceCenter", { subView: "conversations" })}>去查看</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
