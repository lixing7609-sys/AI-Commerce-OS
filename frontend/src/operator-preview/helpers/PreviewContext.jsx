import { useEffect, useMemo, useState } from "react";
import { demoShops } from "../previewData";
import { fetchRealShops } from "./realDataApi";
import { ALL_SHOPS_SCOPE, PreviewContext } from "./previewContextCore";

const STORAGE_KEY_MODE = "ai-commerce-os:operator-preview:data-mode";
const STORAGE_KEY_SCOPE = "ai-commerce-os:operator-preview:shop-scope";

function readStoredValue(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw || fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 隐私模式或存储不可用时静默忽略，不影响当前会话内的选择。
  }
}

/**
 * 全局原型上下文 Provider（阶段：产品原型）。
 *
 * 统一管理两件事：
 * 1. dataMode：演示经营数据 / 真实系统数据；
 * 2. shopScope：当前经营范围（全部店铺 / 未绑定店铺 / 具体店铺）。
 *
 * 真实数据模式下从只读安全接口拉取店铺列表；请求失败时安全降级
 * 为空列表 + connected=false，不阻塞任何页面渲染。
 */
export function PreviewProvider({ children }) {
  const [dataMode, setDataModeState] = useState(() =>
    readStoredValue(STORAGE_KEY_MODE, "demo") === "real" ? "real" : "demo"
  );
  const [shopScope, setShopScopeState] = useState(() =>
    readStoredValue(STORAGE_KEY_SCOPE, ALL_SHOPS_SCOPE)
  );
  const [realShops, setRealShops] = useState([]);
  const [realShopsConnected, setRealShopsConnected] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  function showPrototypeNotice(actionLabel) {
    const message = actionLabel
      ? `产品原型：正式版将执行"${actionLabel}"。`
      : "产品原型：正式版将执行该操作。";
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3200);
  }

  useEffect(() => {
    if (dataMode !== "real") return undefined;

    let cancelled = false;

    fetchRealShops().then((result) => {
      if (cancelled) return;
      setRealShops(result.items);
      setRealShopsConnected(result.connected);
    });

    return () => {
      cancelled = true;
    };
  }, [dataMode]);

  function setDataMode(nextMode) {
    setDataModeState(nextMode);
    writeStoredValue(STORAGE_KEY_MODE, nextMode);
  }

  function setShopScope(nextScope) {
    setShopScopeState(nextScope);
    writeStoredValue(STORAGE_KEY_SCOPE, String(nextScope));
  }

  const shops = dataMode === "demo" ? demoShops : realShops;

  const value = useMemo(
    () => ({
      dataMode,
      setDataMode,
      shopScope,
      setShopScope,
      shops,
      realShopsConnected,
      isDemo: dataMode === "demo",
      toastMessage,
      showPrototypeNotice,
    }),
    [dataMode, shopScope, shops, realShopsConnected, toastMessage]
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}
