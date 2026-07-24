import { CAPABILITY_PROFILES } from "./capabilities.js";

/**
 * 本次只有 founderOperator 一个档位，直接返回即可——见
 * capabilities.js 顶部注释，这里不做 Edition 判断/切换。
 */
export function useCapabilities() {
  return CAPABILITY_PROFILES.founderOperator;
}
