export function EvidenceCard({ evidence = [] }) {
  return (
    <article className="sino-card" data-testid="evidence-card">
      <span className="sino-card__index">02</span>
      <h2>Evidence</h2>
      {evidence.length ? <ul className="sino-card__evidence">{evidence.map((item, index) => <li key={`${item.source}-${index}`}><strong>{item.source}</strong><span>{item.fact}</span><small>{item.relevance}</small></li>)}</ul> : <p>分析后展示 Project State、Memory、Roadmap 与执行历史证据。</p>}
    </article>
  );
}
