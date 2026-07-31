import { Route, Routes, useLocation } from "react-router-dom";
import { AppShell, SinoFUTWidget } from "@sinofut/ui";
import { FOUNDER_APP_NAV } from "@sinofut/domain";
import { SinoFUTHome } from "./pages/SinoFUTHome.jsx";
import { Cockpit } from "./pages/Cockpit.jsx";
import { Growth } from "./pages/Growth.jsx";
import { Capability } from "./pages/Capability.jsx";
import { Marketplace } from "./pages/Marketplace.jsx";
import { DataCenter } from "./pages/DataCenter.jsx";
import { Admin } from "./pages/Admin.jsx";

const HREF_BY_KEY = {
  sinofut: "/",
  cockpit: "/cockpit",
  growth: "/growth",
  capability: "/capability",
  marketplace: "/marketplace",
  data: "/data",
  admin: "/admin",
};

const NAV_ITEMS = FOUNDER_APP_NAV.map((item) => ({ ...item, href: HREF_BY_KEY[item.key] }));

const CROSS_APP_LINKS = [
  { label: "Operator", href: "http://localhost:5181" },
  { label: "Studio", href: "http://localhost:5182" },
  { label: "Operator Cloud", href: "http://localhost:5183" },
];

function useActiveKey() {
  const { pathname } = useLocation();
  const found = NAV_ITEMS.find((item) => item.href === pathname);
  return found?.key || "sinofut";
}

function Shell({ children }) {
  const activeKey = useActiveKey();
  const activeItem = NAV_ITEMS.find((item) => item.key === activeKey);
  return (
    <AppShell
      appLabel="Founder"
      navItems={NAV_ITEMS}
      activeKey={activeKey}
      crossAppLinks={CROSS_APP_LINKS}
    >
      {children}
      {activeKey !== "sinofut" ? (
        <SinoFUTWidget contextLabel={`Founder · ${activeItem?.label}`} fullScreenHref="/" />
      ) : null}
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
