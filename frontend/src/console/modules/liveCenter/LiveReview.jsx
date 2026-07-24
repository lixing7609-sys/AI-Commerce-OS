import { useState } from "react";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { Button } from "../../kit/Button.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getStoreName } from "../../mock/storesMock.js";
import { getLiveState } from "../../mock/liveMock.js";
import { createRepurposingTask } from "../../mock/contentMock.js";

export function LiveReview() {
  const toast = useToast();
  const { navigate } = useConsoleNavContext();
  const [state] = useState(() => getLiveState());
  const review = state.reviews[0];

  if (!review) {
    return <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>暂无已复盘的直播场次</p>;
  }

  function handleCreateContentFromClip(clipTitle) {
    createRepurposingTask({
      trendSource: `直播复盘 · ${review.livePlanTitle}`,
      trendSnapshot: clipTitle,
      sourceUrlPlaceholder: "https://mock.trend-source.example/live-clip",
      sourceType: "internal",
      referenceContent: "自有直播录像片段（已获店铺自身授权）",
      authorizationStatus: "已授权（自有内容）",
      storeId: state.plans[0]?.storeId,
      category: "防晒服",
      product: "轻薄防晒衣 SKU-SUN-001",
      targetAudience: "直播间高互动用户",
      creativeAngle: clipTitle,
      contentFormat: "直播切片",
      brandExpression: "直播原声，保留真实感",
      selfOwnedAssets: ["直播录像片段"],
      riskLevel: "低",
      promptVersion: "通用运营 Prompt v1",
      skillVersion: null,
      knowledgeVersion: null,
      model: "Claude Sonnet 5",
    });
    toast("已创建内容项目任务", "success");
    navigate("contentCenter", { subView: "repurposing" });
  }

  return (
    <div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">{review.livePlanTitle} · {getStoreName(review.storeId)}</h3>
        <StatGrid>
          <StatCard label="GMV" value={`¥${review.gmv.toLocaleString()}`} />
          <StatCard label="订单数" value={review.orders} />
          <StatCard label="转化率" value={review.conversionRate} />
          <StatCard label="商品点击" value={review.productClicks.toLocaleString()} />
          <StatCard label="平均停留" value={`${review.avgStaySeconds}秒`} />
          <StatCard label="峰值人数" value={review.peakViewers.toLocaleString()} />
          <StatCard label="投流消耗" value={`¥${review.adSpend}`} />
          <StatCard label="直播 ROI" value={review.liveRoi} />
        </StatGrid>
        <p style={{ fontSize: 13 }}>主播表现：{review.hostPerformance}</p>
        <p style={{ fontSize: 13 }}>退款预测：{review.refundPrediction} · 售后风险：{review.afterSalesRisk}</p>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">商品表现</h3>
        <DataTable
          columns={[
            { key: "product", label: "商品" },
            { key: "clicks", label: "点击" },
            { key: "orders", label: "订单" },
            { key: "gmv", label: "GMV", render: (r) => `¥${r.gmv.toLocaleString()}` },
          ]}
          rows={review.productPerformance}
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">AI 复盘输出</h3>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, margin: 0, fontSize: 13 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>高表现脚本片段</dt><dd style={{ margin: 0 }}>{review.aiOutputs.highPerformingScriptBlocks.join("；")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>高表现时刻</dt><dd style={{ margin: 0 }}>{review.aiOutputs.highPerformingMoments.join("；")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>高表现问答</dt><dd style={{ margin: 0 }}>{review.aiOutputs.highPerformingQA.join("；")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>建议下一场调整</dt><dd style={{ margin: 0 }}>{review.aiOutputs.recommendedNextPlan}</dd></div>
        </dl>

        <h4 style={{ fontSize: 13, marginTop: 16 }}>推荐直播切片（可转为内容项目）</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {review.aiOutputs.recommendedClips.map((clip) => (
            <div key={clip} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "var(--bg)" }}>
              <span style={{ fontSize: 13 }}>{clip}</span>
              <Button size="sm" variant="primary" onClick={() => handleCreateContentFromClip(clip)}>从切片创建内容项目</Button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Button size="sm" variant="secondary" onClick={() => toast("已创建广告素材候选", "success")}>创建广告素材候选</Button>
          <Button size="sm" variant="secondary" onClick={() => toast("已将问答加入知识库", "success")}>将问答加入知识库</Button>
          <Button size="sm" variant="secondary" onClick={() => toast("已将商品异议加入知识库", "success")}>将商品异议加入知识库</Button>
          <Button size="sm" variant="primary" onClick={() => { toast("已生成下一场直播计划草稿", "success"); navigate("liveCenter", { subView: "planning" }); }}>生成下一场直播计划</Button>
        </div>
      </div>
    </div>
  );
}
