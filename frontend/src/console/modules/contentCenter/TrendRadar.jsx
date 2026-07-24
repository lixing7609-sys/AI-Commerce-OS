import { useState } from "react";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { DEMO_STORES, getStoreName } from "../../mock/storesMock.js";
import {
  addTopicFromTrend,
  getSourceMethodLabel,
  getTrendStageLabel,
  getTrendState,
  updateTrendStatus,
} from "../../mock/trendMock.js";
import { createRepurposingTask } from "../../mock/contentMock.js";

const RISK_TONE = { 低: "success", 中: "warning", 高: "danger" };

function TrendCard({ trend, onOpen }) {
  return (
    <div
      className="fdr-card"
      style={{ cursor: "pointer" }}
      onClick={() => onOpen(trend)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <strong style={{ fontSize: 14 }}>{trend.title}</strong>
            <StatusPill tone="info">{getTrendStageLabel(trend.stage)}</StatusPill>
            <StatusPill tone={RISK_TONE[trend.complianceRisk] ?? "neutral"}>合规风险 {trend.complianceRisk}</StatusPill>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
            来源：{trend.source} · {getSourceMethodLabel(trend.sourceMethod)} · 相关类目：{trend.relevantCategories.join("、")}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--primary)" }}>{trend.opportunityScore}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>机会分</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
        <span>热度 {trend.heatScore}</span>
        <span>增长 {trend.growthRate}%</span>
        <span>有效期 {trend.estimatedLifecycleHours}h</span>
        <span>状态 {trend.status}</span>
      </div>
    </div>
  );
}

function ScoreFactorBars({ factors }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 10 }}>
      <div>
        <h4 style={{ fontSize: 12, color: "var(--success)", marginBottom: 8 }}>正面因子</h4>
        {factors.positive.map((f) => (
          <div key={f.factor} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>{f.factor}</span><span>{f.value}</span>
            </div>
            <div style={{ height: 5, background: "var(--bg)", borderRadius: 999 }}>
              <div style={{ height: "100%", width: `${Math.min(100, f.value)}%`, background: "var(--success)", borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
      <div>
        <h4 style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>负面因子</h4>
        {factors.negative.map((f) => (
          <div key={f.factor} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>{f.factor}</span><span>{f.value}</span>
            </div>
            <div style={{ height: 5, background: "var(--bg)", borderRadius: 999 }}>
              <div style={{ height: "100%", width: `${Math.min(100, f.value)}%`, background: "var(--danger)", borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendDetail({ trend, onBack, onChange, navigate }) {
  const toast = useToast();
  const [showLogic, setShowLogic] = useState(false);

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回热点列表</button>
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: "0 0 6px 0" }}>{trend.title}</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              来源：{trend.source}（{getSourceMethodLabel(trend.sourceMethod)}） · 首次发现 {new Date(trend.firstDetectedAt).toLocaleString("zh-CN")} · 最近更新 {new Date(trend.lastUpdatedAt).toLocaleString("zh-CN")}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)" }}>{trend.opportunityScore}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>机会分</div>
          </div>
        </div>

        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginTop: 16 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>匹配店铺</dt><dd style={{ margin: 0 }}>{trend.relevantStores.map(getStoreName).join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>匹配品类</dt><dd style={{ margin: 0 }}>{trend.relevantCategories.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>关联商品</dt><dd style={{ margin: 0 }}>{trend.relevantProducts.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>目标受众</dt><dd style={{ margin: 0 }}>{trend.targetAudience}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>推荐内容</dt><dd style={{ margin: 0 }}>{trend.recommendedFormats.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>推荐渠道</dt><dd style={{ margin: 0 }}>{trend.recommendedChannels.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>有效期</dt><dd style={{ margin: 0 }}>{trend.recommendedWindow}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>阶段</dt><dd style={{ margin: 0 }}>{getTrendStageLabel(trend.stage)}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>竞争程度</dt><dd style={{ margin: 0 }}>{trend.competitionLevel}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>生产难度</dt><dd style={{ margin: 0 }}>{trend.productionDifficulty}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>预期商业价值</dt><dd style={{ margin: 0 }}>{trend.expectedCommercialValue}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>风险</dt><dd style={{ margin: 0 }}>
            版权 {trend.copyrightRisk} · 平台 {trend.platformRisk} · 合规 {trend.complianceRisk}
          </dd></div>
        </dl>

        {trend.complianceNote ? (
          <div className="fdr-card" style={{ background: "rgba(239,68,68,.06)", borderColor: "var(--danger)", marginTop: 12, marginBottom: 0 }}>
            <StatusPill tone="danger">合规提示</StatusPill> <span style={{ fontSize: 12 }}>{trend.complianceNote}</span>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Button
            variant="primary"
            onClick={() => {
              createRepurposingTask({
                trendSource: `${trend.source} · ${trend.title}`,
                trendSnapshot: trend.title,
                sourceUrlPlaceholder: "https://mock.trend-source.example/detail",
                sourceType: trend.sourceType,
                referenceContent: "（演示）仅参考选题信号，内容全部原创生产",
                authorizationStatus: "无需授权（仅参考选题信号）",
                storeId: trend.relevantStores[0],
                category: trend.relevantCategories[0],
                product: trend.relevantProducts[0],
                targetAudience: trend.targetAudience,
                creativeAngle: `围绕「${trend.title}」的二创方案`,
                contentFormat: trend.recommendedFormats[0],
                brandExpression: "沿用店铺品牌语气",
                selfOwnedAssets: [],
                riskLevel: trend.complianceRisk,
                promptVersion: "通用运营 Prompt v1",
                skillVersion: null,
                knowledgeVersion: null,
                model: "Claude Sonnet 5",
              });
              toast("已生成二创任务，可在二创工作台继续", "success");
              navigate("contentCenter", { subView: "repurposing" });
            }}
          >
            生成二创方案
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              addTopicFromTrend(trend);
              onChange();
              toast("已加入选题池", "success");
            }}
          >
            加入选题池
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              updateTrendStatus(trend.id, "已忽略");
              onChange();
              toast("已忽略该热点", "success");
            }}
          >
            忽略
          </Button>
          <Button variant="ghost" onClick={() => setShowLogic((v) => !v)}>
            {showLogic ? "收起匹配逻辑" : "查看匹配逻辑"}
          </Button>
        </div>

        {showLogic ? <ScoreFactorBars factors={trend.scoreFactors} /> : null}
      </div>
    </div>
  );
}

export function TrendRadar() {
  const { navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getTrendState());
  const [sourceType, setSourceType] = useState("external");
  const [storeFilter, setStoreFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [selectedTrend, setSelectedTrend] = useState(null);

  const list = sourceType === "external" ? state.externalTrends : state.internalSignals;
  const filtered = list.filter((t) => {
    if (storeFilter && !t.relevantStores.includes(storeFilter)) return false;
    if (riskFilter && t.complianceRisk !== riskFilter) return false;
    return true;
  }).sort((a, b) => b.opportunityScore - a.opportunityScore);

  if (selectedTrend) {
    const fresh = list.find((t) => t.id === selectedTrend.id) ?? selectedTrend;
    return (
      <TrendDetail
        trend={fresh}
        onBack={() => setSelectedTrend(null)}
        onChange={() => setState(getTrendState())}
        navigate={navigate}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" className={"fdr-btn " + (sourceType === "external" ? "fdr-btn--primary" : "fdr-btn--secondary")} onClick={() => setSourceType("external")}>
          A. 外部热点
        </button>
        <button type="button" className={"fdr-btn " + (sourceType === "internal" ? "fdr-btn--primary" : "fdr-btn--secondary")} onClick={() => setSourceType("internal")}>
          B. 内部经营信号
        </button>
      </div>

      <div className="fdr-card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
            <option value="">全部店铺</option>
            {DEMO_STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
            <option value="">全部合规风险</option>
            <option value="低">低风险</option>
            <option value="中">中风险</option>
            <option value="高">高风险</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="◎" message="当前筛选条件下暂无热点" />
      ) : (
        filtered.map((trend) => <TrendCard key={trend.id} trend={trend} onOpen={setSelectedTrend} />)
      )}
    </div>
  );
}
