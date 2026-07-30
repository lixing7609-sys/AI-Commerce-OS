import { useState } from "react";
import { Tabs } from "./uiHelpers.jsx";
import { StudioSettingsPage, PlatformConnectionsPage, NotificationsPermissionsPage } from "./PlatformPages.jsx";

const TABS = [
  { key: "settings", label: "设置" },
  { key: "connections", label: "平台连接" },
  { key: "notifications", label: "通知与权限" },
];

/**
 * Studio Lab · Settings (Charter §3.4). Platform Connections here are
 * Studio's own AI production connectors (per the Connector Principle,
 * distinct from Operator's business-facing platform connections and
 * Cloud's infrastructure connectors — see PlatformConnectionsPage).
 */
export function SettingsWorkbench() {
  const [tab, setTab] = useState("settings");

  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "settings" ? <StudioSettingsPage /> : null}
      {tab === "connections" ? <PlatformConnectionsPage /> : null}
      {tab === "notifications" ? <NotificationsPermissionsPage /> : null}
    </div>
  );
}
