const BASE = "http://127.0.0.1:8000/api/v1/studio-ai";

async function request(path, options) {
  const response = await fetch(`${BASE}${path}`, options);
  if (!response.ok) throw new Error(`Studio API ${response.status}`);
  return response.json();
}

export const listStudioConversations = () => request("/conversations");
export const createStudioConversation = (title = "商品主图生成") => request("/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
export const getStudioConversation = (id) => request(`/conversations/${encodeURIComponent(id)}`);
export const submitStudioTask = (id, content) => request(`/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
