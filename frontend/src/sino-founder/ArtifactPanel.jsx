export function ArtifactPanel({ execution }) {
  const artifacts = execution?.artifact ? [execution.artifact] : execution?.artifacts || execution?.artifact_assets || [];
  return (
    <section className="sino-panel" id="artifacts" aria-label="成果资产面板">
      <span className="sino-kicker">成果 API</span><h2>成果资产</h2>
      {artifacts.length ? <ul className="sino-list">{artifacts.map((item, index) => <li key={item.id || index}>{item.summary || item.result_summary || item.title || item.path || String(item)}</li>)}</ul> : <p>执行完成后，成果将在这里登记并可追溯。</p>}
    </section>
  );
}
