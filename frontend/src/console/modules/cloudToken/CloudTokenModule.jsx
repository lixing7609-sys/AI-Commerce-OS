import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { TokenMeteringPage } from "../../../cloud/cloudPages.jsx";
import { TokenCenterModule } from "../tokenCenter/TokenCenterModule.jsx";
import { getFeaturedDevice, getFeaturedOperatorFleetEntry } from "../../../demoData/cloudDemoData.js";

const TABS = [
  { key: "metering", label: "Token 计量（全平台）" },
  { key: "grants", label: "Token 中心（授予/充值）" },
];

/**
 * Cloud Center · Token (Charter §3.5) — merges the shared cloud
 * package's fleet-wide consumption view with Founder's own grant/
 * top-up console, since both are the one Token ledger from two angles.
 *
 * 关联设备卡片取自 demoData/cloudDemoData.js 的锚点设备（与设备管理/
 * OTA更新/许可证/系统监控/日志中心共用同一台 mac-mini-op-0001），
 * 让"同一台设备在 Token 中心也能对上号"这条审查要求可验证。
 */
function AnchorDeviceCard() {
  const device = getFeaturedDevice();
  const operatorEntry = getFeaturedOperatorFleetEntry();
  if (!device) return null;
  return (
    <div className="fdr-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="fdr-card__title" style={{ margin: 0 }}>关联设备（跨页面锚点）</h3>
        <DemoBadge />
      </div>
      <p style={{ fontSize: 13, margin: "8px 0 0 0" }}>
        设备 <strong>{device.id}</strong> · 型号 {device.model} · 归属 Operator <strong>{operatorEntry?.name}</strong> · 当前版本 {device.systemVersion} · Token 余额 {device.tokenBalance.toLocaleString()}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
        与设备管理 / OTA 更新 / 许可证 / 系统监控 / 日志中心中出现的是同一台设备与同一个 Operator，可交叉核对。
      </p>
    </div>
  );
}

export function CloudTokenModule() {
  const [tab, setTab] = useState("metering");

  return (
    <div>
      {tab === "metering" ? (
        <PageHeader title="Token 中心" subtitle="Token 计量（全平台）与 Token 授予 / 充值 / 退款——同一份 Token 账本的两个视角" actions={<DemoBadge />} />
      ) : null}
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      <AnchorDeviceCard />
      {tab === "metering" ? <TokenMeteringPage /> : null}
      {tab === "grants" ? <TokenCenterModule /> : null}
    </div>
  );
}
