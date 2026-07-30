import { useState } from "react";
import { Tabs } from "../../../kit/Tabs.jsx";
import SettingsPage from "../../../../operator-preview/pages/SettingsPage.jsx";
import ShopCenterContent from "../../../../shared/products/operator/ShopCenterContent.jsx";
import { STORE_DETAIL_EXTRA_TABS } from "../../../modules/storeCenter/storeDetailExtraTabs.jsx";
import { StoreConnectionCenter } from "../../StoreConnectionCenter.jsx";

const TABS = [
  { key: "settings", label: "设置" },
  { key: "shops", label: "店铺管理" },
  { key: "connections", label: "平台连接" },
];

/**
 * Operator Lab · Settings (Charter §3.3) — general settings, shop
 * management, and platform connections in one place. Platform
 * connections stay business-facing only ("Connect Taobao/Douyin/
 * Xiaohongshu" — StoreConnectionCenter is already this abstraction,
 * distinct from Founder's diagnostic connector overlay), per the
 * Connector Principle: Operator never sees technical connectors.
 */
export function SettingsWorkbenchPage({ activeKey }) {
  const [tab, setTab] = useState(
    activeKey === "shops" ? "shops" : activeKey === "connections" ? "connections" : "settings"
  );

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "settings" ? <SettingsPage /> : null}
      {tab === "shops" ? <ShopCenterContent extraDetailTabs={STORE_DETAIL_EXTRA_TABS} /> : null}
      {tab === "connections" ? <StoreConnectionCenter /> : null}
    </div>
  );
}
