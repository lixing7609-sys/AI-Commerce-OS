import { useState } from "react";
import { Tabs } from "./uiHelpers.jsx";
import { BrandGuidelinesPage } from "./PlatformPages.jsx";
import { BrandDealsPage, IpLicensingPage } from "./MonetizationPages.jsx";

const TABS = [
  { key: "guidelines", label: "品牌规范" },
  { key: "deals", label: "品牌合作" },
  { key: "ip", label: "版权 / IP授权" },
];

/** Studio Lab · Brand Assets (Charter §3.4). */
export function BrandAssetsPage() {
  const [tab, setTab] = useState("guidelines");

  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "guidelines" ? <BrandGuidelinesPage /> : null}
      {tab === "deals" ? <BrandDealsPage /> : null}
      {tab === "ip" ? <IpLicensingPage /> : null}
    </div>
  );
}
