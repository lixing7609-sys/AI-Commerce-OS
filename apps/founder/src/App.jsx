import { Route, Routes, useLocation } from "react-router-dom";
import { AppShell, SinoFUTWidget, SinoWorkspace, useSinoFullScreen } from "@sinofut/ui";
import { PRIMARY_NAV, SINO_PERSONAS } from "@sinofut/domain";
import { SinoFUTHome } from "./pages/SinoFUTHome.jsx";
import { Cockpit } from "./pages/Cockpit.jsx";
import { Growth } from "./pages/Growth.jsx";
import { Capability } from "./pages/Capability.jsx";
import { Marketplace } from "./pages/Marketplace.jsx";
import { DataCenter } from "./pages/DataCenter.jsx";
import { Admin } from "./pages/Admin.jsx";

// V2-002 §4: unified nav order — Studio/Operator/Operator Cloud are cross-app links
// interleaved in place, not shoved into a separate "quick switch" group.
const NAV_ITEMS = PRIMARY_NAV;

function useActiveKey() {
  const { pathname } = useLocation();
  const found = NAV_ITEMS.find((item) => item.internal && item.href === pathname);
  return found?.key || "sinofut";
}

function Shell({ children }) {
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
      onOpenFullScreen={openFullScreen}
    >
      {children}
      {activeKey !== "sinofut" ? <SinoFUTWidget onOpen={openFullScreen} /> : null}
    </AppShell>
  );
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<SinoFUTHome />} />
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
