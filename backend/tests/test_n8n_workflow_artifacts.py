"""
阶段 7A：n8n「AI秘书处｜统一任务入口」交付物结构校验。

workflow JSON 本身很难通过 pytest 真正在 n8n 里跑起来（需要真实
n8n 进程），这里改为对仓库中交付的静态文件做结构/内容层面的
校验：workflow JSON 可解析且关键安全属性正确（inactive、节点
命名清晰、只用内置节点、不含明文 API Key、不含真实 Credential
ID、HTTP Request 节点使用 Credential 而不是明文/env 表达式做
鉴权、Webhook path 正确且启用 headerAuth、request_id 被固化、
校验分支和成功/失败 Respond 节点齐全）、示例请求 JSON 合法、
shell 脚本语法正确且不打印 Webhook 鉴权值、文档包含关键安全和
架构说明。不新增任何测试依赖，只使用标准库
（json/re/subprocess）和项目已有的 pytest。
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

EXPECTED_WORKFLOW_NAME = "AI秘书处｜统一任务入口"

WEBHOOK_NODE_NAME = "Webhook｜接收任务"
VALIDATE_NODE_NAME = "Code｜校验与标准化"
IF_VALID_NODE_NAME = "IF｜请求是否合法"
RESPOND_INVALID_NODE_NAME = "Respond｜无效请求"
HTTP_NODE_NAME = "HTTP Request｜提交到 AI Commerce OS"
NORMALIZE_RESPONSE_NODE_NAME = "Code｜标准化网关响应"
IF_SUCCESS_NODE_NAME = "IF｜网关调用成功"
RESPOND_SUCCESS_NODE_NAME = "Respond｜成功"
RESPOND_ERROR_NODE_NAME = "Respond｜失败"

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


def _node_by_name(workflow_data, name):
    return next(n for n in workflow_data["nodes"] if n["name"] == name)


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


def test_repo_workflow_json_stays_inactive_regardless_of_local_activation():
    """
    仓库交付文件必须始终 active=false；本地 n8n 实例上激活的副本
    （active=true）是部署时的运行状态，不应该、也不会反映到仓库
    文件里——这里直接重新读取磁盘上的文件验证，而不是复用可能
    被测试过程修改过的内存对象。
    """

    with open(WORKFLOW_PATH, encoding="utf-8") as f:
        data = json.load(f)

    assert data["active"] is False


# ---------------------------------------------------------------------------
# 3. workflow 名称正确
# ---------------------------------------------------------------------------


def test_workflow_name_matches_official_name(workflow_data):
    assert workflow_data["name"] == EXPECTED_WORKFLOW_NAME


# ---------------------------------------------------------------------------
# 4. 节点名称完整、清晰，不使用默认名称
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
        WEBHOOK_NODE_NAME,
        VALIDATE_NODE_NAME,
        IF_VALID_NODE_NAME,
        RESPOND_INVALID_NODE_NAME,
        HTTP_NODE_NAME,
        NORMALIZE_RESPONSE_NODE_NAME,
        IF_SUCCESS_NODE_NAME,
        RESPOND_SUCCESS_NODE_NAME,
        RESPOND_ERROR_NODE_NAME,
    }
    assert expected.issubset(names)


# ---------------------------------------------------------------------------
# 5. 只使用内置节点，不安装 community nodes
# ---------------------------------------------------------------------------


def test_only_builtin_n8n_nodes_used(workflow_data):
    for node in workflow_data["nodes"]:
        node_type = node.get("type", "")
        assert node_type.startswith("n8n-nodes-base."), (
            f"发现非内置节点类型：{node_type}（节点：{node.get('name')}）"
        )


def test_at_most_three_workflows_delivered_in_repo():
    """
    截至阶段 7B，仓库最多交付 3 个正式 workflow：阶段 7A 的
    "AI秘书处｜统一任务入口"，以及阶段 7B 新增的最多两个
    （企业微信指令入口、任务状态查询）——不允许恢复"一名 AI 员工
    一个 workflow"的旧模式，也不允许出现未知/多余的 workflow
    文件。已知文件名单在 test_wecom_workflow_artifacts.py 中
    与本文件共同维护。
    """

    workflow_dir = WORKFLOW_PATH.parent
    json_files = sorted(p.name for p in workflow_dir.glob("*.json"))

    known_names = {
        "ai-secretariat-task-dispatch.json",
        "wecom-command-intake.json",
        "task-status-query.json",
    }

    assert set(json_files).issubset(known_names), (
        f"发现未预期的 workflow 文件：{set(json_files) - known_names}"
    )
    assert len(json_files) <= 3


# ---------------------------------------------------------------------------
# 6. 不含真实 Credential ID
# ---------------------------------------------------------------------------


def test_workflow_json_has_no_real_credential_id(workflow_data):
    """
    仓库交付的 workflow JSON 是可移植模板，不应该引用任何具体 n8n
    实例上的真实 Credential ID——每个部署者需要在导入后自行在
    n8n UI 里创建/绑定属于自己实例的 Credential。这里检查所有
    节点均不包含 `credentials` 字段。
    """

    for node in workflow_data["nodes"]:
        assert "credentials" not in node, (
            f"节点 {node['name']!r} 不应在仓库交付文件中包含具体 "
            "credential 引用"
        )


def test_webhook_node_declares_header_auth_without_credential_reference(
    workflow_data,
):
    webhook_node = _node_by_name(workflow_data, WEBHOOK_NODE_NAME)
    assert webhook_node["parameters"].get("authentication") == "headerAuth"
    assert "credentials" not in webhook_node


def test_http_request_node_uses_generic_credential_without_reference(
    workflow_data,
):
    """
    HTTP Request 节点通过 n8n 的 Generic Credential Type
    （Header Auth）鉴权，而不是手写明文 Header 或
    `{{$env.AI_COMMERCE_TASK_API_KEY}}` 表达式——仓库交付文件里
    只声明"使用哪种鉴权方式"，不包含具体 credential id/name。
    """

    http_node = _node_by_name(workflow_data, HTTP_NODE_NAME)
    params = http_node["parameters"]

    assert params.get("authentication") == "genericCredentialType"
    assert params.get("genericAuthType") == "httpHeaderAuth"
    assert "credentials" not in http_node

    header_params = params.get("headerParameters", {}).get("parameters", [])
    header_names = {h["name"] for h in header_params}
    assert "X-Task-API-Key" not in header_names, (
        "网关 Key 应该通过 Credential 传递，不应作为手写 Header 出现"
    )


# ---------------------------------------------------------------------------
# 7 & 8. 不含 secret / 不含 sk- / 不含 Bearer 明文
# ---------------------------------------------------------------------------


def test_workflow_json_contains_no_plaintext_secrets():
    raw_text = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "AI_COMMERCE_API_BASE_URL" in raw_text
    # AI_COMMERCE_TASK_API_KEY 本轮已改为 Credential，workflow
    # JSON 里不应再出现这个变量名（无论是 $env 表达式还是别的
    # 形式）。
    assert "AI_COMMERCE_TASK_API_KEY" not in raw_text
    assert "Authorization" not in raw_text

    for pattern in SUSPICIOUS_SECRET_PATTERNS:
        assert not pattern.search(raw_text), (
            f"workflow JSON 中疑似包含明文密钥（匹配 {pattern.pattern}）"
        )


def test_workflow_json_has_no_sk_pattern(workflow_data):
    raw_text = json.dumps(workflow_data, ensure_ascii=False)
    assert not re.search(r"sk-[A-Za-z0-9]{10,}", raw_text)


# ---------------------------------------------------------------------------
# 9. 使用 AI_COMMERCE_API_BASE_URL
# ---------------------------------------------------------------------------


def test_http_request_node_url_uses_base_url_env_var(workflow_data):
    http_node = _node_by_name(workflow_data, HTTP_NODE_NAME)
    url = http_node["parameters"]["url"]

    assert "$env.AI_COMMERCE_API_BASE_URL" in url
    assert url.endswith("/api/v1/integrations/tasks/submit")
    assert "localhost" not in url
    assert "127.0.0.1" not in url


# ---------------------------------------------------------------------------
# 10. Webhook path 正确
# ---------------------------------------------------------------------------


def test_webhook_node_path_and_method(workflow_data):
    webhook_nodes = _node_by_type(workflow_data, "n8n-nodes-base.webhook")
    assert len(webhook_nodes) == 1

    webhook_node = webhook_nodes[0]
    assert webhook_node["parameters"]["path"] == "ai-secretariat/task"
    assert webhook_node["parameters"]["httpMethod"] == "POST"
    assert webhook_node["parameters"]["responseMode"] == "responseNode"


# ---------------------------------------------------------------------------
# 11. request_id 被固化
# ---------------------------------------------------------------------------


def test_request_id_is_stabilized_not_random_per_retry(workflow_data):
    validate_node = _node_by_name(workflow_data, VALIDATE_NODE_NAME)
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


def test_source_field_rejects_explicit_empty_string():
    """
    回归测试：source 字段若被显式提供为空字符串/纯空白，必须被
    拒绝为 400（invalid_field=source），而不是静默当作"未提供"
    回退成默认值 'n8n'——这是阶段 7A 修复的一个真实 bug，这里做
    静态代码层面的结构校验（不依赖真实 n8n 执行）：校验逻辑必须
    先判断 source 是否存在（`!== undefined`/`!== null`），而不是
    直接用 `.trim()` 的真值来决定是否使用默认值。
    """

    with open(WORKFLOW_PATH, encoding="utf-8") as f:
        wf = json.load(f)

    validate_node = _node_by_name(wf, VALIDATE_NODE_NAME)
    code = validate_node["parameters"]["jsCode"]

    assert "body.source !== undefined" in code
    assert "trimmedSource.length === 0" in code


# ---------------------------------------------------------------------------
# 12. validation 分支存在
# ---------------------------------------------------------------------------


def test_validation_if_branch_exists_and_routes_correctly(workflow_data):
    if_node = _node_by_name(workflow_data, IF_VALID_NODE_NAME)
    assert if_node["type"] == "n8n-nodes-base.if"

    condition = if_node["parameters"]["conditions"]["conditions"][0]
    assert "$json.valid" in condition["leftValue"]

    branches = workflow_data["connections"][IF_VALID_NODE_NAME]["main"]
    assert len(branches) == 2
    true_targets = {t["node"] for t in branches[0]}
    false_targets = {t["node"] for t in branches[1]}
    assert HTTP_NODE_NAME in true_targets
    assert RESPOND_INVALID_NODE_NAME in false_targets


# ---------------------------------------------------------------------------
# 13. success/error Respond 节点存在
# ---------------------------------------------------------------------------


def test_respond_to_webhook_nodes_exist_for_all_outcomes(workflow_data):
    respond_nodes = _node_by_type(
        workflow_data, "n8n-nodes-base.respondToWebhook"
    )
    respond_names = {n["name"] for n in respond_nodes}

    assert respond_names == {
        RESPOND_INVALID_NODE_NAME,
        RESPOND_SUCCESS_NODE_NAME,
        RESPOND_ERROR_NODE_NAME,
    }


def test_connections_reference_only_existing_nodes(workflow_data):
    node_names = {n["name"] for n in workflow_data["nodes"]}

    for source_name, outputs in workflow_data["connections"].items():
        assert source_name in node_names
        for branch in outputs.get("main", []):
            for target in branch:
                assert target["node"] in node_names


# ---------------------------------------------------------------------------
# 14. 200/202 语义存在
# ---------------------------------------------------------------------------


def test_success_status_code_semantics_present(workflow_data):
    normalize_node = _node_by_name(workflow_data, NORMALIZE_RESPONSE_NODE_NAME)
    code = normalize_node["parameters"]["jsCode"]

    assert "duplicate ? 200 : 202" in code

    respond_success = _node_by_name(workflow_data, RESPOND_SUCCESS_NODE_NAME)
    assert (
        respond_success["parameters"]["options"]["responseCode"]
        == "={{ $json.httpStatus }}"
    )


# ---------------------------------------------------------------------------
# 15 & 16. verify script 支持 Webhook Auth，且不打印其值
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
    # n8n Webhook，不应该持有或转发网关鉴权 Key。脚本注释里提及
    # 这些变量名是为了说明"本脚本不涉及它"，属于允许的文档性
    # 提及，这里检查的是真正的 shell 变量引用语法（$VAR 或
    # ${VAR}），而不是原始子串。
    assert not re.search(
        r"\$\{?AI_COMMERCE_TASK_API_KEY\}?", script_text
    )
    assert not re.search(r"\$\{?EXTERNAL_TASK_API_KEY\}?", script_text)


def test_verify_script_supports_optional_webhook_auth_header_without_logging_value():
    script_text = SCRIPT_PATH.read_text(encoding="utf-8")

    assert "N8N_WEBHOOK_AUTH_HEADER" in script_text
    assert "N8N_WEBHOOK_AUTH_VALUE" in script_text

    # 允许提及变量名本身（用于设置 Header），但不允许把值本身
    # echo/print 出来。粗略检查：不存在
    # `echo ... N8N_WEBHOOK_AUTH_VALUE` 这种直接打印的模式。
    for line in script_text.splitlines():
        if "echo" in line and "N8N_WEBHOOK_AUTH_VALUE" in line:
            pytest.fail(f"脚本疑似直接打印了 Webhook 鉴权值所在行：{line!r}")


# ---------------------------------------------------------------------------
# example JSON 合法
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
# 17. 文档明确仅本地/内网
# ---------------------------------------------------------------------------


def test_doc_exists_and_contains_required_security_notices():
    assert DOC_PATH.exists()
    doc_text = DOC_PATH.read_text(encoding="utf-8")

    required_phrases = [
        ".env.example",
        "自动加载",
        "AI_COMMERCE_API_BASE_URL",
        "本地/内网",
        "公网",
        "request_id",
        "Runtime",
        "pending",
        "host.docker.internal",
        "企业微信",
        "Credential",
    ]

    for phrase in required_phrases:
        assert phrase in doc_text, f"文档缺少关键说明：{phrase!r}"

    for pattern in SUSPICIOUS_SECRET_PATTERNS:
        assert not pattern.search(doc_text)


def test_doc_does_not_contain_real_webhook_url():
    doc_text = DOC_PATH.read_text(encoding="utf-8")

    # 不应该出现任何非 localhost/内网占位符形式的真实域名端口
    # 组合（本文档只允许出现 localhost/host.docker.internal/
    # <n8n-host>/backend 这类占位或 docker-compose 服务名写法，
    # "backend" 是"同一 docker-compose 项目"场景下的服务名示例，
    # 不是真实域名）。
    real_looking_hosts = re.findall(
        r"https?://(?!localhost|host\.docker\.internal|backend|<)[a-zA-Z0-9.-]+",
        doc_text,
    )
    assert real_looking_hosts == [], (
        f"文档中疑似包含真实域名/公网地址：{real_looking_hosts}"
    )


# ---------------------------------------------------------------------------
# 18. 文档明确 execution data 风险
# ---------------------------------------------------------------------------


def test_doc_documents_credentials_and_execution_data_risk():
    doc_text = DOC_PATH.read_text(encoding="utf-8")

    assert "Credentials" in doc_text or "Credential" in doc_text
    assert "N8N_BLOCK_ENV_ACCESS_IN_NODE" in doc_text
    assert "execution" in doc_text.lower()
    assert "EXECUTIONS_DATA_SAVE_ON_SUCCESS" in doc_text
    assert "EXECUTIONS_DATA_MAX_AGE" in doc_text


# ---------------------------------------------------------------------------
# 19. 文档明确后端 AgentRegistry 是唯一员工名册
# ---------------------------------------------------------------------------


def test_doc_states_backend_agent_registry_is_the_only_roster():
    doc_text = DOC_PATH.read_text(encoding="utf-8")

    assert "AgentRegistry" in doc_text
    assert "唯一" in doc_text


# ---------------------------------------------------------------------------
# 20. 文档明确 n8n 只负责接入、转换和连接
# ---------------------------------------------------------------------------


def test_doc_states_n8n_scope_is_ingest_transform_connect_only():
    doc_text = DOC_PATH.read_text(encoding="utf-8")

    assert "接入" in doc_text
    assert "转换" in doc_text
    assert "连接" in doc_text
