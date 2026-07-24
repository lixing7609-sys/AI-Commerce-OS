import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useToast } from "../../kit/useToast.js";
import { getStoreName } from "../../mock/storesMock.js";
import { claimOperatorRecommendation, getTrafficNetworkState } from "../../mock/trafficNetworkMock.js";

function ShortDramaFlow({ drama }) {
  return (
    <div className="fdr-card" style={{ background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>{drama.title}</strong>
        <StatusPill tone={drama.status === "连载中" ? "success" : "neutral"}>{drama.status}</StatusPill>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 8px 0" }}>
        {getStoreName(drama.storeId)} · {drama.category} · {drama.product} · 共 {drama.totalEpisodes} 集 · 已产出 {drama.clipsProduced} 条切片 · 流量 {drama.totalTraffic.toLocaleString()} · 收益 ${drama.totalRevenue}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {drama.flow.map((step, idx) => (
          <span key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="fdr-pill fdr-pill--info">{step}</span>
            {idx < drama.flow.length - 1 ? <span style={{ color: "var(--text-secondary)" }}>→</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ContentSupplyCenter() {
  const toast = useToast();
  const [state, setState] = useState(() => getTrafficNetworkState());

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -8 }}>
        内容供应中心不是内容中心——这里管理的是可复用的流量资产（原创短视频、AI短剧、直播切片、教育视频、图文、广告素材、品牌资产），供整张流量网络分发使用。
      </p>

      <div className="fdr-card">
        <h3 className="fdr-card__title">AI 短剧——流量网络的重要内容来源</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          AI 短剧不是独立业务，而是流量网络里的一种内容来源：短剧生产多条切片，进入流量网络分发给运营者账号，用于直播预热与广告，最终承接到订单。
        </p>
        {state.shortDramas.map((drama) => <ShortDramaFlow key={drama.id} drama={drama} />)}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">可复用流量资产</h3>
        <DataTable
          columns={[
            { key: "name", label: "资产名称" },
            { key: "assetType", label: "类型" },
            { key: "source", label: "来源" },
            { key: "storeId", label: "店铺", render: (r) => (r.storeId ? getStoreName(r.storeId) : "不绑定") },
            { key: "product", label: "关联商品", render: (r) => r.product ?? "—" },
            { key: "originality", label: "原创度" },
            { key: "authorization", label: "授权状态", render: (r) => <StatusPill tone={r.authorization.includes("已授权") || r.authorization === "无需授权" ? "success" : "warning"}>{r.authorization}</StatusPill> },
            { key: "reuseCount", label: "复用次数" },
            { key: "distributedCount", label: "已分发次数" },
            { key: "trafficGenerated", label: "带来流量", render: (r) => r.trafficGenerated.toLocaleString() },
            { key: "revenueGenerated", label: "带来收益", render: (r) => `$${r.revenueGenerated}` },
          ]}
          rows={state.contentSupplyAssets}
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">推荐给运营者的流量资产</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {state.operatorRecommendations.map((rec) => (
            <div key={rec.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--bg)", flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13 }}>{rec.assetName}</strong>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}> · {rec.assetType} · 推荐给 {rec.recommendedTo}</span>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{rec.reason}</p>
              </div>
              {rec.status === "已认领" ? (
                <StatusPill tone="success">已认领</StatusPill>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="sm" variant="primary" onClick={() => { setState(claimOperatorRecommendation(rec.id)); toast("已认领该流量资产", "success"); }}>认领</Button>
                  <Button size="sm" variant="secondary" onClick={() => toast("已生成定制方案（演示）", "success")}>定制</Button>
                  <Button size="sm" variant="ghost" onClick={() => toast("已关联商品（演示）", "success")}>关联商品</Button>
                  <Button size="sm" variant="ghost" onClick={() => toast("已加入发布排期（演示）", "success")}>排期发布</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
