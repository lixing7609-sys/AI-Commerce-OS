export function ExecutionContextComposer({ value, onChange, onSubmit, busy, disabled = false }) {
  return <form className="sino-composer sino-execution-composer" onSubmit={onSubmit}>
    <label htmlFor="sino-execution-input"><span>执行补充</span><small>Sino 会判断补充是否改变当前范围；重大调整需 Founder 确认。</small></label>
    <div>
      <textarea id="sino-execution-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={disabled ? "当前没有正在执行的任务" : "补充、修改或删除当前执行中的要求……"} disabled={disabled} rows="3" />
      <button className="sino-button" disabled={disabled || busy || !value.trim()}>{busy ? "处理中…" : "提交补充"}</button>
    </div>
    {disabled && <p>任务进入执行后，可在这里补充、修改或删除执行要求。</p>}
  </form>;
}
