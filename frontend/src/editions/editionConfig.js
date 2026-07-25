/**
 * ADR-0002 Edition 判定 + 三版最终定位（见
 * docs/01-reference-architecture/edition-architecture.md）。
 *
 * 单一数据源：谁需要知道"当前是哪个 Edition"都应该从这里读取，
 * 不应该在别处再解析 import.meta.env 或 URL 参数。
 *
 * 判定顺序：
 *   1. 构建期 VITE_EDITION（未来真正的按 Edition 构建会设置它）；
 *   2. 本地开发时的 URL 覆盖，按以下优先级：
 *      ?mode=operator-preview → Operator Edition（沿用既有查询值，
 *        产品名称已是 Operator Edition，兼容旧链接）；
 *      ?mode=founder → Founder Edition；
 *      ?mode=developer → 保留原有 Developer/Task Center 工作台，
 *        显式选择才可达（阶段"三版最终定位"新增：不删除既有能力，
 *        只是不再是裸 URL 的默认值）；
 *   3. 默认 Operator Cloud——裸 URL（不带任何 mode 参数）现在直接
 *      呈现平台方的设备/租户/许可/Token计量/OTA管理方向，而不是
 *      工程师的开发工作台。这是本次任务的核心路由调整，不是误改：
 *      docs/01-reference-architecture/edition-architecture.md §12
 *      "The default route should now present Operator Cloud
 *      direction" 明确要求裸 URL 改为 Operator Cloud，同时通过
 *      ?mode=developer 保留对旧 Developer 工作台的完整访问，不丢失
 *      任何现有能力。
 */

const MODE_QUERY_PARAM = "mode";
const OPERATOR_PREVIEW_QUERY_VALUE = "operator-preview";
const FOUNDER_OPERATOR_QUERY_VALUE = "founder";
const DEVELOPER_QUERY_VALUE = "developer";

function readModeQueryParam(search) {
  const params = new URLSearchParams(search);
  return params.get(MODE_QUERY_PARAM);
}

export const EDITIONS = Object.freeze({
  DEVELOPER: "developer",
  OPERATOR: "operator",
  DEVICE_ADMIN: "device-admin",
  // Founder Operator：经营者（本人）在单台 Mac mini 上运行业务的
  // 操作台。是未来受限 Operator 正式版的上游共享实现，不是独立的
  // 一次性搭建——见 frontend/src/console/ 的 capabilities 说明。
  FOUNDER_OPERATOR: "founder-operator",
  // Operator Cloud：平台方管理已售出 Mac mini 设备群的云端控制台
  // ——阶段"三版最终定位"新增，成为裸 URL 的新默认值，取代原来
  // 直接落在 Developer 工作台的行为。
  OPERATOR_CLOUD: "operator-cloud",
});

const DEFAULT_EDITION = EDITIONS.OPERATOR_CLOUD;

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

  const resolvedSearch = search === undefined ? window.location.search : search;
  const mode = readModeQueryParam(resolvedSearch);

  if (mode === OPERATOR_PREVIEW_QUERY_VALUE) {
    return EDITIONS.OPERATOR;
  }

  if (mode === FOUNDER_OPERATOR_QUERY_VALUE) {
    return EDITIONS.FOUNDER_OPERATOR;
  }

  if (mode === DEVELOPER_QUERY_VALUE) {
    return EDITIONS.DEVELOPER;
  }

  return DEFAULT_EDITION;
}
