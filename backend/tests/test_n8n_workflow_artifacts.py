"""
阶段 6B：n8n「AI秘书处 - 任务接收与分发」交付物结构校验。

workflow JSON 本身很难通过 pytest 真正在 n8n 里跑起来（需要真实
n8n 进程），这里改为对仓库中交付的静态文件做结构/内容层面的
校验：workflow JSON 可解析且关键安全属性正确（inactive、节点
命名清晰、只用内置节点、不含明文 API Key、使用约定的环境变量、
Webhook path 正确、request_id 被固化、存在 Respond to Webhook
节点）、示例请求 JSON 合法、shell 脚本语法正确、文档包含关键
安全说明。不新增任何测试依赖，只使用标准库（json/re/subprocess）
和项目已有的 pytest。
"""

import json
import re
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = (
    REPO_ROOT
    / "automation"
    / "n8n"
    / "workflows"
    / "ai-secretariat-task-dispatch.json"
)
EXAMPLE_PATH = (
    REPO_ROOT
    / "automation"
    / "n8n"
    / "examples"
    / "task-command.example.json"
)
SCRIPT_PATH = (
    REPO_ROOT / "automation" / "n8n" / "scripts" / "verify-task-dispatch.sh"
)
DOC_PATH = (
    REPO_ROOT / "docs" / "integrations" / "n8n-ai-secretariat-workflow.md"
)

DEFAULT_NAME_PATTERN = re.compile(
    r"^(Node|Code|IF|HTTP Request|Webhook|Respond)\d*$"
)

# 明显不该出现在版本库里的明文密钥模式：常见 API Key/Token 前缀，
# 以及过长的十六进制/base64 风格串（真实密钥常见形态）。不检查
# 短小的、明显是占位符/示例值的字符串（例如 "your-key-here"）。
SUSPICIOUS_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9]{16,}"),
    re.compile(r"Bearer\s+[A-Za-z0-9._-]{16,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
]


@pytest.fixture(scope="module")
def workflow_data():
    with open(WORKFLOW_PATH, encoding="utf-8") as f:
        return json.load(f)


def _node_by_type(workflow_data, node_type):
    return [n for n in workflow_data["nodes"] if n.get("type") == node_type]


# ---------------------------------------------------------------------------
# 1. workflow JSON 可解析
# ---------------------------------------------------------------------------


def test_workflow_json_is_parseable_and_has_required_top_level_keys(
    workflow_data,
):
    assert WORKFLOW_PATH.exists()
    for key in ("name", "nodes", "connections", "active", "settings"):
        assert key in workflow_data
    assert isinstance(workflow_data["nodes"], list)
    assert len(workflow_data["nodes"]) > 0


# ---------------------------------------------------------------------------
# 2. active=false
# ---------------------------------------------------------------------------


def test_workflow_is_inactive_by_default(workflow_data):
    assert workflow_data["active"] is False


# ---------------------------------------------------------------------------
# 3. 节点名称完整，不使用默认名称
# ---------------------------------------------------------------------------


def test_all_node_names_are_descriptive_not_default(workflow_data):
    for node in workflow_data["nodes"]:
        name = node.get("name", "")
        assert name, f"节点缺少 name：{node.get('id')}"
        assert not DEFAULT_NAME_PATTERN.match(name), (
            f"节点使用了类似默认命名的名称：{name!r}"
        )


def test_expected_node_names_present(workflow_data):
    names = {node["name"] for node in workflow_data["nodes"]}
    expected = {
        "Webhook - Receive Task",
        "Code - Normalize and Validate",
        "IF - Validation Passed",
        "Respond - Invalid Request",
        "HTTP Request - Submit External Task",
        "Code - Normalize Gateway Response",
        "Respond - Success",
        "Respond - Gateway Error",
    }
    assert expected.issubset(names)


# ---------------------------------------------------------------------------
# 4. 只使用内置节点
# ---------------------------------------------------------------------------


def test_only_builtin_n8n_nodes_used(workflow_data):
    for node in workflow_data["nodes"]:
        node_type = node.get("type", "")
        assert node_type.startswith("n8n-nodes-base."), (
            f"发现非内置节点类型：{node_type}（节点：{node.get('name')}）"
        )


# ---------------------------------------------------------------------------
# 5. 不包含明文 API Key
# ---------------------------------------------------------------------------


def test_workflow_json_contains_no_plaintext_secrets():
    raw_text = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "AI_COMMERCE_TASK_API_KEY" in raw_text
    # 只应该以 $env 表达式形式出现，不应该有形如
    # "X-Task-API-Key": "sk-..." 这样直接写死的真实值。
    for pattern in SUSPICIOUS_SECRET_PATTERNS:
        assert not pattern.search(raw_text), (
            f"workflow JSON 中疑似包含明文密钥（匹配 {pattern.pattern}）"
        )


def test_http_request_node_uses_env_expression_for_api_key(workflow_data):
    http_nodes = _node_by_type(workflow_data, "n8n-nodes-base.httpRequest")
    assert http_nodes, "未找到 HTTP Request 节点"

    submit_node = next(
        n
        for n in http_nodes
        if n["name"] == "HTTP Request - Submit External Task"
    )

    header_params = submit_node["parameters"]["headerParameters"][
        "parameters"
    ]
    api_key_header = next(
        h for h in header_params if h["name"] == "X-Task-API-Key"
    )

    assert "$env.AI_COMMERCE_TASK_API_KEY" in api_key_header["value"]
    assert api_key_header["value"].startswith("=")


# ---------------------------------------------------------------------------
# 6 & 7. 使用 AI_COMMERCE_API_BASE_URL / AI_COMMERCE_TASK_API_KEY
# ---------------------------------------------------------------------------


def test_uses_expected_env_var_names(workflow_data):
    raw_text = json.dumps(workflow_data, ensure_ascii=False)
    assert "AI_COMMERCE_API_BASE_URL" in raw_text
    assert "AI_COMMERCE_TASK_API_KEY" in raw_text


def test_http_request_node_url_uses_base_url_env_var(workflow_data):
    submit_node = next(
        n
        for n in workflow_data["nodes"]
        if n["name"] == "HTTP Request - Submit External Task"
    )
    url = submit_node["parameters"]["url"]

    assert "$env.AI_COMMERCE_API_BASE_URL" in url
    assert url.endswith("/api/v1/integrations/tasks/submit")
    assert "localhost" not in url
    assert "127.0.0.1" not in url


# ---------------------------------------------------------------------------
# 8. Webhook path 正确
# ---------------------------------------------------------------------------


def test_webhook_node_path_and_method(workflow_data):
    webhook_nodes = _node_by_type(workflow_data, "n8n-nodes-base.webhook")
    assert len(webhook_nodes) == 1

    webhook_node = webhook_nodes[0]
    assert webhook_node["parameters"]["path"] == "ai-secretariat/task"
    assert webhook_node["parameters"]["httpMethod"] == "POST"
    assert webhook_node["parameters"]["responseMode"] == "responseNode"


# ---------------------------------------------------------------------------
# 9. request_id 被固化
# ---------------------------------------------------------------------------


def test_request_id_is_stabilized_not_random_per_retry(workflow_data):
    validate_node = next(
        n
        for n in workflow_data["nodes"]
        if n["name"] == "Code - Normalize and Validate"
    )
    code = validate_node["parameters"]["jsCode"]

    assert "$execution.id" in code
    assert "requestId" in code
    # 不应该实际调用时间戳/随机数/uuid 生成函数作为 request_id
    # 依据（代码注释里出于说明目的提到这些词是允许的，这里检查的
    # 是真正的函数调用语法，而不是原始子串）。
    assert "Date.now()" not in code
    assert "Math.random()" not in code
    assert not re.search(r"uuid\s*\(", code, re.IGNORECASE)
    assert "crypto.randomUUID" not in code


# ---------------------------------------------------------------------------
# 10. Respond to Webhook 节点存在
# ---------------------------------------------------------------------------


def test_respond_to_webhook_nodes_exist_for_all_outcomes(workflow_data):
    respond_nodes = _node_by_type(
        workflow_data, "n8n-nodes-base.respondToWebhook"
    )
    respond_names = {n["name"] for n in respond_nodes}

    assert respond_names == {
        "Respond - Invalid Request",
        "Respond - Success",
        "Respond - Gateway Error",
    }


def test_connections_reference_only_existing_nodes(workflow_data):
    node_names = {n["name"] for n in workflow_data["nodes"]}

    for source_name, outputs in workflow_data["connections"].items():
        assert source_name in node_names
        for branch in outputs.get("main", []):
            for target in branch:
                assert target["node"] in node_names


# ---------------------------------------------------------------------------
# 11. example JSON 合法
# ---------------------------------------------------------------------------


def test_example_request_json_is_valid_and_matches_backend_contract():
    assert EXAMPLE_PATH.exists()

    with open(EXAMPLE_PATH, encoding="utf-8") as f:
        example = json.load(f)

    for field in (
        "request_id",
        "source",
        "assigned_agent",
        "task",
        "context",
        "priority",
    ):
        assert field in example

    assert isinstance(example["context"], dict)
    assert example["priority"] in ("high", "normal", "low")
    assert 1 <= len(example["task"]) <= 64
    assert 1 <= len(example["request_id"]) <= 128

    raw_text = EXAMPLE_PATH.read_text(encoding="utf-8")
    for pattern in SUSPICIOUS_SECRET_PATTERNS:
        assert not pattern.search(raw_text)


# ---------------------------------------------------------------------------
# 12. shell script 语法检查
# ---------------------------------------------------------------------------


def test_verify_script_exists_and_is_executable():
    assert SCRIPT_PATH.exists()
    assert SCRIPT_PATH.stat().st_mode & 0o111, "脚本应具备可执行权限"


def test_verify_script_passes_bash_syntax_check():
    result = subprocess.run(
        ["bash", "-n", str(SCRIPT_PATH)],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr


def test_verify_script_uses_strict_mode_and_no_hardcoded_secrets():
    script_text = SCRIPT_PATH.read_text(encoding="utf-8")

    assert "set -euo pipefail" in script_text
    assert "N8N_TASK_WEBHOOK_URL" in script_text

    for pattern in SUSPICIOUS_SECRET_PATTERNS:
        assert not pattern.search(script_text)

    # 脚本不应该以 shell 变量形式实际引用后端 API Key——它只调用
    # n8n Webhook，不应该持有或转发网关鉴权 Key。脚本顶部注释里
    # 提及该变量名是为了说明"本脚本不涉及它"，属于允许的文档性
    # 提及，这里检查的是真正的 shell 变量引用语法（$VAR 或
    # ${VAR}），而不是原始子串。
    assert not re.search(
        r"\$\{?AI_COMMERCE_TASK_API_KEY\}?", script_text
    )
    assert not re.search(r"\$\{?EXTERNAL_TASK_API_KEY\}?", script_text)


# ---------------------------------------------------------------------------
# 13. 文档关键安全说明存在
# ---------------------------------------------------------------------------


def test_doc_exists_and_contains_required_security_notices():
    assert DOC_PATH.exists()
    doc_text = DOC_PATH.read_text(encoding="utf-8")

    required_phrases = [
        ".env.example",
        "自动加载",
        "AI_COMMERCE_TASK_API_KEY",
        "AI_COMMERCE_API_BASE_URL",
        "本地/内网",
        "公网",
        "request_id",
        "Runtime",
        "pending",
        "host.docker.internal",
        "企业微信",
    ]

    for phrase in required_phrases:
        assert phrase in doc_text, f"文档缺少关键说明：{phrase!r}"

    for pattern in SUSPICIOUS_SECRET_PATTERNS:
        assert not pattern.search(doc_text)
