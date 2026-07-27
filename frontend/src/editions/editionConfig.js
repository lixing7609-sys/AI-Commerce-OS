/**
 * ADR-0002 Edition 判定 + 四端产品体系 V1 冻结（见
 * docs/01-reference-architecture/edition-architecture.md）。
 *
 * 单一数据源：谁需要知道"当前是哪个 Edition"都应该从这里读取，
 * 不应该在别处再解析 import.meta.env、URL 路径或查询参数。
 *
 * 判定顺序：
 *   1. 构建期 VITE_EDITION（未来真正的按 Edition 构建会设置它）；
 *   2. 本地开发/生产时的 URL 路径别名（阶段"四端产品体系 V1"新增，
 *      §4 要求的干净路径）：
 *      /cloud → Operator Cloud；/founder → Founder；
 *      /operator → Operator；/studio → Studio。
 *      这些路径依赖 Vite dev server/生产静态服务器的 SPA fallback
 *      （未匹配路径回退到 index.html）——本仓库当前的开发工作流
 *      （scripts/developer-bootstrap.sh）全程使用 `vite dev`，其内建
 *      history fallback 已验证可用；如果未来改用不带 SPA fallback
 *      的静态服务器部署，需要额外配置 rewrite 规则，见
 *      docs/01-reference-architecture/edition-architecture.md §4 的
 *      部署注意事项。路径别名不影响、不覆盖第 3 步的查询参数覆盖；
 *      两者可以共存，路径别名优先。
 *   3. 本地开发时的 URL 查询参数覆盖（阶段"三版最终定位"起沿用至
 *      今的既有机制，完整保留，不因新增路径别名而废弃），按以下
 *      优先级：
 *      ?mode=operator-preview → Operator Edition（沿用既有查询值，
 *        产品名称已是 Operator Edition，兼容旧链接）；
 *      ?mode=founder → Founder Edition；
 *      ?mode=studio → Studio Edition（阶段"四端产品体系 V1"新增）；
 *      ?mode=developer → 保留原有 Developer/Task Center 工作台，
 *        显式选择才可达；
 *   4. 默认 Operator Cloud——裸 URL（不带路径别名、不带 mode 参数）
 *      呈现平台方的设备/租户/许可/Token计量/OTA/分布式调度管理方向。
 */

const MODE_QUERY_PARAM = "mode";
const OPERATOR_PREVIEW_QUERY_VALUE = "operator-preview";
const FOUNDER_OPERATOR_QUERY_VALUE = "founder";
const STUDIO_QUERY_VALUE = "studio";
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
  // Studio：内容生产与流量运营平台，阶段"四端产品体系 V1"新增，
  // 与 Founder/Operator/Cloud 并列的第四个正式产品端，见
  // docs/01-reference-architecture/edition-architecture.md。
  STUDIO: "studio",
});

const DEFAULT_EDITION = EDITIONS.OPERATOR_CLOUD;

const _VALID_EDITIONS = new Set(Object.values(EDITIONS));

// 路径别名 → Edition，仅用于第 2 步；只匹配"路径恰好等于这四个别名
// 之一"（大小写不敏感，允许尾部斜杠），避免误吞未来可能存在的其它
// 路径（如某个 Edition 内部子路由）。
const PATH_ALIAS_TO_EDITION = Object.freeze({
  cloud: EDITIONS.OPERATOR_CLOUD,
  founder: EDITIONS.FOUNDER_OPERATOR,
  operator: EDITIONS.OPERATOR,
  studio: EDITIONS.STUDIO,
});

function normalizeEdition(rawValue) {
  if (!rawValue) {
    return null;
  }

  const normalized = String(rawValue).trim().toLowerCase();

  return _VALID_EDITIONS.has(normalized) ? normalized : null;
}

function readPathAliasEdition(pathname) {
  if (!pathname) return null;
  const segment = pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  return PATH_ALIAS_TO_EDITION[segment] ?? null;
}

export function getActiveEdition(search = undefined, pathname = undefined) {
  const buildEdition = normalizeEdition(import.meta.env.VITE_EDITION);

  if (buildEdition) {
    return buildEdition;
  }

  const resolvedPathname =
    pathname === undefined ? (typeof window === "undefined" ? "" : window.location.pathname) : pathname;
  const pathEdition = readPathAliasEdition(resolvedPathname);

  if (pathEdition) {
    return pathEdition;
  }

  const resolvedSearch = search === undefined ? window.location.search : search;
  const mode = readModeQueryParam(resolvedSearch);

  if (mode === OPERATOR_PREVIEW_QUERY_VALUE) {
    return EDITIONS.OPERATOR;
  }

  if (mode === FOUNDER_OPERATOR_QUERY_VALUE) {
    return EDITIONS.FOUNDER_OPERATOR;
  }

  if (mode === STUDIO_QUERY_VALUE) {
    return EDITIONS.STUDIO;
  }

  if (mode === DEVELOPER_QUERY_VALUE) {
    return EDITIONS.DEVELOPER;
  }

  return DEFAULT_EDITION;
}
