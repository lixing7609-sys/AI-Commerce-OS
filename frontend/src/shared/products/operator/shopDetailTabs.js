/**
 * $1 = 基础标签页 [key, label] 数组，$2 = extraDetailTabs（调用方
 * 可选传入的 [{ key, label, insertAfter, render(shop, {switchTab}) }]
 * 数组）。把每个 extra tab 按 insertAfter 指定的 key 插入到基础数组
 * 里——不改变基础标签页本身的顺序/文案，Developer 版
 * （ShopCenter.jsx 不传 extraDetailTabs）行为完全不变。
 *
 * 单独放一个文件（而不是内联在 ShopCenterContent.jsx 里）纯粹是为了
 * 让 react-refresh 的"文件只能导出组件"规则满意，同时方便不渲染
 * 整棵组件树就能单测标签页顺序是否正确。
 */
export function buildDetailTabs(baseTabs, extraDetailTabs) {
  if (!extraDetailTabs || extraDetailTabs.length === 0) return baseTabs;
  const result = [];
  for (const tab of baseTabs) {
    result.push(tab);
    for (const extra of extraDetailTabs) {
      if (extra.insertAfter === tab[0]) result.push([extra.key, extra.label]);
    }
  }
  return result;
}
