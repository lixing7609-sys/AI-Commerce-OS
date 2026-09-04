export function SinoDailyBriefingCard({ briefing, loading, error }) {
  const progress = briefing?.progress;
  return (
    <section className="sino-briefing sino-briefing--daily" aria-label="Sino 每日简报">
      <div><span className="sino-kicker">每日简报</span><h2>每日简报</h2></div>
      {loading && <p>正在读取项目状态…</p>}
      {!loading && error && <p className="sino-briefing__error">{error}</p>}
      {!loading && !error && <><strong>{briefing?.status || "ready"}</strong><p>已完成 {progress?.completed || 0} / {progress?.total || 0} 项 · 进度 {progress?.percent || 0}%</p>{briefing?.risks?.length > 0 && <small>{briefing.risks.length} 项风险需要关注</small>}</>}
      {!loading && !error && briefing?.current_strategic_phase && <dl className="sino-daily-strategy"><div><dt>战略阶段</dt><dd>{briefing.current_strategic_phase}</dd></div><div><dt>重大成果</dt><dd>{briefing.major_achievement}</dd></div><div><dt>战略风险</dt><dd>{briefing.strategic_risk}</dd></div><div><dt>建议决策</dt><dd>{briefing.recommended_decision}</dd></div></dl>}
    </section>
  );
}
