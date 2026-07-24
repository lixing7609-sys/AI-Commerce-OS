import { useMemo, useState } from "react";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useToast } from "../../kit/useToast.js";
import { getAllTrends } from "../../mock/trendMock.js";
import { generateLiveClips, getLiveState, insertTrendIntoScript } from "../../mock/liveMock.js";

const SENSITIVE_KEYWORDS = ["政治", "灾难", "死亡", "未成年", "重大公共事件", "医疗功效"];

export function LiveTrendOpportunities() {
  const toast = useToast();
  const [state] = useState(() => getLiveState());
  const [addedIds, setAddedIds] = useState([]);
  const trends = useMemo(() => getAllTrends().sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 6), []);
  const activePlanId = state.plans[0]?.id;

  function isSensitive(trend) {
    return SENSITIVE_KEYWORDS.some((kw) => trend.title.includes(kw) || (trend.complianceNote ?? "").includes(kw)) || trend.complianceRisk === "高";
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -8 }}>
        涉及政治事件、灾难、死亡、未成年人、重大公共事件、医疗功效宣称或未经证实的突发事件的热点，一律阻断或转人工审批，不允许直接插入直播脚本。
      </p>
      {trends.map((trend) => {
        const sensitive = isSensitive(trend);
        const added = addedIds.includes(trend.id);
        return (
          <div key={trend.id} className="fdr-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <strong style={{ fontSize: 14 }}>{trend.title}</strong>
                  {sensitive ? <StatusPill tone="danger">需人工审批</StatusPill> : <StatusPill tone="success">可直接使用</StatusPill>}
                  {added ? <StatusPill tone="info">已加入本场脚本</StatusPill> : null}
                </div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                  与本场相关性：{trend.relevantCategories.join("、")} · 建议商品：{trend.relevantProducts.join("、")} · 有效期：{trend.recommendedWindow} · 风险：{trend.complianceRisk}
                </p>
                <p style={{ fontSize: 12, margin: "4px 0 0 0" }}>
                  建议插入话术：「{trend.title}」相关的开场钩子或互动话题
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Button
                size="sm"
                variant={sensitive ? "secondary" : "primary"}
                disabled={sensitive || added}
                onClick={() => {
                  insertTrendIntoScript(activePlanId, "预热", trend.title);
                  setAddedIds((prev) => [...prev, trend.id]);
                  toast("已加入本场直播脚本", "success");
                }}
              >
                加入本场脚本
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toast("已忽略该热点", "success")}>忽略</Button>
              {sensitive ? (
                <Button size="sm" variant="secondary" onClick={() => toast("已提交人工审批", "success")}>提交审批</Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const clips = generateLiveClips(activePlanId);
                  toast(`已创建 ${clips.length} 个直播切片选题任务`, "success");
                }}
              >
                创建直播切片选题
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
