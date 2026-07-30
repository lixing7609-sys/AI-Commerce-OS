import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { TokenMeteringPage } from "../../../cloud/cloudPages.jsx";
import { TokenCenterModule } from "../tokenCenter/TokenCenterModule.jsx";

const TABS = [
  { key: "metering", label: "Token 计量（全平台）" },
  { key: "grants", label: "Token 中心（授予/充值）" },
];

/**
 * Cloud Center · Token (Charter §3.5) — merges the shared cloud
 * package's fleet-wide consumption view with Founder's own grant/
 * top-up console, since both are the one Token ledger from two angles.
 */
export function CloudTokenModule() {
  const [tab, setTab] = useState("metering");

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "metering" ? <TokenMeteringPage /> : null}
      {tab === "grants" ? <TokenCenterModule /> : null}
    </div>
  );
}
