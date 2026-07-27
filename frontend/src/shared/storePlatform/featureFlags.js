import { AccessMode } from "./types.js";

/**
 * 第一家真实店铺接入的总开关（阶段：M8 Founder First Real Store
 * Live Pilot）。与 shared/distributedCompute/featureFlags.js 同一套
 * 约定：唯一真相来源，任何页面/adapter 判断"能不能做某件事"都必须
 * 从这里读，不允许各处写死。
 *
 * liveAutomatedEnabled 本阶段恒为 false 且不提供任何运行时切换
 * 入口——MODE_LIVE_AUTOMATED 明确禁止默认开启，见任务书 §14/§18。
 * defaultAutomationRiskLevel 恒为 "L1"（自动准备草稿，人工确认后
 * 执行）——即使某天 liveAutomatedEnabled 被显式改造为可配置，新接入
 * 店铺的默认风险等级也不允许直接是 L3/L4。
 */
export const FEATURE_FLAGS = Object.freeze({
  storePlatform: {
    liveAutomatedEnabled: false,
    defaultAccessModeForNewStore: AccessMode.LIVE_READONLY,
    defaultAutomationRiskLevel: "L1",
  },
});

export function isLiveAutomatedAllowed() {
  return FEATURE_FLAGS.storePlatform.liveAutomatedEnabled === true;
}

/**
 * 唯一允许"实际把写操作发给真实平台"的入口必须先过这一关。
 * MODE_LIVE_AUTOMATED 在本阶段恒不可用，调用方在真正派发前必须
 * 调这个函数并让它兜底抛错，而不是自己各处判断 accessMode 字符串。
 * @param {string} accessMode
 */
export function assertLiveAutomatedAllowed(accessMode) {
  if (accessMode === AccessMode.LIVE_AUTOMATED && !isLiveAutomatedAllowed()) {
    throw new Error(
      "storePlatform.liveAutomatedEnabled is false — MODE_LIVE_AUTOMATED 本阶段不对任何店铺开放，禁止自动执行任何真实写操作。"
    );
  }
}
