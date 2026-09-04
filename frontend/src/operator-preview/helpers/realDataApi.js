/**
 * "真实系统数据"模式下的只读安全数据获取（阶段：产品原型）。
 *
 * 只调用现有安全的只读接口（Runtime 状态、任务统计、店铺列表、
 * 成果列表），复用 src/services 下既有的请求函数，不新增写操作、
 * 不创建任务、不改变 Runtime 状态、不触发真实 AI 调用。
 *
 * 任何请求失败都必须安全降级为 connected:false，不抛出到调用方、
 * 不阻塞页面渲染、不显示整页错误——这是本模块存在的核心原因：
 * 原型页面在真实数据模式下应该始终可用，即使后端暂时不可达。
 */

import { getDashboardSummary } from "../../services/api";
import { getShops } from "../../services/shopApi";
import { getDeliverables } from "../../services/deliverableApi";
import { getRuntimeStatus } from "../../services/runtimeApi";
import { listKnowledgeDocuments } from "../../services/knowledgeApi";
import { getLlmStatus } from "../../services/settingsApi";

async function safeCall(fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    console.error("真实数据加载失败，已安全降级：", error);
    return fallback;
  }
}

/**
 * 返回经营驾驶舱"系统正常/需要检查"小圆点所需的最小信息，以及
 * 真实店铺数/任务数/成果数（用于"真实系统数据"模式下的展示，
 * 数据未接入部分由调用方按"尚未接入"处理，本函数不编造任何值）。
 */
export async function fetchRealSystemSnapshot() {
  const summary = await safeCall(() => getDashboardSummary(), null);

  if (summary === null) {
    return {
      connected: false,
      runtimeRunning: false,
      taskStats: null,
      shopStats: null,
      deliverableStats: null,
    };
  }

  return {
    connected: true,
    runtimeRunning: Boolean(summary.runtime?.running),
    taskStats: summary.tasks ?? null,
    shopStats: summary.shops ?? null,
    deliverableStats: summary.deliverables ?? null,
  };
}

export async function fetchRealShops() {
  const data = await safeCall(() => getShops({ status: "active" }), null);
  if (data === null) {
    return { connected: false, items: [] };
  }
  return { connected: true, items: data.items ?? [] };
}

export async function fetchRealDeliverables(params = {}) {
  const data = await safeCall(() => getDeliverables(params), null);
  if (data === null) {
    return { connected: false, items: [] };
  }
  return { connected: true, items: data.items ?? [] };
}

/**
 * 系统设置"系统运行"分组只读展示 Runtime/Consumer 状态；本模块
 * 不导出任何启动/停止函数——原型页面上的相关按钮一律走
 * showPrototypeNotice()，不调用真实的 start/stop 接口。
 */
export async function fetchRealRuntimeStatus() {
  const data = await safeCall(() => getRuntimeStatus(), null);
  if (data === null) {
    return { connected: false, status: null };
  }
  return { connected: true, status: data };
}

export async function fetchRealKnowledgeDocuments() {
  const data = await safeCall(() => listKnowledgeDocuments(), null);
  if (data === null) {
    return { connected: false, items: [], categories: [] };
  }
  return { connected: true, items: data.items ?? [], categories: data.categories ?? [] };
}

export async function fetchRealLlmStatus() {
  const data = await safeCall(() => getLlmStatus(), null);
  if (data === null) {
    return { connected: false, status: null };
  }
  return { connected: true, status: data };
}
