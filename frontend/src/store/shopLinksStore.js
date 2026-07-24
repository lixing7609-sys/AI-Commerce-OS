/**
 * 店铺外部链接配置（阶段 Founder UX Review V3，P0-10）。
 *
 * 真实店铺后端（services/shopApi.js）目前没有"店铺主页 URL /
 * 卖家中心 URL"这两个字段，这里用与 shopScopeStore.js 相同的
 * localStorage 覆盖层模式单独保存，按 shopId 索引——不需要为了
 * 这两个演示字段改动后端 Shop 模型。值只是操作者自己填写的普通
 * URL 文本，不含任何 Secret。
 */

const STORAGE_KEY = "ai-commerce-os:shop-links";

function readAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 隐私模式或存储不可用时静默忽略，不影响当前会话内的编辑。
  }
}

export function getShopLink(shopId) {
  const all = readAll();
  return all[shopId] ?? { storeUrl: "", sellerCenterUrl: "" };
}

export function setShopLink(shopId, link) {
  const all = readAll();
  all[shopId] = link;
  writeAll(all);
  return link;
}

export function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
