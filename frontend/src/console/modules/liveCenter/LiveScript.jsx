import { useState } from "react";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { getAllTrends } from "../../mock/trendMock.js";
import { generateScript, getLiveState, insertTrendIntoScript } from "../../mock/liveMock.js";

export function LiveScript() {
  const toast = useToast();
  const [state, setState] = useState(() => getLiveState());
  const [selectedPlanId, setSelectedPlanId] = useState(() => state.plans[0]?.id ?? null);
  const [compareVersion, setCompareVersion] = useState(false);
  const blocks = state.scripts[selectedPlanId] ?? [];
  const trends = getAllTrends().slice(0, 3);

  return (
    <div>
      <div className="fdr-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="fdr-field" style={{ margin: 0, maxWidth: 320 }}>
            <label className="fdr-field__label">选择直播计划</label>
            <select className="fdr-select" value={selectedPlanId ?? ""} onChange={(e) => setSelectedPlanId(e.target.value)}>
              {state.plans.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={() => { setState(generateScript(selectedPlanId)); toast("已重新生成脚本", "success"); }}>
            {blocks.length ? "重新生成脚本" : "生成脚本"}
          </Button>
          <Button variant="ghost" onClick={() => setCompareVersion((v) => !v)}>{compareVersion ? "取消对比版本" : "对比版本"}</Button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <EmptyState icon="✎" message="该直播计划尚未生成脚本" />
      ) : (
        blocks.map((block) => (
          <div key={block.id} className="fdr-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{block.section}</strong>
              <div style={{ display: "flex", gap: 6 }}>
                <StatusPill tone={block.complianceStatus === "通过" ? "success" : "warning"}>{block.complianceStatus}</StatusPill>
                <StatusPill tone={block.risk === "低" ? "success" : block.risk === "中" ? "warning" : "danger"}>风险 {block.risk}</StatusPill>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0" }}>
              关联商品：{block.relatedProduct} · 时长 {block.durationMinutes} 分钟 · 知识来源：{block.knowledgeSource}
            </p>
            <p style={{ fontSize: 13, background: "var(--bg)", padding: "10px 12px", borderRadius: 8 }}>{block.scriptText}</p>
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)" }}>
              <span>建议主播动作：{block.suggestedHostAction}</span>
              <span>建议屏幕动作：{block.suggestedScreenAction}</span>
            </div>
            {compareVersion ? (
              <div className="fdr-card" style={{ background: "var(--bg)", marginTop: 10, marginBottom: 0 }}>
                <strong style={{ fontSize: 12 }}>历史版本对比（演示）</strong>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>v0：（旧版本占位文本，未接入真实版本存储）</p>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Button size="sm" variant="ghost" onClick={() => toast(`（演示）「${block.section}」环节已批准`, "success")}>批准</Button>
              {trends.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => { setState(insertTrendIntoScript(selectedPlanId, block.section, t.title)); toast(`已插入热点「${t.title}」`, "success"); }}
                >
                  插入热点：{t.title.slice(0, 8)}…
                </Button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
