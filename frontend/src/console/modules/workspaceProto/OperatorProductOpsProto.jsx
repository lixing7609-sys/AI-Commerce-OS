import { OperationsWorkspace, OperationsRow } from "../../workspace/OperationsWorkspace.jsx";

const QUEUE = [
  { id: "q1", tone: "urgent", icon: "⚠", title: "「便携折叠加湿器」库存已为 0", context: "近 7 天日均销量 12 件，预计今日断货影响 GMV" },
  { id: "q2", tone: "urgent", icon: "✕", title: "3 个 SKU 发布失败", context: "抖音店A · 图片规格不符合平台要求，需要重新上传" },
  { id: "q3", tone: "attention", icon: "⌛", title: "「夏季百搭帆布鞋」草稿超过 3 天未发布", context: "AI 详情文案已生成，等待人工确认后上架" },
  { id: "q4", tone: "attention", icon: "$", title: "2 个商品建议调价", context: "同类目竞品均价下降 8%，AI 建议跟随调整" },
  { id: "q5", tone: "normal", icon: "✓", title: "「LED灯带套装 3米」AI 详情文案已生成", context: "等待发布到淘宝店A" },
];

const TABLE_ROWS = [
  { name: "夏季轻薄防晒衣", sku: "SKU-SUN-001", price: "¥129", stock: 320, status: "已发布" },
  { name: "夏季百搭帆布鞋", sku: "SKU-SHO-004", price: "¥159", stock: 210, status: "草稿" },
  { name: "便携折叠加湿器", sku: "SKU-HUM-002", price: "¥89", stock: 0, status: "缺货" },
  { name: "LED灯带套装 3米", sku: "SKU-LED-005", price: "¥45", stock: 480, status: "已发布" },
];

/**
 * 母版 C · Operator 商品 Operations Workspace。
 * 默认呈现"待处理队列"——库存/发布失败/调价/审核等真正需要经营者
 * 采取行动的事项排在最前面，浏览全部商品的表格是切换后的二级视图，
 * 不是默认落地页。
 */
export function OperatorProductOpsProto() {
  return (
    <OperationsWorkspace
      title="商品中心 · 待处理队列"
      subtitle="5 项需要处理 · 2 项紧急"
      actions={<button type="button" className="ws-ops__toggle-btn" style={{ border: "1px solid var(--border-default)" }}>+ 新建商品</button>}
      queue={QUEUE.map((row) => (
        <OperationsRow
          key={row.id}
          tone={row.tone}
          icon={row.icon}
          title={row.title}
          context={row.context}
          actions={<button type="button" className="ws-ops__toggle-btn" style={{ border: "1px solid var(--border-default)" }}>去处理</button>}
        />
      ))}
      table={
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-tertiary)", fontSize: 12 }}>
              <th style={{ padding: 8 }}>商品</th><th>SKU</th><th>售价</th><th>库存</th><th>状态</th>
            </tr>
          </thead>
          <tbody>
            {TABLE_ROWS.map((r) => (
              <tr key={r.sku} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: 8 }}>{r.name}</td>
                <td>{r.sku}</td>
                <td>{r.price}</td>
                <td>{r.stock}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}
