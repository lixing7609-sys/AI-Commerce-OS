export function MemoryPanel({ result }) {
  return (
    <section className="sino-panel" id="memory" aria-label="长期记忆面板">
      <span className="sino-kicker">记忆 API</span><h2>长期记忆</h2>
      <p>{result?.memory_summary || (result?.memory ? `Decision · ${result.memory.decision} / Learning · ${result.memory.learning} / Result · ${result.memory.execution_result}` : "关键决策与执行结果将沉淀为可复用记忆。")}</p>
    </section>
  );
}
