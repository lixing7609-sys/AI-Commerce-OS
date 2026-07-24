import { useMemo, useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { getStoreName } from "../../mock/storesMock.js";
import { getContentState } from "../../mock/contentMock.js";

const GROUP_OPTIONS = [
  { key: "storeId", label: "按店铺" },
  { key: "contentFormat", label: "按内容类型" },
  { key: "model", label: "按模型" },
];

const AI_RECS = [
  { id: "perf-1", label: "继续扩大投放", detail: "「防晒衣上身实测切片」ROI 5.8，建议持续投入" },
  { id: "perf-2", label: "转为广告素材", detail: "同一内容适合投放到广告中心作为素材候选" },
  { id: "perf-3", label: "转为直播话术", detail: "「防晒衣通勤实测」的钩子适合写入直播开场" },
  { id: "perf-4", label: "生成更多变体", detail: "建议为该内容生成 2-3 个渠道变体扩大覆盖" },
  { id: "perf-5", label: "停止生产", detail: "「返校季装饰」相关内容 ROI 持续走低，建议停止" },
  { id: "perf-6", label: "优化开场钩子", detail: "「男士皮鞋测评」完播率偏低，建议优化前3秒" },
  { id: "perf-7", label: "优化商品关联", detail: "部分内容商品点击率偏低，建议强化商品卡片引导" },
  { id: "perf-8", label: "沉淀进知识库", detail: "高表现开场话术建议沉淀为内容知识" },
];

function ContentDetail({ task, onBack }) {
  const p = task.performance;
  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回数据复盘</button>
      <div className="fdr-card">
        <h3 style={{ margin: "0 0 4px 0" }}>{task.creativeAngle}</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{getStoreName(task.storeId)} · {task.contentFormat} · {task.model}</p>
        <StatGrid>
          <StatCard label="播放量" value={p.views.toLocaleString()} />
          <StatCard label="点赞" value={p.likes.toLocaleString()} />
          <StatCard label="评论" value={p.comments} />
          <StatCard label="分享" value={p.shares} />
          <StatCard label="商品点击" value={p.productClicks.toLocaleString()} />
          <StatCard label="成交订单" value={p.orders} />
          <StatCard label="GMV" value={`¥${p.gmv.toLocaleString()}`} />
          <StatCard label="内容 ROI" value={task.contentRoi} />
          <StatCard label="生产成本" value={`$${task.productionCostUsd}`} />
          <StatCard label="Token 成本" value={task.tokenCost} />
          <StatCard label="单内容营收" value={`¥${Math.round(p.gmv / 1).toLocaleString()}`} />
          <StatCard label="退款率（演示）" value="1.8%" />
        </StatGrid>
      </div>
    </div>
  );
}

export function ContentPerformance() {
  const [state] = useState(() => getContentState());
  const [groupBy, setGroupBy] = useState("storeId");
  const [selectedId, setSelectedId] = useState(null);

  const performedTasks = state.hotContentTasks.filter((t) => t.performance);
  const selected = selectedId ? performedTasks.find((t) => t.id === selectedId) : null;

  const grouped = useMemo(() => {
    const map = new Map();
    performedTasks.forEach((t) => {
      const key = groupBy === "storeId" ? getStoreName(t.storeId) : t[groupBy] ?? "—";
      const entry = map.get(key) ?? { key, gmv: 0, orders: 0, cost: 0, count: 0 };
      entry.gmv += t.performance.gmv;
      entry.orders += t.performance.orders;
      entry.cost += t.productionCostUsd;
      entry.count += 1;
      map.set(key, entry);
    });
    return [...map.values()].map((e) => ({ ...e, roi: e.cost > 0 ? Number((e.gmv / (e.cost * 7.2)).toFixed(2)) : 0 }));
  }, [performedTasks, groupBy]);

  if (selected) {
    return <ContentDetail task={selected} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>分组汇总</h3>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUP_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <DataTable
          columns={[
            { key: "key", label: "分组" },
            { key: "count", label: "内容数" },
            { key: "gmv", label: "GMV", render: (r) => `¥${r.gmv.toLocaleString()}` },
            { key: "orders", label: "订单数" },
            { key: "roi", label: "ROI" },
          ]}
          rows={grouped}
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">内容表现明细</h3>
        {performedTasks.length === 0 ? (
          <EmptyState icon="▤" message="暂无已产生数据的内容" />
        ) : (
          <DataTable
            columns={[
              { key: "creativeAngle", label: "内容" },
              { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
              { key: "contentFormat", label: "类型" },
              { key: "views", label: "播放量", render: (r) => r.performance.views.toLocaleString() },
              { key: "productClicks", label: "商品点击", render: (r) => r.performance.productClicks.toLocaleString() },
              { key: "gmv", label: "GMV", render: (r) => `¥${r.performance.gmv.toLocaleString()}` },
              { key: "contentRoi", label: "ROI", render: (r) => <StatusPill tone={r.contentRoi >= 3 ? "success" : "warning"}>{r.contentRoi}</StatusPill> },
            ]}
            rows={performedTasks}
            onRowClick={(row) => setSelectedId(row.id)}
          />
        )}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">AI 建议</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {AI_RECS.map((rec) => (
            <div key={rec.id} style={{ padding: "10px 12px", borderRadius: 10, background: "var(--bg)" }}>
              <strong style={{ fontSize: 13 }}>{rec.label}</strong>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{rec.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
