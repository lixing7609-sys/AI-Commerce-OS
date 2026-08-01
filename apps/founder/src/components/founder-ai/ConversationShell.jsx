import { ConversationHome } from "./views/ConversationHome.jsx";
import { ChatThread } from "./views/ChatThread.jsx";
import { FunctionalArgumentationChat } from "./views/FunctionalArgumentationChat.jsx";
import { ModelMeeting } from "./views/ModelMeeting.jsx";
import { resolveFirstMessage } from "./resolveFirstMessage.js";

// 按对话的 mode 路由到对应组件：
// - functional-argumentation → 专属对话式追问流程
// - model-meeting → 复用既有 ModelMeeting（只读地挂上 onResult 回调）
// - chat 且尚无消息 → 与"草稿"态外观一致的 ConversationHome
// - 其余（chat 有消息 / decision / execution-task / file-analysis）→ 通用 ChatThread
export function ConversationShell({ conversation, onAppendMessage, onSetMode, onRename }) {
  if (conversation.mode === "functional-argumentation") {
    return <FunctionalArgumentationChat conversation={conversation} onAppendMessage={onAppendMessage} />;
  }
  if (conversation.mode === "model-meeting") {
    return (
      <ModelMeeting
        onResult={(record) => {
          onRename(conversation.id, record.topic.slice(0, 24));
          onAppendMessage(conversation.id, { role: "user", text: record.topic });
          onAppendMessage(conversation.id, { role: "sino", text: `模型会议已完成，推荐方案：${record.recommendation}` });
        }}
      />
    );
  }
  if (conversation.mode === "chat" && conversation.messages.length === 0) {
    return (
      <ConversationHome
        onSend={(text, { mode, hasFile }) => {
          const { finalMode, messages } = resolveFirstMessage(text, { mode, hasFile });
          if (finalMode !== conversation.mode) onSetMode(conversation.id, finalMode);
          messages.forEach((m) => onAppendMessage(conversation.id, m));
        }}
      />
    );
  }
  return <ChatThread conversation={conversation} onAppendMessage={onAppendMessage} onSetMode={onSetMode} />;
}
