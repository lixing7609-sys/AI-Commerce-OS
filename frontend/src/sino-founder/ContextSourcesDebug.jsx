export function ContextSourcesDebug({ groundings = [] }) {
  const grounding = [...groundings].reverse().find((item) => Array.isArray(item?.sources) && item.sources.some((source) => source.used));
  if (!grounding) return null;
  const uniqueByKey = (sources) => [...new Map(sources.map((item) => [item.key || item.label, item])).values()];
  const usedSources = uniqueByKey(grounding.sources.filter((item) => item.used));
  const unusedSources = uniqueByKey(grounding.sources.filter((item) => !item.used));
  if (!usedSources.length) return null;
  return <details className="sino-brain-evidence sino-context-sources-debug">
    <summary>Context Sources · {usedSources.length}</summary>
    <section>
      {grounding.message_id ? <strong>{grounding.message_id}</strong> : null}
      <dl>{usedSources.map((item) => <div key={item.key || item.label}>
        <dt>{item.label}</dt>
        <dd>{item.version || (typeof item.count === "number" && item.count > 0 ? `${item.count} 条` : "已引用")}</dd>
        {item.references?.length ? <ul>{item.references.map((reference, referenceIndex) => <li key={`${reference.source_id || reference.title || item.key}-${referenceIndex}`}>{reference.title || reference.source_id}</li>)}</ul> : null}
      </div>)}</dl>
      {grounding.participating_models?.length ? <p>参与模型：{grounding.participating_models.map((item) => item.label || item.provider).join(" · ")}</p> : null}
      {unusedSources.length ? <details className="sino-context-sources-debug__unused"><summary>Unused Context · {unusedSources.length}</summary><dl>{unusedSources.map((item) => <div key={item.key || item.label}><dt>{item.label}</dt><dd>未引用</dd></div>)}</dl></details> : null}
    </section>
  </details>;
}
