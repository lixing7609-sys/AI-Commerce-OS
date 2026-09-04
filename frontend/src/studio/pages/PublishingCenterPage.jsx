import { useState } from "react";
import { Tabs } from "./uiHelpers.jsx";
import { MatrixPublishPage } from "./MatrixAssetPages.jsx";
import { TrafficPoolPage, AdResourcesPage, AdOrdersPage } from "./TrafficAdPages.jsx";

const TABS = [
  { key: "publish", label: "发布" },
  { key: "traffic", label: "流量池" },
  { key: "adResources", label: "广告资源" },
  { key: "adOrders", label: "广告订单" },
];

/** Studio Lab · Publishing Center (Charter §3.4). */
export function PublishingCenterPage() {
  const [tab, setTab] = useState("publish");

  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "publish" ? <MatrixPublishPage /> : null}
      {tab === "traffic" ? <TrafficPoolPage /> : null}
      {tab === "adResources" ? <AdResourcesPage /> : null}
      {tab === "adOrders" ? <AdOrdersPage /> : null}
    </div>
  );
}
