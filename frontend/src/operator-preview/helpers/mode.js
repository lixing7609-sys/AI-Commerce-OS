/**
 * 经营者版 V2 原型入口判定（不修改现有系统行为）。
 *
 * 只读 URL 查询参数 mode=operator-preview；不带该参数时现有
 * http://localhost:5173/ 行为完全不变。纯函数，供 main.jsx 和
 * 测试共用，避免在多处重复解析 location.search。
 */
export function isOperatorPreviewMode(search = window.location.search) {
  const params = new URLSearchParams(search);
  return params.get("mode") === "operator-preview";
}
