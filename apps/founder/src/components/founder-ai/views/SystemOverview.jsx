import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";

const DETAIL_HINTS = {
  Founder: "AI 董事会 + 决策中心当前承载全部治理类事项，详情见「待决策」与「执行跟踪」。",
  Studio: "无限画布内容生产正常运行，详情见 Studio 独立工作台（跨产品链接）。",
  Growth: "机会雷达信号整体正常，一个机会置信度衰减需要关注。",
  Operator: "经营执行层运行正常，暂无异常。",
  Cloud: "设备心跳超时需要远程运维介入，详情见 Operator Cloud 独立工作台。",
};

export function SystemOverview() {
  const { systemOverview } = useFounderAI();
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="founder-ai-view-shell">
      <div className="founder-ai-system-grid">
        {systemOverview.map((sys) => (
          <div
            key={sys.id}
            className="sf-card founder-ai-system-card"
            onClick={() => setExpandedId(expandedId === sys.id ? null : sys.id)}
          >
            <div className="founder-ai-row-header">
              <h3>{sys.name}</h3>
              <span className={`sf-badge ${sys.status === "正常" ? "success" : "warn"}`}>{sys.status}</span>
            </div>
            <p className="founder-ai-meta">{sys.keyMetric}</p>
            <p className="founder-ai-meta">
              异常 {sys.anomalyCount} · 待处理 {sys.pendingCount} · 更新于 {sys.lastUpdated}
            </p>
            {expandedId === sys.id && <p className="founder-ai-ai-suggestion">{DETAIL_HINTS[sys.name]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
