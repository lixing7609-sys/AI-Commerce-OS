"""
阶段 7B：n8n"AI秘书处｜企业微信指令入口"与
"AI秘书处｜任务状态查询"两个新增 workflow 的交付物结构校验，以及
docs/integrations/wecom-ai-secretariat.md 的关键说明校验。

本轮最多新增两个 workflow（不允许恢复"一名 AI 员工一个
workflow"的旧模式），本文件只覆盖这两个新增文件本身；阶段 7A 的
"AI秘书处｜统一任务入口"及其文档/脚本校验在
test_n8n_workflow_artifacts.py 中维护，两个文件共同覆盖仓库总数
上限（<=3）。不新增任何测试依赖，只使用标准库
（json/re）和项目已有的 pytest。
"""

import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS_DIR = REPO_ROOT / "automation" / "n8n" / "workflows"

WECOM_INTAKE_PATH = WORKFLOWS_DIR / "wecom-command-intake.json"
TASK_QUERY_PATH = WORKFLOWS_DIR / "task-status-query.json"

WECOM_DOC_PATH = REPO_ROOT / "docs" / "integrations" / "wecom-ai-secretariat.md"

EXPECTED_WECOM_INTAKE_NAME = "AI秘书处｜企业微信指令入口"
EXPECTED_TASK_QUERY_NAME = "AI秘书处｜任务状态查询"

SUSPICIOUS_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9]{16,}"),
    re.compile(r"Bearer\s+[A-Za-z0-9._-]{16,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
]

# 企业微信真实凭据字段名，本身不是 secret，但如果紧跟着看起来
# 像真实值的内容就值得警惕；这里只做"文件中不应出现这些变量名
# 被赋予非空、非 $env 表达式值"的结构性检查，具体在各测试里做。
WECOM_SECRET_FIELD_NAMES = (
    "WECOM_CORP_ID",
    "WECOM_APP_SECRET",
    "WECOM_CALLBACK_TOKEN",
    "WECOM_ENCODING_AES_KEY",
)


def _load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _node_by_type(workflow_data, node_type):
    return [n for n in workflow_data["nodes"] if n.get("type") == node_type]


def _node_by_name(workflow_data, name):
    return next(n for n in workflow_data["nodes"] if n["name"] == name)


@pytest.fixture(scope="module")
def wecom_intake():
    return _load(WECOM_INTAKE_PATH)


@pytest.fixture(scope="module")
def task_query():
    return _load(TASK_QUERY_PATH)


# ---------------------------------------------------------------------------
# 文件存在、可解析
# ---------------------------------------------------------------------------


def test_both_new_workflow_files_exist_and_parseable(wecom_intake, task_query):
    assert WECOM_INTAKE_PATH.exists()
    assert TASK_QUERY_PATH.exists()
    for wf in (wecom_intake, task_query):
        for key in ("name", "nodes", "connections", "active", "settings"):
            assert key in wf


def test_at_most_two_new_workflows_this_round():
    """
    本轮"最多新增两个工作流"——这两个文件本身就是全部新增内容，
    这里确认目录下没有第三个非阶段 7A 已知的文件。
    """

    known = {
        "ai-secretariat-task-dispatch.json",
        "wecom-command-intake.json",
        "task-status-query.json",
    }
    actual = {p.name for p in WORKFLOWS_DIR.glob("*.json")}
    assert actual == known


# ---------------------------------------------------------------------------
# 名称正确
# ---------------------------------------------------------------------------


def test_workflow_names_are_correct(wecom_intake, task_query):
    assert wecom_intake["name"] == EXPECTED_WECOM_INTAKE_NAME
    assert task_query["name"] == EXPECTED_TASK_QUERY_NAME


# ---------------------------------------------------------------------------
# active=false 的仓库交付版本
# ---------------------------------------------------------------------------


def test_both_workflows_are_inactive_in_repo(wecom_intake, task_query):
    assert wecom_intake["active"] is False
    assert task_query["active"] is False


def test_repo_files_stay_inactive_regardless_of_local_activation():
    """
    与阶段 7A 相同的保护：直接重新读取磁盘文件，不复用可能被
    测试过程中其它逻辑修改过的内存对象。
    """

    assert _load(WECOM_INTAKE_PATH)["active"] is False
    assert _load(TASK_QUERY_PATH)["active"] is False


# ---------------------------------------------------------------------------
# 无真实 Credential ID / 使用 Header Auth
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "workflow_fixture_name", ["wecom_intake", "task_query"]
)
def test_no_node_contains_real_credential_reference(
    workflow_fixture_name, wecom_intake, task_query
):
    workflow = {"wecom_intake": wecom_intake, "task_query": task_query}[
        workflow_fixture_name
    ]
    for node in workflow["nodes"]:
        assert "credentials" not in node, (
            f"节点 {node['name']!r} 不应在仓库交付文件中包含具体 "
            "credential 引用"
        )


def test_wecom_intake_webhook_uses_header_auth(wecom_intake):
    webhook_node = _node_by_name(wecom_intake, "Webhook｜接收已解密企业微信消息")
    assert webhook_node["parameters"].get("authentication") == "headerAuth"
    assert "credentials" not in webhook_node


def test_task_query_webhook_uses_header_auth(task_query):
    webhook_node = _node_by_name(task_query, "Webhook｜接收查询请求")
    assert webhook_node["parameters"].get("authentication") == "headerAuth"
    assert "credentials" not in webhook_node


def test_http_request_nodes_use_generic_credential_not_hardcoded_header(
    wecom_intake, task_query
):
    for workflow in (wecom_intake, task_query):
        for node in _node_by_type(workflow, "n8n-nodes-base.httpRequest"):
            params = node["parameters"]
            assert params.get("authentication") == "genericCredentialType"
            assert params.get("genericAuthType") == "httpHeaderAuth"
            header_params = params.get("headerParameters", {}).get(
                "parameters", []
            )
            header_names = {h["name"] for h in header_params}
            assert "X-Task-API-Key" not in header_names


# ---------------------------------------------------------------------------
# 无企业微信 Secret / 无 API Key / 无 sk-
# ---------------------------------------------------------------------------


def test_no_wecom_secrets_or_api_keys_in_workflow_files():
    for path in (WECOM_INTAKE_PATH, TASK_QUERY_PATH):
        raw_text = path.read_text(encoding="utf-8")

        assert "Authorization" not in raw_text

        for field_name in WECOM_SECRET_FIELD_NAMES:
            assert field_name not in raw_text, (
                f"{path.name} 不应包含企业微信 Secret 相关变量名 "
                f"{field_name!r}（这些只应存在于 backend 环境变量中）"
            )

        for pattern in SUSPICIOUS_SECRET_PATTERNS:
            assert not pattern.search(raw_text), (
                f"{path.name} 中疑似包含明文密钥（匹配 {pattern.pattern}）"
            )


# ---------------------------------------------------------------------------
# 指令解析分支存在 / 提交查询分支存在
# ---------------------------------------------------------------------------


def test_wecom_intake_has_parse_and_routing_nodes(wecom_intake):
    node_names = {n["name"] for n in wecom_intake["nodes"]}

    assert "Code｜解析指令" in node_names
    assert "IF｜是否提交任务" in node_names
    assert "IF｜是否查询任务" in node_names
    assert "HTTP Request｜调用统一任务入口" in node_names
    assert "HTTP Request｜查询任务状态" in node_names


def test_wecom_intake_parse_node_covers_submit_query_and_invalid(wecom_intake):
    parse_node = _node_by_name(wecom_intake, "Code｜解析指令")
    code = parse_node["parameters"]["jsCode"]

    assert "type: 'submit'" in code or 'type: "submit"' in code
    assert "type: 'query'" in code or 'type: "query"' in code
    assert "type: 'invalid'" in code or 'type: "invalid"' in code


def test_wecom_intake_connections_route_submit_and_query_separately(
    wecom_intake,
):
    connections = wecom_intake["connections"]

    submit_if_branches = connections["IF｜是否提交任务"]["main"]
    submit_true_targets = {t["node"] for t in submit_if_branches[0]}
    assert "HTTP Request｜调用统一任务入口" in submit_true_targets

    query_if_branches = connections["IF｜是否查询任务"]["main"]
    query_true_targets = {t["node"] for t in query_if_branches[0]}
    assert "HTTP Request｜查询任务状态" in query_true_targets


# ---------------------------------------------------------------------------
# 不含 DeepSeek 节点 / 不含 AI Agent 节点 / 只用内置节点
# ---------------------------------------------------------------------------


def test_only_builtin_nodes_and_no_ai_or_deepseek_nodes(wecom_intake, task_query):
    for workflow in (wecom_intake, task_query):
        for node in workflow["nodes"]:
            node_type = node.get("type", "")
            assert node_type.startswith("n8n-nodes-base."), (
                f"发现非内置节点类型：{node_type}"
            )
            assert "deepSeek" not in node_type
            assert "openAi" not in node_type.lower()
            assert "agent" not in node_type.lower()

        raw_text = json.dumps(workflow, ensure_ascii=False)
        assert "DeepSeek" not in raw_text
        assert "deepseek" not in raw_text.lower()


# ---------------------------------------------------------------------------
# 不维护 Agent 名册
# ---------------------------------------------------------------------------


def test_wecom_intake_does_not_hardcode_agent_roster(wecom_intake):
    """
    "Code｜解析指令" 节点只做结构化文本切分，不应该出现任何
    "合法 Agent 名单"式的硬编码校验（例如把解析出的 assigned_agent
    与一个固定数组做 includes()/等值比较来判断是否放行）——Agent
    是否真实存在完全交给后端任务网关用 404 校验，n8n 不做这层
    判断。帮助文案里出现 "AI CEO" 作为格式示例是允许的，这里检查
    的是真正的名册式校验逻辑（数组字面量 + includes，或者
    AgentRegistry 相关引用），而不是任意出现这个字符串。
    """

    parse_node = _node_by_name(wecom_intake, "Code｜解析指令")
    code = parse_node["parameters"]["jsCode"]

    # 允许代码注释里提到"交给后端 AgentRegistry 校验"（这正是
    # 期望的职责边界说明），不允许出现真正的名册式校验逻辑。
    assert not re.search(r"\[\s*['\"]AI CEO['\"]", code)
    assert ".includes(assignedAgent)" not in code
    assert "VALID_AGENTS" not in code
    assert "ALLOWED_AGENTS" not in code
    assert "new AgentRegistry" not in code
    assert "AgentRegistry.get" not in code


# ---------------------------------------------------------------------------
# Webhook path 正确
# ---------------------------------------------------------------------------


def test_webhook_paths(wecom_intake, task_query):
    wecom_webhook = _node_by_type(wecom_intake, "n8n-nodes-base.webhook")[0]
    assert wecom_webhook["parameters"]["path"] == "ai-secretariat/wecom-command"
    assert wecom_webhook["parameters"]["httpMethod"] == "POST"

    query_webhook = _node_by_type(task_query, "n8n-nodes-base.webhook")[0]
    assert query_webhook["parameters"]["path"] == "ai-secretariat/task-status-query"
    assert query_webhook["parameters"]["httpMethod"] == "POST"


# ---------------------------------------------------------------------------
# connections 完整性
# ---------------------------------------------------------------------------


def test_connections_reference_only_existing_nodes(wecom_intake, task_query):
    for workflow in (wecom_intake, task_query):
        node_names = {n["name"] for n in workflow["nodes"]}
        for source_name, outputs in workflow["connections"].items():
            assert source_name in node_names
            for branch in outputs.get("main", []):
                for target in branch:
                    assert target["node"] in node_names


# ---------------------------------------------------------------------------
# 文档：存在、无 secret
# ---------------------------------------------------------------------------


def test_wecom_doc_exists_and_has_no_secrets():
    assert WECOM_DOC_PATH.exists()
    doc_text = WECOM_DOC_PATH.read_text(encoding="utf-8")

    for pattern in SUSPICIOUS_SECRET_PATTERNS:
        assert not pattern.search(doc_text)

    # 文档只应该以"变量名"形式提及这些字段，不应该出现看起来像
    # 真实值的赋值（例如 WECOM_CORP_ID=ww1234567890abcdef）。
    for field_name in WECOM_SECRET_FIELD_NAMES:
        assert not re.search(
            rf"{field_name}=\S+", doc_text
        ), f"文档疑似包含 {field_name} 的真实赋值"


def test_wecom_doc_covers_required_sections():
    doc_text = WECOM_DOC_PATH.read_text(encoding="utf-8")

    required_phrases = [
        "架构图",
        "Credential",
        "回调 URL",
        "URL 验证",
        "查询",
        "幂等",
        "HTTPS",
        "IP 白名单",
        "日志安全",
        "AgentRegistry",
        "唯一",
        "接入",
        "转换",
        "连接",
        ".gitignore",
    ]

    for phrase in required_phrases:
        assert phrase in doc_text, f"文档缺少关键说明：{phrase!r}"


def test_wecom_doc_does_not_contain_real_urls():
    doc_text = WECOM_DOC_PATH.read_text(encoding="utf-8")

    real_looking_hosts = re.findall(
        r"https?://(?!localhost|host\.docker\.internal|<|你的)[a-zA-Z0-9.-]+",
        doc_text,
    )
    assert real_looking_hosts == [], (
        f"文档中疑似包含真实域名/公网地址：{real_looking_hosts}"
    )
