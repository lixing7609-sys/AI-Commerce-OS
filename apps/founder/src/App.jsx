import { Route, Routes, useLocation } from "react-router-dom";
import { AppShell, SinoFUTWidget, SinoWorkspace, useSinoFullScreen } from "@sinofut/ui";
import { CURRENT_WORKSPACE_NAV, PRODUCT_SWITCH_NAV, SINO_PERSONAS } from "@sinofut/domain";
import { FounderHome } from "./pages/FounderHome.jsx";
import { Cockpit } from "./pages/Cockpit.jsx";
import { Growth } from "./pages/Growth.jsx";
import { Capability } from "./pages/Capability.jsx";
import { Marketplace } from "./pages/Marketplace.jsx";
import { DataCenter } from "./pages/DataCenter.jsx";
import { Admin } from "./pages/Admin.jsx";

// Founder AI Home V1: 经营驾驶舱 is no longer a top-level nav entry — its
// capabilities were merged into Founder AI's home workspace. The /cockpit route
// and Cockpit.jsx page still exist (linked from the home page as "查看完整经营驾驶舱"),
// they're just not in the top bar's current-workspace nav anymore.
const NAV_ITEMS = CURRENT_WORKSPACE_NAV.filter((item) => item.key !== "cockpit");

function useActiveKey() {
  const { pathname } = useLocation();
  return NAV_ITEMS.find((item) => item.internal && item.href === pathname)?.key || null;
}

function Shell({ children }) {
  const { pathname } = useLocation();
  const activeKey = useActiveKey();
  const { isFullScreenOpen, openFullScreen, closeFullScreen } = useSinoFullScreen();

  if (isFullScreenOpen) {
    return (
      <SinoWorkspace persona={SINO_PERSONAS.founder} variant="overlay" onExit={closeFullScreen} />
    );
  }

  return (
    <AppShell
      appLabel="Founder"
      navItems={NAV_ITEMS}
      activeKey={activeKey}
      crossAppLinks={PRODUCT_SWITCH_NAV}
      onOpenFullScreen={openFullScreen}
    >
      {children}
      {pathname !== "/" ? <SinoFUTWidget onOpen={openFullScreen} /> : null}
    </AppShell>
  );
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<FounderHome />} />
        <Route path="/cockpit" element={<Cockpit />} />
        <Route path="/growth" element={<Growth />} />
        <Route path="/capability" element={<Capability />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/data" element={<DataCenter />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Shell>
  );
}
