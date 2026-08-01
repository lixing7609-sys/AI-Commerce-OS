import { useState } from "react";
import { MODE_META } from "../navConfig.js";
import { detectIntent } from "../intentDetection.js";
import { useFounderAI } from "../useFounderAI.js";
import { NavIcon } from "../icons.jsx";

const MODE_STARTER = {
  decision: "我们来把这件事整理成一个正式的决策事项。你想让我记录什么？",
  "execution-task": "我们来创建一个可执行、可跟踪的工作任务。你想安排什么？",
  "file-analysis": "上传或描述你想分析的文件，我会给出研究要点（演示态，未接入真实文件解析）。",
};

const MODE_ACK = {
  chat: () => "已记录（演示状态 · SinoFUT Core 尚未接入真实意图理解）。",
  decision: (text) => `已整理为决策事项草稿：「${text}」。`,
  "execution-task": (text) => `已整理为执行任务草稿：「${text}」。`,
  "file-analysis": (text) => `已收到「${text}」，模拟分析结果：内容结构清晰，建议关注其中的关键假设与数据来源。`,
};

const MODE_ACTION = {
  decision: { label: "加入待决策列表" },
  "execution-task": { label: "创建为执行任务" },
};

// 通用对话线程 —— chat（有消息后）/ decision / execution-task / file-analysis
// 共用的消息气泡 + 底部输入框；functional-argumentation 与 model-meeting 有
// 各自专属组件（见 ConversationShell.jsx），不经过这里。
export function ChatThread({ conversation, onAppendMessage, onSetMode }) {
  const { addPendingDecision, addExecutionTask } = useFounderAI();
  const [input, setInput] = useState("");
  const [actionedIds, setActionedIds] = useState(() => new Set());
  const mode = conversation.mode;
  const messages = conversation.messages;

  function markActioned(id) {
    setActionedIds((prev) => new Set(prev).add(id));
  }

  function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onAppendMessage(conversation.id, { role: "user", text });
    if (mode === "chat") {
      const suggestion = detectIntent(text);
      if (suggestion) {
        onAppendMessage(conversation.id, {
          role: "suggestion",
          text: suggestion.explanation,
          suggestedMode: suggestion.mode,
        });
      } else {
        onAppendMessage(conversation.id, { role: "sino", text: MODE_ACK.chat() });
      }
    } else {
      onAppendMessage(conversation.id, { role: "sino", text: MODE_ACK[mode](text) });
    }
    setInput("");
  }

  function acceptSuggestion(messageId, suggestedMode) {
    onSetMode(conversation.id, suggestedMode);
    onAppendMessage(conversation.id, { role: "sino", text: `已切换为「${MODE_META[suggestedMode].label}」模式，我们继续在这个对话里进行。` });
    markActioned(messageId);
  }

  function dismissSuggestion(messageId) {
    onAppendMessage(conversation.id, { role: "sino", text: "好的，继续普通对话。" });
    markActioned(messageId);
  }

  function runModeAction(messageId, precedingUserText) {
    if (mode === "decision") {
      addPendingDecision({
        title: precedingUserText,
        source: "SinoFUT 对话",
        impact: "待补充",
        aiSuggestion: "由对话直接创建，建议补充影响范围后再做最终判断",
        riskLevel: "中",
      });
    } else if (mode === "execution-task") {
      addExecutionTask({
        name: precedingUserText,
        source: "SinoFUT 对话",
        executor: "Founder",
        stage: "执行中",
        progress: 0,
        doneSummary: "刚从对话创建",
        blockers: "无",
        nextStep: "补充具体执行计划",
        needsReauthorization: false,
      });
    }
    markActioned(messageId);
  }

  return (
    <div className="founder-ai-chat-thread">
      <div className="founder-ai-chat-header">
        <h1>{conversation.title}</h1>
        {mode !== "chat" && <span className="sf-badge">{MODE_META[mode]?.label}</span>}
      </div>

      <div className="founder-ai-chat-scroll">
        {messages.length === 0 && mode !== "chat" && (
          <div className="founder-ai-chat-bubble role-sino">{MODE_STARTER[mode]}</div>
        )}
        {messages.map((m, idx) => {
          if (m.role === "suggestion") {
            const resolved = actionedIds.has(m.id);
            return (
              <div key={m.id} className="founder-ai-suggestion-card">
                <p>我判断这更适合使用「{MODE_META[m.suggestedMode]?.label}」模式。</p>
                <p className="founder-ai-meta">{m.text}</p>
                {!resolved ? (
                  <div className="founder-ai-actions">
                    <button type="button" className="sf-button-primary" onClick={() => acceptSuggestion(m.id, m.suggestedMode)}>
                      开始{MODE_META[m.suggestedMode]?.label}
                    </button>
                    <button type="button" className="sf-icon-button" onClick={() => dismissSuggestion(m.id)}>
                      继续普通对话
                    </button>
                  </div>
                ) : (
                  <p className="founder-ai-saved-note">已处理</p>
                )}
              </div>
            );
          }
          const isLastSino = m.role === "sino" && idx === messages.length - 1;
          const action = MODE_ACTION[mode];
          const showAction = isLastSino && action && !actionedIds.has(m.id);
          return (
            <div key={m.id} className={`founder-ai-chat-bubble role-${m.role}`}>
              {m.text}
              {showAction && (
                <div className="founder-ai-actions">
                  <button
                    type="button"
                    className="sf-button-primary"
                    onClick={() => runModeAction(m.id, messages[idx - 1]?.text || conversation.title)}
                  >
                    {action.label}
                  </button>
                </div>
              )}
              {actionedIds.has(m.id) && MODE_ACTION[mode] && <p className="founder-ai-saved-note">已处理</p>}
            </div>
          );
        })}
      </div>

      <form className="founder-ai-chat-composer" onSubmit={handleSend}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "file-analysis" ? "描述文件内容，或点击上传（演示态）……" : "继续对 SinoFUT 说……"}
        />
        <button type="submit" className="sf-button-primary">
          <NavIcon name="send" /> 发送
        </button>
      </form>
    </div>
  );
}
