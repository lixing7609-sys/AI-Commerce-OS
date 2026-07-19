"""
阶段 6A 安全修复：SQLALCHEMY_ECHO 配置解析测试。

SQLAlchemy engine 曾经硬编码 echo=True，会为每一次数据库操作
打印完整 SQL 和绑定参数，包括任务 payload、context、task 文本、
外部接入网关的 external_source/external_request_id 等业务数据。
本文件覆盖新的布尔环境变量解析函数 parse_bool_env/
get_sqlalchemy_echo：未设置时默认 false、显式 true/false 各种
写法（大小写、首尾空格）、非法值安全降级为 false，以及"当前已
加载的 engine 对象的 echo 属性与解析结果一致"的一致性检查。

按要求不重新加载 app.database.db 模块（避免破坏进程内唯一的
engine/SessionLocal 单例，影响其它测试和真实连接池）；engine
本身的验证只读取已经存在的 engine.echo，不重新创建 engine。
"""

import pytest

from app.core.config import get_sqlalchemy_echo, parse_bool_env


# ---------------------------------------------------------------------------
# parse_bool_env：纯函数，直接测试各种输入
# ---------------------------------------------------------------------------


def test_parse_bool_env_none_returns_default_false():
    assert parse_bool_env(None, default=False) is False


def test_parse_bool_env_none_returns_default_true():
    assert parse_bool_env(None, default=True) is True


@pytest.mark.parametrize("raw_value", ["true", "1", "yes", "on"])
def test_parse_bool_env_truthy_values(raw_value):
    assert parse_bool_env(raw_value, default=False) is True


@pytest.mark.parametrize("raw_value", ["false", "0", "no", "off"])
def test_parse_bool_env_falsy_values(raw_value):
    assert parse_bool_env(raw_value, default=True) is False


@pytest.mark.parametrize(
    "raw_value",
    ["TRUE", "True", "  true  ", "YES", " on ", "On"],
)
def test_parse_bool_env_truthy_case_and_whitespace_insensitive(raw_value):
    assert parse_bool_env(raw_value, default=False) is True


@pytest.mark.parametrize(
    "raw_value",
    ["FALSE", "False", "  false  ", "NO", " off ", "Off"],
)
def test_parse_bool_env_falsy_case_and_whitespace_insensitive(raw_value):
    assert parse_bool_env(raw_value, default=True) is False


@pytest.mark.parametrize(
    "raw_value", ["maybe", "truee", "2", "enable", "", "   "]
)
def test_parse_bool_env_invalid_values_safely_degrade_to_default(raw_value):
    assert parse_bool_env(raw_value, default=False) is False
    # default=True 时同样降级为 default，而不是被错误解析成 True
    # 或 False 中固定的某一个——证明降级逻辑走的是 default 参数，
    # 不是硬编码的 False。
    assert parse_bool_env(raw_value, default=True) is True


# ---------------------------------------------------------------------------
# get_sqlalchemy_echo：读取 SQLALCHEMY_ECHO 环境变量
# ---------------------------------------------------------------------------


def test_get_sqlalchemy_echo_unset_defaults_to_false(monkeypatch):
    monkeypatch.delenv("SQLALCHEMY_ECHO", raising=False)
    assert get_sqlalchemy_echo() is False


@pytest.mark.parametrize("raw_value", ["false", "0", "no", "off", "FALSE"])
def test_get_sqlalchemy_echo_explicit_false_values(monkeypatch, raw_value):
    monkeypatch.setenv("SQLALCHEMY_ECHO", raw_value)
    assert get_sqlalchemy_echo() is False


@pytest.mark.parametrize("raw_value", ["true", "1", "yes", "on", "TRUE"])
def test_get_sqlalchemy_echo_explicit_true_values(monkeypatch, raw_value):
    monkeypatch.setenv("SQLALCHEMY_ECHO", raw_value)
    assert get_sqlalchemy_echo() is True


def test_get_sqlalchemy_echo_invalid_value_safely_degrades_to_false(
    monkeypatch,
):
    monkeypatch.setenv("SQLALCHEMY_ECHO", "not-a-boolean")
    assert get_sqlalchemy_echo() is False


def test_get_sqlalchemy_echo_does_not_default_to_true(monkeypatch):
    """
    回归防护：确保 default 参数本身没有被写反——get_sqlalchemy_echo
    在任何未识别输入下都必须是 False，不允许"默认开启"。
    """

    monkeypatch.delenv("SQLALCHEMY_ECHO", raising=False)
    assert get_sqlalchemy_echo() is False

    monkeypatch.setenv("SQLALCHEMY_ECHO", "")
    assert get_sqlalchemy_echo() is False


# ---------------------------------------------------------------------------
# engine.echo 一致性检查（不重新加载模块，只读取已存在的 engine）
# ---------------------------------------------------------------------------


def test_engine_echo_matches_parsed_config_for_current_process(monkeypatch):
    """
    本测试进程启动时 SQLALCHEMY_ECHO 未设置（pytest 运行环境未
    配置该变量），因此 app.database.db 模块导入时已经用
    get_sqlalchemy_echo()（当时求值为 False）创建了 engine。这里
    验证该已创建 engine 的 echo 属性确实是 False，证明
    create_engine 调用时真的使用了解析后的布尔值，而不是仍然
    硬编码 True。不重新加载 app.database.db 模块，避免产生第二个
    engine/连接池实例。
    """

    monkeypatch.delenv("SQLALCHEMY_ECHO", raising=False)

    from app.database.db import engine

    assert engine.echo is False
    assert engine.echo == get_sqlalchemy_echo()
