import { useState } from "react";
import { Tabs } from "./uiHelpers.jsx";
import { ContentAssetsPage } from "./MatrixAssetPages.jsx";
import { MarketplaceBrowser } from "../../shared/marketplace/MarketplaceBrowser.jsx";

const TABS = [
  { key: "assets", label: "内容资产" },
  { key: "marketplace", label: "能力市场" },
];

/** Studio Lab · Asset Library (Charter §3.4). */
export function AssetLibraryPage() {
  const [tab, setTab] = useState("assets");

  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "assets" ? <ContentAssetsPage /> : null}
      {tab === "marketplace" ? <MarketplaceBrowser theme="studio" /> : null}
    </div>
  );
}
