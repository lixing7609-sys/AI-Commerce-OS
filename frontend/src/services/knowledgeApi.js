const BASE_URL = "http://127.0.0.1:8000/api/v1";

export async function listKnowledgeDocuments() {
  const response = await fetch(`${BASE_URL}/knowledge/documents`);

  if (!response.ok) {
    throw new Error(`获取知识库文档列表失败（状态码 ${response.status}）`);
  }

  return response.json();
}

export async function getKnowledgeDocument(documentId) {
  const response = await fetch(
    `${BASE_URL}/knowledge/documents/${encodeURIComponent(documentId)}`
  );

  if (!response.ok) {
    throw new Error(`获取文档详情失败（状态码 ${response.status}）`);
  }

  return response.json();
}
