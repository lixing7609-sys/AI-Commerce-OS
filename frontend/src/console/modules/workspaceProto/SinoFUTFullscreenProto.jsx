import { useRef, useState } from "react";

const SUGGESTIONS = [
  "今天有哪些事需要我决定？",
  "帮我看看 Token 余额情况",
  "抖音店A 有哪些商品建议调价？",
  "把 EP02 的剪辑进度告诉我",
];

const INITIAL_MESSAGES = [
  { id: "m1", role: "assistant", text: "早上好，Founder。我是 SinoFUT——这是全屏工作模式，比右下角悬浮入口能容纳更完整的多轮对话和引用内容。" },
];

/**
 * 母版 E · SinoFUT Fullscreen Workspace。
 * 与右下角悬浮示意入口是两种形态：悬浮入口是"系统级常驻入口"，
 * 这里是"接管整个视口的沉浸式指挥模式"——用于长对话、多步骤任务
 * 拆解、跨工作空间的联合决策，而不是快速一瞥。
 */
export function SinoFUTFullscreenProto() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const nextId = useRef(1);

  function send(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userId = `u${nextId.current++}`;
    const assistantId = `a${nextId.current++}`;
    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text: trimmed },
      { id: assistantId, role: "assistant", text: `（演示态）收到——"${trimmed}"。SinoFUT Core 尚未接入真实模型，这里只做全屏交互形态验证。` },
    ]);
    setInput("");
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-inverse)",
        color: "var(--text-inverse)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>SinoFUT</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>全屏指挥模式 · 当前：Founder · 今日总览</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>演示状态 · SinoFUT Core 尚未接入</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 760, margin: "0 auto", width: "100%" }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              padding: "10px 14px",
              borderRadius: 12,
              background: m.role === "user" ? "var(--ai-accent)" : "rgba(255,255,255,0.08)",
              color: m.role === "user" ? "#0B0D10" : "var(--text-inverse)",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {m.text}
          </div>
        ))}
      </div>

      <div style={{ padding: "16px 32px 32px", maxWidth: 760, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              style={{ fontSize: 12, padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "none", color: "var(--text-inverse)", cursor: "pointer" }}
            >
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="问 SinoFUT，或输入操作指令……"
            style={{ flex: 1, padding: "12px 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "var(--text-inverse)", fontSize: 14 }}
          />
          <button
            type="button"
            onClick={() => send(input)}
            style={{ padding: "0 20px", borderRadius: 999, border: "none", background: "var(--ai-accent)", color: "#0B0D10", fontWeight: 600, cursor: "pointer" }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
