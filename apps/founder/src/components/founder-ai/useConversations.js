import { useCallback, useState } from "react";
import {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  toggleArchiveConversation,
  appendConversationMessage,
  updateConversationMessage,
  updateConversationState,
  addSinoStateItems,
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

  const appendMessage = useCallback(
    (id, message) => {
      const result = appendConversationMessage(id, message);
      refresh();
      return result;
    },
    [refresh]
  );

  const updateMessage = useCallback(
    (id, messageId, patch) => {
      const result = updateConversationMessage(id, messageId, patch);
      refresh();
      return result;
    },
    [refresh]
  );

  const updateState = useCallback(
    (id, patch) => {
      const result = updateConversationState(id, patch);
      refresh();
      return result;
    },
    [refresh]
  );

  const addStateItems = useCallback(
    (id, field, texts) => {
      const result = addSinoStateItems(id, field, texts);
      refresh();
      return result;
    },
    [refresh]
  );

  return {
    conversations,
    refresh,
    create,
    rename,
    remove,
    toggleArchive,
    appendMessage,
    updateMessage,
    updateState,
    addStateItems,
  };
}
