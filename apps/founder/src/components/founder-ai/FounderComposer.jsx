import { useRef, useState } from "react";
import { NavIcon } from "./icons.jsx";

export function FounderComposer({ onSend, placeholder = "跟 Sino 说点什么……" }) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [webSearch, setWebSearch] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    onSend(text, { attachments, webSearch });
    setInput("");
    setAttachments([]);
  }

  function addAttachment(kind, file) {
    if (!file) return;
    setAttachments((prev) => [...prev, { id: `att-${Date.now()}-${prev.length}`, name: file.name, kind }]);
  }

  return (
    <form className="founder-composer" onSubmit={handleSubmit}>
      {attachments.length > 0 && (
        <div className="founder-composer-attachments">
          {attachments.map((a) => (
            <span key={a.id} className="founder-composer-attachment-chip">
              <NavIcon name={a.kind === "image" ? "image" : "paperclip"} />
              {a.name}
              <button type="button" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}>
                <NavIcon name="close" />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        className="founder-composer-textarea"
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
      <div className="founder-composer-toolbar">
        <div className="founder-composer-toolbar-left">
          <button type="button" className="sf-icon-button" onClick={() => fileInputRef.current?.click()}>
            <NavIcon name="paperclip" /> 文件
          </button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={(e) => {
              addAttachment("file", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="sf-icon-button" onClick={() => imageInputRef.current?.click()}>
            <NavIcon name="image" /> 图片
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              addAttachment("image", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className={`sf-icon-button${recording ? " is-active" : ""}`} onClick={() => setRecording((v) => !v)}>
            <NavIcon name="mic" /> 语音
          </button>
          <button type="button" className={`sf-icon-button${webSearch ? " is-active" : ""}`} onClick={() => setWebSearch((v) => !v)}>
            <NavIcon name="globe" /> 联网
          </button>
        </div>
        <button type="submit" className="sf-button-primary founder-composer-send">
          <NavIcon name="send" /> 发送
        </button>
      </div>
    </form>
  );
}
