import { useState } from "react";
import { Link } from "react-router-dom";
import { useApiState } from "@sinofut/ui";
import { COCKPIT_QUESTIONS } from "@sinofut/domain";

const SUGGESTED = [
  "今天有什么机会值得关注？",
  "帮我把机会「LED 灯带」生成一份增长策略",
  "有哪些内容还在等我审批？",
  "这周哪个能力接近验证通过？",
];

export function SinoFUTHome() {
  const { state } = useApiState();
  const [input, setInput] = useState("");
  const [log, setLog] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);

  const submit = (event) => {
    event.preventDefault();
    if (!input.trim()) return;
    setLog((prev) => [
      ...prev,
      { role: "user", text: input },
      {
        role: "sino",
        text: "已记录你的指令（演示状态 · SinoFUT Core 尚未接入真实意图理解）。下方是当前真实的任务与审批队列。",
      },
    ]);
    setInput("");
  };

  const pendingApprovals = state?.approvals.filter((a) => a.status === "pending") || [];
  const recentTasks = (state?.tasks || []).slice(-5).reverse();

  return (
    <div className={fullscreen ? "sf-sino-home is-fullscreen" : "sf-sino-home"}>
      <div className="sf-sino-hero">
        <h1>SinoFUT</h1>
        <p>AI Commerce OS · 2608·V2 · 系统唯一智能入口</p>

        <form className="sf-sino-input" onSubmit={submit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="问 SinoFUT，或输入操作指令……"
          />
          <button type="submit" className="sf-button-primary">发送</button>
        </form>

        <div className="sf-sino-suggestions">
          {SUGGESTED.map((q) => (
            <button type="button" key={q} className="sf-icon-button" onClick={() => setInput(q)}>
              {q}
            </button>
          ))}
        </div>

        <div className="sf-sino-actions">
          <button type="button" className="sf-icon-button" onClick={() => setFullscreen((v) => !v)}>
            {fullscreen ? "退出全屏工作模式" : "进入全屏工作模式"}
          </button>
          <Link className="sf-icon-button" to="/cockpit">打开经营驾驶舱工作区 →</Link>
        </div>
      </div>

      {log.length > 0 && (
        <div className="sf-card" style={{ marginBottom: "var(--space-3)" }}>
          <h4>对话</h4>
          <ul>
            {log.map((entry, idx) => (
              <li key={idx}>{entry.role === "user" ? "你：" : "SinoFUT："}{entry.text}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="sf-grid sf-grid-3">
        <div className="sf-card">
          <h3>最近任务</h3>
          <ul>
            {recentTasks.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
            {recentTasks.length === 0 && <li>暂无任务</li>}
          </ul>
        </div>
        <div className="sf-card">
          <h3>需要审批</h3>
          <ul>
            {pendingApprovals.map((a) => (
              <li key={a.id}>{a.id}：{a.aiSuggestion}</li>
            ))}
            {pendingApprovals.length === 0 && <li>暂无待审批事项</li>}
          </ul>
        </div>
        <div className="sf-card">
          <h3>今日六问速览</h3>
          <ul>
            {COCKPIT_QUESTIONS.map((q) => (
              <li key={q.key}>{q.question}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
