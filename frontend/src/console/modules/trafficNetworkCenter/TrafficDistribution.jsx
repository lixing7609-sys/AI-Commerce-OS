import { useState } from "react";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useToast } from "../../kit/useToast.js";
import { distributeAsset, getTrafficNetworkState } from "../../mock/trafficNetworkMock.js";

const STATUS_TONE = { 已完成: "success", 分发中: "info" };

export function TrafficDistribution() {
  const toast = useToast();
  const [state, setState] = useState(() => getTrafficNetworkState());
  const [distributing, setDistributing] = useState(null);

  async function handleDistribute(asset) {
    setDistributing(asset.id);
    await distributeAsset(asset.id, ["official", "matrix", "operator"]);
    setState(getTrafficNetworkState());
    setDistributing(null);
    toast(`「${asset.name}」已发起一对多分发`, "success");
  }

  return (
    <div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">一对多分发链路</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          原始内容 → 渠道变体 → 官方账号 → 矩阵账号 → 运营者账号 → 直播 → 广告 → 订单。全部为演示流程，不执行真实发布。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {state.contentSupplyAssets.slice(0, 4).map((asset) => (
            <Button
              key={asset.id}
              size="sm"
              variant="secondary"
              disabled={distributing === asset.id}
              onClick={() => handleDistribute(asset)}
            >
              {distributing === asset.id ? "分发中…" : `分发「${asset.name.slice(0, 10)}…」`}
            </Button>
          ))}
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">分发记录</h3>
        {state.distributionRecords.map((rec) => (
          <div key={rec.id} className="fdr-card" style={{ background: "var(--bg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>{rec.motherAssetName}</strong>
              <StatusPill tone={STATUS_TONE[rec.status] ?? "neutral"}>{rec.status}</StatusPill>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 8px 0" }}>
              {new Date(rec.distributedAt).toLocaleString("zh-CN")} · 带来流量 {rec.trafficGenerated.toLocaleString()}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {rec.chain.map((step, idx) => (
                <span key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="fdr-pill fdr-pill--neutral">{step}</span>
                  {idx < rec.chain.length - 1 ? <span style={{ color: "var(--text-secondary)" }}>→</span> : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
