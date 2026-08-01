import { detectIntent } from "./intentDetection.js";

// 首条消息的落地规则 —— 无论是"草稿"首页发送，还是打开一个已创建但还没
// 消息的 chat 模式对话后发送，都必须走同一套意图识别逻辑，否则两条入口
// 路径的行为会不一致。
export function resolveFirstMessage(text, { mode, hasFile = false } = {}) {
  const finalMode = mode || (hasFile ? "file-analysis" : "chat");
  const messages = [{ role: "user", text }];
  if (finalMode === "chat") {
    const suggestion = detectIntent(text, { hasFile });
    if (suggestion) {
      messages.push({ role: "suggestion", text: suggestion.explanation, suggestedMode: suggestion.mode });
    } else {
      messages.push({ role: "sino", text: "已记录（演示状态 · SinoFUT Core 尚未接入真实意图理解）。" });
    }
  }
  return { finalMode, messages };
}
