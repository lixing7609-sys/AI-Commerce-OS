export function MultiModelBlock({ entry }) {
  return (
    <div className="sf-card timeline-card">
      <h4>多模型讨论：{entry.question}</h4>
      <div className="timeline-multi-model-columns">
        {entry.opinions.map((o) => (
          <div key={o.model} className="timeline-multi-model-column">
            <strong>
              {o.model} <span className="sf-badge">{o.stance}</span>
            </strong>
            <p>{o.text}</p>
          </div>
        ))}
      </div>
      <p className="founder-ai-ai-suggestion">Sino 综合结论：{entry.synthesis}</p>
    </div>
  );
}
