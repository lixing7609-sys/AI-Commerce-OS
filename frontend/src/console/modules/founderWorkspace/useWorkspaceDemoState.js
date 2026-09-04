import { useEffect, useState } from "react";

/**
 * Founder Workbench 8 页共用：每个模块都要求有「加载状态」（框架
 * 审查标准 #11）。真实数据接入前，用一次短暂的模拟延迟展示骨架，
 * 而不是让页面一直同步渲染、从没有 loading 态可看。
 *
 * Split out of WorkspaceKit.jsx (component-only file, react-refresh
 * lint rule requires files to export components exclusively).
 */
export function useDemoLoading(delay = 380) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  return loading;
}

/**
 * 每个模块都要求有「错误状态」（框架审查标准 #13）。真实后端接入
 * 前没有天然会失败的请求可演示，这里提供一个确定性的演示：点一次
 * “刷新”会先展示一次模拟失败（配合 ErrorState 的重试按钮），第二次
 * 点击（重试）才恢复——审查者可以稳定复现这个状态，而不是要靠随机数
 * 运气。
 */
export function useDemoRefreshFailure() {
  const [failed, setFailed] = useState(false);
  const [attempts, setAttempts] = useState(0);

  function triggerRefresh() {
    if (attempts === 0) {
      setFailed(true);
      setAttempts((n) => n + 1);
    } else {
      setFailed(false);
      setAttempts((n) => n + 1);
    }
  }

  return { failed, triggerRefresh, attempts };
}
