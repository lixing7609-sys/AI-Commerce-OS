import { createLocalRepository } from "../localRepository.js";
import { AccessMode, DEFAULT_ACCESS_MODE_FOR_NEW_STORE } from "./types.js";
import { mockAdapter } from "./mockAdapter.js";
import { createLiveReadonlyAdapter } from "./liveReadonlyAdapter.js";

/**
 * 接入模式/自动化风险等级是"平台策略"而不是"平台凭据"——不涉及任何
 * 密钥，只是一个每店铺的策略开关，因此允许像 `shopScopeStore.js`
 * 一样用 localStorage 持久化（同一约定的既有先例）。真实的店铺档案
 * 本身（名称/平台/凭据/连接状态）仍然只来自后端（`services/shopApi.js`），
 * 这里从不复制、缓存那部分数据。
 */

const DEFAULT_AUTOMATION_RISK_LEVEL = "L1";
const RISK_LEVELS_REQUIRING_EXTRA_CONFIRM = new Set(["L3", "L4"]);
const MAX_SYNC_JOB_HISTORY = 20;

function seedState() {
  return {
    accessModeByStoreId: {},
    automationRiskLevelByStoreId: {},
    syncJobsByStoreId: {},
  };
}

const repo = createLocalRepository("storePlatform:connectionPolicy", seedState);
const liveAdapter = createLiveReadonlyAdapter();

export function getAccessMode(storeId) {
  return repo.get().accessModeByStoreId[storeId] ?? DEFAULT_ACCESS_MODE_FOR_NEW_STORE;
}

/**
 * 新接入一家真实店铺时调用——恒定写入 MODE_LIVE_READONLY，不接受
 * 调用方传入其它初始值，防止未来某处调用点手滑把默认值改高。
 */
export function initializeAccessModeForNewStore(storeId) {
  repo.update((state) => {
    if (!state.accessModeByStoreId[storeId]) {
      state.accessModeByStoreId[storeId] = DEFAULT_ACCESS_MODE_FOR_NEW_STORE;
    }
    return state;
  });
  return DEFAULT_ACCESS_MODE_FOR_NEW_STORE;
}

export function setAccessMode(storeId, mode) {
  if (!Object.values(AccessMode).includes(mode)) {
    throw new Error(`未知的接入模式：${mode}`);
  }
  if (mode === AccessMode.LIVE_AUTOMATED) {
    throw new Error("MODE_LIVE_AUTOMATED 本阶段不对任何店铺开放，禁止切换。");
  }
  repo.update((state) => {
    state.accessModeByStoreId[storeId] = mode;
    return state;
  });
  return mode;
}

export function getAutomationRiskLevel(storeId) {
  return repo.get().automationRiskLevelByStoreId[storeId] ?? DEFAULT_AUTOMATION_RISK_LEVEL;
}

export function setAutomationRiskLevel(storeId, level) {
  repo.update((state) => {
    state.automationRiskLevelByStoreId[storeId] = level;
    return state;
  });
  return {
    level,
    requiresExtraConfirmation: RISK_LEVELS_REQUIRING_EXTRA_CONFIRM.has(level),
  };
}

export function getAdapterForStore(storeId) {
  const mode = getAccessMode(storeId);
  return mode === AccessMode.MOCK || mode === AccessMode.SANDBOX ? mockAdapter : liveAdapter;
}

export function recordSyncJob(storeId, job) {
  repo.update((state) => {
    const list = state.syncJobsByStoreId[storeId] ?? [];
    state.syncJobsByStoreId[storeId] = [job, ...list].slice(0, MAX_SYNC_JOB_HISTORY);
    return state;
  });
  return job;
}

export function listSyncJobs(storeId) {
  return repo.get().syncJobsByStoreId[storeId] ?? [];
}
