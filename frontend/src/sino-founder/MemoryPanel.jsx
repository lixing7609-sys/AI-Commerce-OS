export function MemoryPanel({ result }) {
  return (
    <section className="sino-panel" id="memory" aria-label="Memory Panel">
      <span className="sino-kicker">Memory API</span><h2>长期记忆</h2>
      <p>{result?.memory_summary || "关键决策与执行结果将沉淀为可复用记忆。"}</p>
    </section>
  );
}
