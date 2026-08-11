export function EvidenceCard({ evidence = [] }) {
  return (
    <article className="sino-card" data-testid="evidence-card">
      <span className="sino-card__index">02</span>
      <h2>证据</h2>
      {evidence.length ? <ul className="sino-card__evidence">{evidence.map((item, index) => <li key={`${item.source}-${index}`}><strong>{item.source}</strong><span>{item.fact}</span><small>{item.relevance}</small>{item.source === "Code Evidence" && <div className="sino-code-evidence"><b>相关文件</b>{item.metadata?.relevant_files?.length ? <ul>{item.metadata.relevant_files.map((file) => <li key={file.path}><code>{file.path}</code><span>{file.reason}</span></li>)}</ul> : <span>未找到直接相关的代码文件</span>}<b>影响范围</b><span>{item.metadata?.impact?.length ? item.metadata.impact.join(", ") : "未识别到依赖文件"}</span><b>风险</b><span>{item.metadata?.risk || "未知"}</span></div>}</li>)}</ul> : <p>分析后展示项目状态、记忆、路线图与代码证据。</p>}
    </article>
  );
}
