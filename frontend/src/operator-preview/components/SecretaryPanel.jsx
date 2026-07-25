import { useState } from "react";
import {
  secretaryCannedReplies,
  secretaryDefaultReply,
  secretaryQuickQuestions,
} from "../previewData";

/**
 * 全局"问AI秘书"入口（阶段：产品原型）。
 *
 * 固定在右下角；点击打开侧边聊天面板，支持快捷问题和模拟回复，
 * 全程不连接真实秘书工作流，面板内明确标注"原型对话"。
 */
function SecretaryPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "secretary", text: "你好，我是AI秘书（原型对话）。可以问我今天的经营情况，或点击下方快捷问题。" },
  ]);
  const [input, setInput] = useState("");

  function respondTo(question) {
    const reply = secretaryCannedReplies[question] ?? secretaryDefaultReply;
    setMessages((prev) => [
      ...prev,
      { role: "user", text: question },
      { role: "secretary", text: reply },
    ]);
  }

  function handleSend(event) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    respondTo(trimmed);
    setInput("");
  }

  return (
    <>
      <button
        type="button"
        className="op-secretary-fab"
        onClick={() => setOpen(true)}
        aria-label="问AI秘书"
      >
        问AI秘书
      </button>

      {open && (
        <div className="op-secretary-overlay" onClick={() => setOpen(false)}>
          <aside
            className="op-secretary-panel"
            role="dialog"
            aria-modal="true"
            aria-label="AI秘书对话"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="op-secretary-header">
              <div>
                <strong>AI秘书</strong>
                <p>原型对话，尚未连接真实秘书工作流。</p>
              </div>
              <button
                type="button"
                className="op-drawer-close"
                onClick={() => setOpen(false)}
                aria-label="关闭AI秘书面板"
              >
                ✕
              </button>
            </div>

            <div className="op-secretary-messages">
              {messages.map((message, index) => (
                <div key={index} className={`op-secretary-message ${message.role}`}>
                  {message.text}
                </div>
              ))}
            </div>

            <div className="op-secretary-quick-questions">
              {secretaryQuickQuestions.map((question) => (
                <button type="button" key={question} onClick={() => respondTo(question)}>
                  {question}
                </button>
              ))}
            </div>

            <form className="op-secretary-input-row" onSubmit={handleSend}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入经营指令……"
                aria-label="输入经营指令"
              />
              <button type="submit" className="op-btn primary">
                发送
              </button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

export default SecretaryPanel;
