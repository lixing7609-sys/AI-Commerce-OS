export function StrategicOverviewCard({ strategy }) {
  return (
    <section className="sino-strategy-card sino-strategy-card--overview" aria-label="战略总览卡片">
      <span className="sino-kicker">战略定位</span><h2>战略总览</h2>
      <strong>{strategy?.current_phase || "读取中"}</strong>
      <p>{strategy?.current_strategic_position || "Sino 正在分析 AI Commerce OS 的长期位置。"}</p>
      {strategy?.recommended_next_phase && <small>建议阶段 · {strategy.recommended_next_phase}</small>}
    </section>
  );
}
