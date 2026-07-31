import { useEffect, useState } from "react";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { FOUNDER_MODULES } from "../nav/navConfig.js";
import { OPERATOR_V2_NAV_ITEMS } from "../labs/operatorLabV2/navigation.js";
import {
  NAV_GROUPS as STUDIO_NAV_GROUPS,
  DEFAULT_NAV_KEY as STUDIO_DEFAULT_KEY,
  getVisibleNavItemsByGroup as getStudioVisibleNavItemsByGroup,
} from "../../studio/navConfig.js";
import { NAV_ITEMS as CLOUD_NAV_ITEMS } from "../../cloud/navConfig.js";
import {
  ALL_SHOPS_SCOPE, UNASSIGNED_SHOP_SCOPE, getStoredShopScope, setStoredShopScope,
} from "../../store/shopScopeStore.js";
import { getShops } from "../../services/shopApi.js";
import "./labToolbar.css";

/**
 * Workspace 母版任务 第二阶段——Operator/Studio/Cloud 进入各自专属
 * 工作环境后，二级导航从"一直展开的 Founder 长侧栏"搬到这里：一条
 * 紧贴 ConsoleTopBar 下方的水平工具栏，只在这三个分组激活时渲染
 * （ConsoleShell.jsx 按 activeGroupKey 决定是否挂载）。内容来源仍然
 * 是各自的权威导航 registry（不新造一份数据），只是换一种横向的
 * 呈现方式。
 */
function useRootNavigate() {
  const { module: activeModule, subView, navigate } = useConsoleNavContext();
  return { activeModule, subView, navigate };
}

function ToolbarButton({ active, label, onClick }) {
  return (
    <button type="button" className={"lab-toolbar__item" + (active ? " lab-toolbar__item--active" : "")} onClick={onClick}>
      {label}
    </button>
  );
}

function OperatorToolbar() {
  const { activeModule, navigate } = useRootNavigate();
  const [shops, setShops] = useState([]);
  const [scope, setScope] = useState(() => getStoredShopScope());

  useEffect(() => {
    let cancelled = false;
    getShops().then((data) => { if (!cancelled) setShops(Array.isArray(data) ? data : data.items ?? []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <select
        className="lab-toolbar__scope"
        value={scope}
        onChange={(e) => {
          const raw = e.target.value;
          const next = raw === ALL_SHOPS_SCOPE || raw === UNASSIGNED_SHOP_SCOPE ? raw : Number(raw);
          setScope(next);
          setStoredShopScope(next);
        }}
        aria-label="当前店铺范围"
      >
        <option value={ALL_SHOPS_SCOPE}>全部店铺</option>
        <option value={UNASSIGNED_SHOP_SCOPE}>未绑定店铺</option>
        {shops.filter((s) => s.status === "active").map((shop) => (
          <option key={shop.id} value={shop.id}>{shop.shop_name}</option>
        ))}
      </select>
      <div className="lab-toolbar__divider" />
      {OPERATOR_V2_NAV_ITEMS.map((item) => {
        const isActive = item.directModule ? activeModule === item.directModule : activeModule === "operatorLab";
        return (
          <ToolbarButton
            key={item.key}
            active={isActive}
            label={item.label}
            onClick={() => (item.directModule ? navigate(item.directModule) : navigate("operatorLab", { subView: item.key }))}
          />
        );
      })}
    </>
  );
}

function StudioToolbar() {
  const { activeModule, subView, navigate } = useRootNavigate();
  const items = STUDIO_NAV_GROUPS.flatMap((g) => getStudioVisibleNavItemsByGroup(g.key));
  return (
    <>
      {items.map((item) => {
        const isActive = activeModule === "studioLab" && (subView ?? STUDIO_DEFAULT_KEY) === item.key;
        return (
          <ToolbarButton key={item.key} active={isActive} label={item.label} onClick={() => navigate("studioLab", { subView: item.key })} />
        );
      })}
    </>
  );
}

function CloudToolbar() {
  const { activeModule, subView, navigate } = useRootNavigate();
  const composite = FOUNDER_MODULES.filter((m) => m.group === "cloudCenterGroup" && m.key !== "cloudCenter" && !m.hiddenFromSidebar);
  return (
    <>
      {CLOUD_NAV_ITEMS.map((item) => (
        <ToolbarButton
          key={item.key}
          active={activeModule === "cloudCenter" && (subView ?? "overview") === item.key}
          label={item.label}
          onClick={() => navigate("cloudCenter", { subView: item.key })}
        />
      ))}
      <div className="lab-toolbar__divider" />
      {composite.map((item) => (
        <ToolbarButton key={item.key} active={activeModule === item.key} label={item.label} onClick={() => navigate(item.key)} />
      ))}
    </>
  );
}

const TOOLBAR_BY_GROUP = {
  operatorLabGroup: OperatorToolbar,
  studioLabGroup: StudioToolbar,
  cloudCenterGroup: CloudToolbar,
};

export function LabToolbar({ groupKey }) {
  const Toolbar = TOOLBAR_BY_GROUP[groupKey];
  if (!Toolbar) return null;
  return (
    <div className="lab-toolbar">
      <Toolbar />
    </div>
  );
}
