import { useCallback, useState } from "react";
import {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  toggleArchiveConversation,
  setConversationMode,
  appendConversationMessage,
} from "./conversationStore.js";

// 对话列表的 React 状态封装 —— 不引入额外状态库，遵循项目既有的
// "本地 Context/hook + mock store" 模式（参见 FounderAIContext.jsx）。
export function useConversations() {
  const [conversations, setConversations] = useState(() => listConversations());

  const refresh = useCallback(() => setConversations(listConversations()), []);

  const create = useCallback(
    (options) => {
      const conversation = createConversation(options);
      refresh();
      return conversation;
    },
    [refresh]
  );

  const rename = useCallback(
    (id, title) => {
      renameConversation(id, title);
      refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    (id) => {
      deleteConversation(id);
      refresh();
    },
    [refresh]
  );

  const toggleArchive = useCallback(
    (id) => {
      toggleArchiveConversation(id);
      refresh();
    },
    [refresh]
  );

  const setMode = useCallback(
    (id, mode) => {
      setConversationMode(id, mode);
      refresh();
    },
    [refresh]
  );

  const appendMessage = useCallback(
    (id, message) => {
      appendConversationMessage(id, message);
      refresh();
    },
    [refresh]
  );

  return { conversations, refresh, create, rename, remove, toggleArchive, setMode, appendMessage };
}
