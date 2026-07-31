import { useEffect, useState } from "react";
import { api, COCKPIT_QUESTIONS } from "@sinofut/domain";

function computeStatus(state) {
  if (!state) return { status: "normal", unreadCount: 0 };
  const pendingApprovals = state.approvals.filter((a) => a.status === "pending");
  if (pendingApprovals.length > 0) {
    return { status: "alert", unreadCount: pendingApprovals.length };
  }
  const openTasks = state.tasks.filter((t) => t.status !== "done");
  if (openTasks.length > 0) return { status: "suggestion", unreadCount: openTasks.length };
  return { status: "normal", unreadCount: 0 };
}

export function SinoFUTWidget({ contextLabel = "SinoFUT", stacked = false, fullScreenHref }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [log, setLog] = useState([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .getState()
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch(() => {
          if (!cancelled) setState(null);
        });
    };
    poll();
    const timer = setInterval(poll, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const { status, unreadCount } = computeStatus(state);

  const submit = (event) => {
    event.preventDefault();
    if (!input.trim()) return;
    setLog((prev) => [...prev, { role: "user", text: input }]);
    setLog((prev) => [
      ...prev,
      {
        role: "sino",
        text: "已记录（演示状态·SinoFUT Core 尚未接入真实意图理解）。真实数据见下方任务与审批。",
      },
    ]);
    setInput("");
  };

  return (
    <div className={`sf-floating${stacked ? " is-stacked" : ""}`}>
      {open ? (
        <div className="sf-panel">
          <div className="sf-panel-header">
            <div>
              <h3>SinoFUT</h3>
              <div className="sf-panel-context">当前：{contextLabel}</div>
            </div>
            <button type="button" className="sf-icon-button" onClick={() => setOpen(false)}>
              关闭
            </button>
          </div>

          <div className="sf-panel-section">
            <h4>建议问题</h4>
            <ul>
              {COCKPIT_QUESTIONS.slice(0, 3).map((q) => (
                <li key={q.key}>{q.question}</li>
              ))}
            </ul>
          </div>

          <div className="sf-panel-section">
            <h4>最近任务</h4>
            <ul>
              {(state?.tasks || []).slice(-3).reverse().map((t) => (
                <li key={t.id}>{t.title}</li>
              ))}
              {(!state || state.tasks.length === 0) && <li>暂无任务</li>}
            </ul>
          </div>

          <div className="sf-panel-section">
            <h4>待审批</h4>
            <ul>
              {(state?.approvals || [])
                .filter((a) => a.status === "pending")
                .map((a) => (
                  <li key={a.id}>审批 {a.id}：{a.aiSuggestion}</li>
                ))}
              {(!state || state.approvals.filter((a) => a.status === "pending").length === 0) && (
                <li>暂无待审批事项</li>
              )}
            </ul>
          </div>

          {log.length > 0 && (
            <div className="sf-panel-section">
              <h4>对话</h4>
              <ul>
                {log.map((entry, idx) => (
                  <li key={idx}>{entry.role === "user" ? "你：" : "SinoFUT："}{entry.text}</li>
                ))}
              </ul>
            </div>
          )}

          <form className="sf-panel-input" onSubmit={submit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问 SinoFUT，或输入操作指令……"
            />
            <button type="submit" className="sf-icon-button">发送</button>
          </form>

          {fullScreenHref ? (
            <div className="sf-panel-footer">
              <a href={fullScreenHref}>进入全屏工作模式 →</a>
            </div>
          ) : (
            <div className="sf-panel-footer">演示状态 · SinoFUT Core 尚未接入</div>
          )}
        </div>
      ) : null}

      <button type="button" className="sf-floating-pill" onClick={() => setOpen((v) => !v)}>
        <span className={`sf-floating-dot status-${status}`} />
        Sino
        {unreadCount > 0 ? <span className="sf-floating-badge">{unreadCount}</span> : null}
      </button>
    </div>
  );
}
