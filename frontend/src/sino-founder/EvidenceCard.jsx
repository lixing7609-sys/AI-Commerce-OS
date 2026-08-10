export function EvidenceCard({ evidence = [] }) {
  return (
    <article className="sino-card" data-testid="evidence-card">
      <span className="sino-card__index">02</span>
      <h2>Evidence</h2>
      {evidence.length ? <ul className="sino-card__evidence">{evidence.map((item, index) => <li key={`${item.source}-${index}`}><strong>{item.source}</strong><span>{item.fact}</span><small>{item.relevance}</small>{item.source === "Code Evidence" && <div className="sino-code-evidence"><b>Relevant Files</b>{item.metadata?.relevant_files?.length ? <ul>{item.metadata.relevant_files.map((file) => <li key={file.path}><code>{file.path}</code><span>{file.reason}</span></li>)}</ul> : <span>No direct repository match</span>}<b>Impact</b><span>{item.metadata?.impact?.length ? item.metadata.impact.join(", ") : "No dependent files identified"}</span><b>Risk</b><span>{item.metadata?.risk || "unknown"}</span></div>}</li>)}</ul> : <p>分析后展示 Project State、Memory、Roadmap 与代码证据。</p>}
    </article>
  );
}
