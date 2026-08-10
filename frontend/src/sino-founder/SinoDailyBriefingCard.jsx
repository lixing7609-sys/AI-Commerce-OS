export function SinoDailyBriefingCard({ briefing, loading, error }) {
  const progress = briefing?.progress;
  return (
    <section className="sino-briefing sino-briefing--daily" aria-label="Sino Daily Briefing">
      <div><span className="sino-kicker">Daily briefing</span><h2>今日项目简报</h2></div>
      {loading && <p>正在读取项目状态…</p>}
      {!loading && error && <p className="sino-briefing__error">{error}</p>}
      {!loading && !error && <><strong>{briefing?.status || "ready"}</strong><p>已完成 {progress?.completed || 0} / {progress?.total || 0} 项 · 进度 {progress?.percent || 0}%</p>{briefing?.risks?.length > 0 && <small>{briefing.risks.length} 项风险需要关注</small>}</>}
    </section>
  );
}
