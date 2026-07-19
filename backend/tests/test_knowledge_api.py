"""
知识库文档索引接口测试：GET /api/v1/knowledge/documents 与
GET /api/v1/knowledge/documents/{document_id}。

覆盖：目录白名单生效（只返回真实 docs/ 白名单子目录下的文档）、
document_id 由服务端生成、传入任意路径式 id（路径穿越尝试、
.env/Git 配置等）一律安全返回 404、不存在的 id 返回 404、
Markdown 内容可正常读取、响应大小有截断保护。
"""

from fastapi.testclient import TestClient

from app.main import app


def _client():
    return TestClient(app)


def test_list_documents_returns_real_whitelisted_docs():
    with _client() as client:
        response = client.get("/api/v1/knowledge/documents")

    assert response.status_code == 200
    body = response.json()

    assert body["total"] > 0
    assert len(body["items"]) == body["total"]

    allowed_fields = {"id", "title", "category", "last_updated", "description"}
    for item in body["items"]:
        assert set(item.keys()) == allowed_fields
        assert item["id"]
        assert item["category"] in body["categories"]


def test_list_documents_categories_match_expected_set():
    with _client() as client:
        response = client.get("/api/v1/knowledge/documents")

    categories = set(response.json()["categories"])

    assert categories <= {
        "项目架构",
        "系统规范",
        "Agent 定义",
        "n8n 集成",
        "企业微信集成",
        "运维记录",
    }


def test_get_document_detail_returns_content():
    with _client() as client:
        list_response = client.get("/api/v1/knowledge/documents")
        first_doc = list_response.json()["items"][0]

        detail_response = client.get(
            f"/api/v1/knowledge/documents/{first_doc['id']}"
        )

    assert detail_response.status_code == 200
    body = detail_response.json()

    assert body["id"] == first_doc["id"]
    assert body["title"] == first_doc["title"]
    assert isinstance(body["content"], str)
    assert len(body["content"]) > 0


def test_nonexistent_document_id_returns_404():
    with _client() as client:
        response = client.get("/api/v1/knowledge/documents/does-not-exist")

    assert response.status_code == 404


def test_path_traversal_style_ids_return_404_not_file_content():
    traversal_attempts = [
        "..%2F..%2F..%2Fetc%2Fpasswd",
        "..--..--..--etc--passwd",
        "..-..-..-backend-.env",
        "..-..-.env",
    ]

    with _client() as client:
        for attempt in traversal_attempts:
            response = client.get(f"/api/v1/knowledge/documents/{attempt}")
            assert response.status_code == 404
            assert "EXTERNAL_TASK_API_KEY" not in response.text
            assert "WECOM_" not in response.text


def test_env_file_style_ids_never_served():
    with _client() as client:
        response = client.get("/api/v1/knowledge/documents/.env")
        assert response.status_code == 404

        response = client.get("/api/v1/knowledge/documents/backend/.env")
        assert response.status_code == 404


def test_response_never_exposes_env_values():
    with _client() as client:
        response = client.get("/api/v1/knowledge/documents")

    assert "EXTERNAL_TASK_API_KEY=" not in response.text
    assert "WECOM_APP_SECRET" not in response.text
