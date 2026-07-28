import { TargetProduct, ReviewState } from "./types.js";
import { listPackages, getPackageById, getInstallation } from "./mockMarketplaceRepository.js";

/**
 * Marketplace 的唯一查询边界——Operator/Studio 的浏览页面、Founder
 * 的管理页面全部通过这里读取数据，过滤规则只写一次，防止某个视图
 * 自己再实现一遍"只看 approved"之类的判断，出现三处不一致。
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
} from "./mockMarketplaceRepository.js";
