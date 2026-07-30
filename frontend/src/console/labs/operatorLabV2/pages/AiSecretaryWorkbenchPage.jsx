import { useState } from "react";
import { Tabs } from "../../../kit/Tabs.jsx";
import SecretaryPage from "../../../../operator-preview/pages/SecretaryPage.jsx";
import { AIGrowthPage } from "../../../../operator-preview/pages/AIGrowthPage.jsx";

const TABS = [
  { key: "secretary", label: "秘书" },
  { key: "growth", label: "AI 成长" },
];

/**
 * Operator Lab · AI Secretary (Charter §3.3) — merges the day-to-day
 * secretary inbox with the AI growth/learning feed, since both are
 * "what is my AI doing for me" from the Operator's point of view.
 * `activeKey` (the caller's activePage, either "aiSecretary" or a
 * legacy "secretary"/"growth" deep link) picks the initial tab.
 */
export function AiSecretaryWorkbenchPage({ navigate, entityId, activeKey }) {
  const [tab, setTab] = useState(activeKey === "growth" ? "growth" : "secretary");

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "secretary" ? <SecretaryPage onNavigate={navigate} initialDetail={entityId} /> : null}
      {tab === "growth" ? <AIGrowthPage /> : null}
    </div>
  );
}
