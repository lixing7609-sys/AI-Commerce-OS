/**
 * 按版本范围过滤任意带 `fields.scope`（或直接 `scope`）字段的行数组。
 * 与 CapabilityScopeLifecycleBar.jsx 拆开成单独的纯函数文件——同一个
 * .jsx 文件里混合导出组件和普通函数会触发 react-refresh/
 * only-export-components 规则。
 */
export function filterByScope(rows, scope) {
  if (!scope || scope === "all") return rows;
  return rows.filter((row) => (row.fields?.scope ?? row.scope) === scope);
}
