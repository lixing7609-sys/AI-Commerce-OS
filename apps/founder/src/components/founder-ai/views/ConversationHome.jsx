import { useRef, useState } from "react";
import { QUICK_MODE_CARDS } from "../navConfig.js";
import { NavIcon } from "../icons.jsx";

const FOUNDER_NAME = "立行";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "上午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

// 统一 SinoFUT 对话首页 —— 用于「草稿」态（尚未创建对话记录）以及"刚创建、
// 尚无消息"的 chat 模式对话，两者外观一致，仅第一条消息发送的时刻才有区别
// （草稿态会创建新对话记录，已有对话则直接追加消息）。
export function ConversationHome({ onSend }) {
  const [input, setInput] = useState("");
  const [quickMode, setQuickMode] = useState(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const [webSearch, setWebSearch] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text, { mode: quickMode, hasFile: !!attachedFile, webSearch });
    setInput("");
    setAttachedFile(null);
    setQuickMode(null);
  }

  return (
    <div className="founder-ai-conv-home">
      <div className="founder-ai-conv-home-greeting">
        <h1>
          {getGreeting()}，{FOUNDER_NAME}
        </h1>
        <p>今天想研究、判断、开发或执行什么？</p>
      </div>

      <form className="founder-ai-conv-home-input-card" onSubmit={handleSubmit}>
        {quickMode && (
          <div className="founder-ai-mode-tag">
            模式：{QUICK_MODE_CARDS.find((m) => m.key === quickMode)?.label}
            <button type="button" onClick={() => setQuickMode(null)}>
              <NavIcon name="close" />
            </button>
          </div>
        )}
        {attachedFile && (
          <div className="founder-ai-mode-tag">
            已选择：{attachedFile}
            <button type="button" onClick={() => setAttachedFile(null)}>
              <NavIcon name="close" />
            </button>
          </div>
        )}
        <textarea
          className="founder-ai-conv-home-textarea"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入任何问题、想法或目标，SinoFUT 会为你判断最合适的工作方式……"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <div className="founder-ai-conv-home-toolbar">
          <div className="founder-ai-conv-home-toolbar-left">
            <button type="button" className="sf-icon-button" onClick={() => fileInputRef.current?.click()}>
              <NavIcon name="paperclip" /> 上传文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => setAttachedFile(e.target.files?.[0]?.name || null)}
            />
            <button
              type="button"
              className={`sf-icon-button${recording ? " is-active" : ""}`}
              onClick={() => setRecording((v) => !v)}
            >
              <NavIcon name="mic" /> 语音输入
            </button>
            <button
              type="button"
              className={`sf-icon-button${webSearch ? " is-active" : ""}`}
              onClick={() => setWebSearch((v) => !v)}
            >
              <NavIcon name="globe" /> 联网搜索
            </button>
          </div>
          <button type="submit" className="sf-button-primary founder-ai-send-button">
            <NavIcon name="send" /> 发送
          </button>
        </div>
      </form>

      <div className="founder-ai-quick-mode-cards">
        {QUICK_MODE_CARDS.map((mode) => (
          <button
            key={mode.key}
            type="button"
            className={`founder-ai-quick-mode-card${quickMode === mode.key ? " is-selected" : ""}`}
            onClick={() => setQuickMode((v) => (v === mode.key ? null : mode.key))}
          >
            <NavIcon name={mode.icon} />
            <strong>{mode.label}</strong>
            <span>{mode.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
