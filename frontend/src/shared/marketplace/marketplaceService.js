import { TargetProduct, ReviewState } from "./types.js";
import { listPackages, getPackageById, getInstallation } from "./cloudMarketplaceMockApi.js";

/**
 * Marketplace 的唯一客户端查询边界（阶段 M8c：Marketplace client，
 * 见 edition-architecture.md §18.4/§19）——Operator/Studio 的浏览
 * 页面（`shared/marketplace/MarketplaceBrowser.jsx`）、Founder 的
 * 管理页面（`console/labs/MarketplaceCenter.jsx`）全部通过这里读取
 * 数据，过滤规则只写一次，防止某个视图自己再实现一遍"只看
 * approved"之类的判断，出现三处不一致。底层调用
 * `cloudMarketplaceMockApi.js`——本地对"调用 Operator Cloud
 * Marketplace API"的模拟，权威数据按架构归属 Operator Cloud，这层
 * 客户端不持有自己的数据源。
 */

/**
 * Operator/Studio 消费视角——只看 `status===APPROVED` 且
 * `targetProducts` 命中 该产品或 SHARED 的能力包（阶段 M8 §9）。
 * @param {"operator"|"studio"} viewProduct
 */
export function listConsumablePackages(viewProduct) {
  const target = viewProduct === "studio" ? TargetProduct.STUDIO : TargetProduct.OPERATOR;
  return listPackages().filter(
    (p) => p.status === ReviewState.APPROVED && p.targetProducts.some((t) => t === target || t === TargetProduct.SHARED)
  );
}

/** Founder 管理视角——看到全部能力包，不做任何过滤。 */
export function listAllPackagesForManagement() {
  return listPackages();
}

export function getPackage(id) {
  return getPackageById(id);
}

export function installationStateFor(packageId) {
  return getInstallation(packageId);
}

export function filterByCategory(packages, categoryKey) {
  if (!categoryKey) return packages;
  return packages.filter((p) => p.categories.includes(categoryKey));
}

export function filterByKeyword(packages, keyword) {
  if (!keyword?.trim()) return packages;
  const kw = keyword.trim().toLowerCase();
  return packages.filter((p) => p.name.toLowerCase().includes(kw) || p.summary.toLowerCase().includes(kw));
}

export {
  installPackage,
  uninstallPackage,
  setReviewState,
  setReleaseChannel,
  publishNewVersion,
  rollbackToVersion,
} from "./cloudMarketplaceMockApi.js";
