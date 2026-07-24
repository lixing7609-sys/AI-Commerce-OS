import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MODULE_KEY, getModuleConfig } from "./navConfig.js";

/**
 * 结构化导航状态 {module, subView, entityId, params}，不引入
 * react-router——延续 App.jsx / OperatorPreviewApp.jsx 已经在用的
 * useState("activePage") 思路，只是把它做成一个可复用的 hook，并
 * 加一层 URL 同步：
 *
 * - 挂载时从 location.search 解析初始状态（?module=...&subView=...
 *   &entityId=...&tab=...），支持刷新/收藏；
 * - 每次 navigate() 调用 history.pushState 同步 URL；
 * - 监听 popstate，支持浏览器前进/后退。
 *
 * 16 个模块的层级仍然是"模块 -> 子视图"两层，不是任意路由图，用
 * 一个结构化对象 + 这个 hook 就够了，不需要路由匹配机制。
 */

function parseSearch(search) {
  const params = new URLSearchParams(search);
  const module = params.get("module");

  return {
    module: getModuleConfig(module) ? module : DEFAULT_MODULE_KEY,
    subView: params.get("subView") || null,
    entityId: params.get("entityId") || null,
    tab: params.get("tab") || null,
  };
}

function buildSearch(state) {
  const params = new URLSearchParams();
  params.set("mode", "founder");
  params.set("module", state.module);
  if (state.subView) params.set("subView", state.subView);
  if (state.entityId) params.set("entityId", state.entityId);
  if (state.tab) params.set("tab", state.tab);
  return `?${params.toString()}`;
}

export function useConsoleNav() {
  const [state, setState] = useState(() => parseSearch(window.location.search));

  useEffect(() => {
    function handlePopState() {
      setState(parseSearch(window.location.search));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((module, opts = {}) => {
    setState((prev) => {
      const next = {
        module: getModuleConfig(module) ? module : prev.module,
        subView: opts.subView ?? null,
        entityId: opts.entityId ? String(opts.entityId) : null,
        tab: opts.tab ?? null,
      };
      const url = buildSearch(next);
      if (opts.replace) {
        window.history.replaceState(next, "", url);
      } else {
        window.history.pushState(next, "", url);
      }
      return next;
    });
  }, []);

  return { ...state, navigate };
}
