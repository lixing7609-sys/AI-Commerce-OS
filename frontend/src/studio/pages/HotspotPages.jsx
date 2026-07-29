import { useState } from "react";
import { PLATFORM_SOURCES, getHotspotState, updateTopicStatus } from "../mock/hotspotMock.js";
import { Card, DemoBadge, Pill, Table } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { formatNumber } from "./formatters.js";

const LIFECYCLE_LABEL = { emerging: "萌芽期", peaking: "高峰期", declining: "衰退期" };
const LIFECYCLE_TONE = { emerging: "info", peaking: "success", declining: "neutral" };
const COMPETITION_LABEL = { low: "低", medium: "中", high: "高" };

/* ============================ 热点分析中心 ============================ */

export function HotspotAnalysisPage({ navigate }) {
  const { hotspots } = getHotspotState();
  const [platformFilter, setPlatformFilter] = useState("");
  const rows = platformFilter ? hotspots.filter((h) => h.sourcePlatform === platformFilter) : hotspots;

  return (
    <Card title="热点分析中心" action={<DemoBadge />}>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
        覆盖抖音/小红书/视频号/快手/B站/微博/红果/番茄/TikTok/YouTube/搜索关键词/行业热点/商品相关热点。演示阶段为 Mock 数据，字段结构可直接替换为真实平台 Connector。
      </p>
      <div className="st-filter-bar">
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
          <option value="">全部来源</option>
          {PLATFORM_SOURCES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((h) => (
          <div key={h.trendId} className="st-card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <b style={{ fontSize: 14 }}>{h.name}</b>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>{h.sourcePlatform} · 热度 {h.heatScore} · 增长 {h.growthRate > 0 ? "+" : ""}{h.growthRate}%</p>
              </div>
              <button type="button" className="st-btn st-btn--primary st-btn-sm" onClick={() => navigate("director", { openCreate: true, presetTrendId: h.trendId })}>创建内容项目</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
              <Pill tone={LIFECYCLE_TONE[h.lifecyclePhase]}>生命周期：{LIFECYCLE_LABEL[h.lifecyclePhase]}</Pill>
              <Pill tone="neutral">竞争程度：{COMPETITION_LABEL[h.competitionLevel]}</Pill>
              <Pill tone="neutral">风险：{h.riskNote}</Pill>
              <Pill tone="info">预计流量 {formatNumber(h.estimatedTraffic)}</Pill>
              {h.suitableForGraphic ? <Pill tone="success">适合图文</Pill> : null}
            </div>
            <div className="st-field-row" style={{ fontSize: 12 }}>
              <div><span style={{ color: "var(--text-secondary)" }}>适配内容类型</span><p style={{ margin: "2px 0 0" }}>{h.suitableContentTypes.join("、")}</p></div>
              <div><span style={{ color: "var(--text-secondary)" }}>推荐切入角度</span><p style={{ margin: "2px 0 0" }}>{h.recommendedAngle}</p></div>
              <div><span style={{ color: "var(--text-secondary)" }}>预计变现方式</span><p style={{ margin: "2px 0 0" }}>{h.estimatedMonetization}</p></div>
              {h.suitableForGraphic ? (
                <>
                  <div><span style={{ color: "var(--text-secondary)" }}>推荐图文平台</span><p style={{ margin: "2px 0 0" }}>{h.graphicPlatforms.join("、")}</p></div>
                  <div><span style={{ color: "var(--text-secondary)" }}>推荐图文类型</span><p style={{ margin: "2px 0 0" }}>{h.graphicFormats.join("、")}</p></div>
                  <div><span style={{ color: "var(--text-secondary)" }}>推荐关键词</span><p style={{ margin: "2px 0 0" }}>{h.recommendedKeywords.join("、")}</p></div>
                  <div><span style={{ color: "var(--text-secondary)" }}>收藏 / 转发 / 私域潜力</span><p style={{ margin: "2px 0 0" }}>{h.savePotential} / {h.sharePotential} / {h.privateTrafficPotential}</p></div>
                  <div><span style={{ color: "var(--text-secondary)" }}>推荐标题方向</span><p style={{ margin: "2px 0 0" }}>{h.recommendedTitleDirection}</p></div>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ============================ 趋势预测 ============================ */

export function TrendForecastPage() {
  const { trendForecasts } = getHotspotState();
  return (
    <Card title="趋势预测" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "topic", label: "题材/趋势" }, { key: "currentPhase", label: "当前阶段" },
          { key: "predictedPeakInDays", label: "预计达峰(天)" }, { key: "predictedDeclineInDays", label: "预计衰退(天)" },
          { key: "confidence", label: "置信度", render: (r) => `${Math.round(r.confidence * 100)}%` },
          { key: "recommendedAction", label: "建议动作" },
        ]}
        rows={trendForecasts}
      />
    </Card>
  );
}

/* ============================ 选题池 ============================ */

const TOPIC_STATUS_LABEL = { pending: "待评估", in_review: "评估中", approved: "已通过", rejected: "已驳回" };
const TOPIC_STATUS_TONE = { pending: "neutral", in_review: "warning", approved: "success", rejected: "danger" };

export function TopicPoolPage({ navigate }) {
  const [state, setState] = useState(() => getHotspotState());
  const [feedback, showFeedback] = useInlineFeedback();

  async function handleApprove(topicId) {
    const next = await updateTopicStatus(topicId, "approved");
    setState((s) => ({ ...s, topicPool: next.topicPool }));
    showFeedback("已批准该选题，可前往创建内容项目");
  }
  async function handleReject(topicId) {
    const next = await updateTopicStatus(topicId, "rejected");
    setState((s) => ({ ...s, topicPool: next.topicPool }));
    showFeedback("已驳回该选题");
  }

  return (
    <Card title="选题池" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <Table
        columns={[
          { key: "title", label: "选题" }, { key: "owner", label: "负责 Agent" },
          { key: "contentTypes", label: "适配内容类型", render: (r) => r.contentTypes.join("、") },
          { key: "priority", label: "优先级", render: (r) => <Pill tone={r.priority === "high" ? "danger" : r.priority === "medium" ? "warning" : "neutral"}>{{ high: "高", medium: "中", low: "低" }[r.priority]}</Pill> },
          { key: "status", label: "状态", render: (r) => <Pill tone={TOPIC_STATUS_TONE[r.status]}>{TOPIC_STATUS_LABEL[r.status]}</Pill> },
          {
            key: "actions", label: "操作", render: (r) => (
              <span className="st-btn-row">
                {r.status !== "approved" ? <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); handleApprove(r.topicId); }}>批准</button> : null}
                {r.status !== "rejected" ? <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); handleReject(r.topicId); }}>驳回</button> : null}
                {r.status === "approved" ? <button type="button" className="st-btn st-btn-sm st-btn--primary" onClick={(e) => { e.stopPropagation(); navigate("director", { openCreate: true, presetTrendId: r.sourceTrendId }); }}>创建项目</button> : null}
              </span>
            ),
          },
        ]}
        rows={state.topicPool}
      />
    </Card>
  );
}
