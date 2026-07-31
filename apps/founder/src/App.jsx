import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppShell, SinoFUTWidget } from "@sinofut/ui";
import { CURRENT_WORKSPACE_NAV, PRODUCT_SWITCH_NAV } from "@sinofut/domain";
import { FounderHome } from "./pages/FounderHome.jsx";
import { Cockpit } from "./pages/Cockpit.jsx";
import { Growth } from "./pages/Growth.jsx";
import { Capability } from "./pages/Capability.jsx";
import { Marketplace } from "./pages/Marketplace.jsx";
import { DataCenter } from "./pages/DataCenter.jsx";
import { Admin } from "./pages/Admin.jsx";

// Founder AI has exactly one implementation: FounderHome.jsx, rendered identically
// in normal and native-fullscreen browser modes. There is no second overlay
// component, no fullscreen route, and no port switch — see the fullscreen-unify
// audit (docs conversation) for why the old SinoWorkspace(variant="overlay")
// branch was removed here. Other apps (Operator/Studio/Operator Cloud) keep using
// that shared mechanism for their own full-screen AI — untouched by this change.
//
// Growth is not a Founder-internal menu item — it only lives in the product
// switch (PRODUCT_SWITCH_ITEMS below). The /growth route stays mounted (reachable
// from the product switch), it's just excluded from the main top nav here.
const NAV_ITEMS = CURRENT_WORKSPACE_NAV.filter(
  (item) => item.key !== "cockpit" && item.key !== "growth"
).map((item) => (item.key === "sinofut" ? { ...item, label: "Founder AI" } : item));

const PRODUCT_SWITCH_ITEMS = PRODUCT_SWITCH_NAV.filter((item) => item.key !== "operator-cloud");

function useActiveKey() {
  const { pathname } = useLocation();
  return NAV_ITEMS.find((item) => item.internal && item.href === pathname)?.key || null;
}

function toggleNativeFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function Shell({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeKey = useActiveKey();

  return (
    <AppShell
      navItems={NAV_ITEMS}
      activeKey={activeKey}
      crossAppLinks={PRODUCT_SWITCH_ITEMS}
      onOpenFullScreen={toggleNativeFullscreen}
      showThemeToggle={false}
    >
      {children}
      {pathname !== "/" ? <SinoFUTWidget onOpen={() => navigate("/")} /> : null}
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
