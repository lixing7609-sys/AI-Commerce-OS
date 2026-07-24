/**
 * ADR-0002 Edition 判定（阶段：Phase 0 脚手架）。
 *
 * 单一数据源：谁需要知道"当前是哪个 Edition"都应该从这里读取，
 * 不应该在别处再解析 import.meta.env 或 URL 参数。
 *
 * 判定顺序：
 *   1. 构建期 VITE_EDITION（未来真正的按 Edition 构建会设置它）；
 *   2. 本地开发时的 URL 覆盖：?mode=operator-preview——与
 *      operator-preview/helpers/mode.js 里 isOperatorPreviewMode()
 *      的判定逻辑保持一致，但在这里独立实现（不 import 那个文件），
 *      让本模块可以脱离 operator-preview/ 原型目录单独编译/提交；
 *   3. 默认 developer——与今天的行为完全一致，本模块本身不会改变
 *      任何现有页面在不设置 VITE_EDITION 时的表现。
 */

const OPERATOR_PREVIEW_QUERY_PARAM = "mode";
const OPERATOR_PREVIEW_QUERY_VALUE = "operator-preview";
const FOUNDER_OPERATOR_QUERY_VALUE = "founder";

function isOperatorPreviewQueryParam(search = window.location.search) {
  const params = new URLSearchParams(search);
  return params.get(OPERATOR_PREVIEW_QUERY_PARAM) === OPERATOR_PREVIEW_QUERY_VALUE;
}

function isFounderOperatorQueryParam(search = window.location.search) {
  const params = new URLSearchParams(search);
  return params.get(OPERATOR_PREVIEW_QUERY_PARAM) === FOUNDER_OPERATOR_QUERY_VALUE;
}

export const EDITIONS = Object.freeze({
  DEVELOPER: "developer",
  OPERATOR: "operator",
  DEVICE_ADMIN: "device-admin",
  // Founder Operator：经营者（本人）在单台 Mac mini 上运行业务的
  // 操作台。是未来受限 Operator 正式版的上游共享实现，不是独立的
  // 一次性搭建——见 frontend/src/console/ 的 capabilities 说明。
  FOUNDER_OPERATOR: "founder-operator",
});

const DEFAULT_EDITION = EDITIONS.DEVELOPER;

const _VALID_EDITIONS = new Set(Object.values(EDITIONS));

function normalizeEdition(rawValue) {
  if (!rawValue) {
    return null;
  }

  const normalized = String(rawValue).trim().toLowerCase();

  return _VALID_EDITIONS.has(normalized) ? normalized : null;
}

export function getActiveEdition(search = undefined) {
  const buildEdition = normalizeEdition(import.meta.env.VITE_EDITION);

  if (buildEdition) {
    return buildEdition;
  }

  if (isOperatorPreviewQueryParam(search)) {
    return EDITIONS.OPERATOR;
  }

  if (isFounderOperatorQueryParam(search)) {
    return EDITIONS.FOUNDER_OPERATOR;
  }

  return DEFAULT_EDITION;
}
