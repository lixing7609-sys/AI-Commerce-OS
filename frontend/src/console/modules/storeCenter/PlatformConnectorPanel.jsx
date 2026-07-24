import { useState } from "react";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { Modal } from "../../kit/Modal.jsx";
import { useToast } from "../../kit/useToast.js";
import { DEMO_STORES } from "../../mock/storesMock.js";
import {
  CAPABILITIES,
  getCapabilityStatusLabel,
  getCapabilityStatusTone,
  getPlatformConnectorState,
  simulateReconnect,
} from "../../mock/platformConnectorMock.js";

function CapabilityDetailModal({ open, onClose, matrix, capabilityKey, onReconnect, reconnecting }) {
  if (!matrix || !capabilityKey) return null;
  const capability = CAPABILITIES.find((c) => c.key === capabilityKey);
  const detail = matrix.capabilities[capabilityKey];

  return (
    <Modal
      open={open}
      title={`${matrix.storeName} · ${capability?.label}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => window.open("about:blank", "_blank", "noopener,noreferrer")}>打开平台（占位）</Button>
          <Button variant="primary" disabled={reconnecting} onClick={() => onReconnect(matrix.storeId, capabilityKey)}>
            {reconnecting ? "重新连接中…" : "模拟重新连接"}
          </Button>
        </>
      }
    >
      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>平台</dt><dd style={{ margin: 0 }}>{matrix.platform}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>账号</dt><dd style={{ margin: 0 }}>{matrix.account}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>店铺</dt><dd style={{ margin: 0 }}>{matrix.storeName}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>授权状态</dt><dd style={{ margin: 0 }}>{matrix.authorizationStatus}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>最近同步</dt><dd style={{ margin: 0 }}>{new Date(matrix.lastSyncAt).toLocaleString("zh-CN")}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>能力</dt><dd style={{ margin: 0 }}>{capability?.label}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>接入方式</dt><dd style={{ margin: 0 }}>{detail.accessMode}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>风险</dt><dd style={{ margin: 0 }}>{detail.risk}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>错误信息</dt><dd style={{ margin: 0 }}>{detail.error ?? "无"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>状态</dt><dd style={{ margin: 0 }}><StatusPill tone={getCapabilityStatusTone(detail.status)}>{getCapabilityStatusLabel(detail.status)}</StatusPill></dd></div>
      </dl>
    </Modal>
  );
}

export function PlatformConnectorPanel() {
  const toast = useToast();
  const [state, setState] = useState(() => getPlatformConnectorState());
  const [detailTarget, setDetailTarget] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);

  async function handleReconnect(storeId, capabilityKey) {
    setReconnecting(true);
    const next = await simulateReconnect(storeId, capabilityKey);
    setState(next);
    setReconnecting(false);
    toast("已模拟重新连接（演示，未连接真实平台）", "success");
  }

  return (
    <div className="fdr-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>统一平台连接器</h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            店铺中心 → 统一平台连接器 → 能力矩阵。内容中心/AI直播中心/广告中心/订单中心/客服中心共用同一份连接，不各自维护授权记录。
          </p>
        </div>
        <DemoBadge />
      </div>

      {DEMO_STORES.map((store) => {
        const matrix = state.matrix.find((m) => m.storeId === store.id);
        if (!matrix) return null;
        return (
          <div key={store.id} className="fdr-card" style={{ background: "var(--bg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>{store.name}</strong>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>最近同步：{new Date(matrix.lastSyncAt).toLocaleString("zh-CN")}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
              {CAPABILITIES.map((cap) => {
                const detail = matrix.capabilities[cap.key];
                return (
                  <button
                    key={cap.key}
                    type="button"
                    onClick={() => setDetailTarget({ storeId: store.id, capabilityKey: cap.key })}
                    style={{
                      textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
                      background: "var(--surface)", cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{cap.label}</div>
                    <StatusPill tone={getCapabilityStatusTone(detail.status)}>{getCapabilityStatusLabel(detail.status)}</StatusPill>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <CapabilityDetailModal
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        matrix={detailTarget ? state.matrix.find((m) => m.storeId === detailTarget.storeId) : null}
        capabilityKey={detailTarget?.capabilityKey}
        onReconnect={handleReconnect}
        reconnecting={reconnecting}
      />
    </div>
  );
}
