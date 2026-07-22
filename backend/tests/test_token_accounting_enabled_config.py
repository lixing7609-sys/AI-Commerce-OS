"""
get_token_accounting_enabled() 配置测试，写法对齐既有的
test_sqlalchemy_echo_config.py：默认关闭、显式配置为真值/假值时
正确解析、非法值安全降级为默认值。
"""

from app.core.config import get_token_accounting_enabled


def test_defaults_to_false_when_unset(monkeypatch):
    monkeypatch.delenv("TOKEN_ACCOUNTING_ENABLED", raising=False)

    assert get_token_accounting_enabled() is False


def test_true_values_are_recognized(monkeypatch):
    for raw_value in ("true", "1", "yes", "on", "TRUE", "  true  "):
        monkeypatch.setenv("TOKEN_ACCOUNTING_ENABLED", raw_value)
        assert get_token_accounting_enabled() is True


def test_false_values_are_recognized(monkeypatch):
    for raw_value in ("false", "0", "no", "off"):
        monkeypatch.setenv("TOKEN_ACCOUNTING_ENABLED", raw_value)
        assert get_token_accounting_enabled() is False


def test_invalid_value_safely_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("TOKEN_ACCOUNTING_ENABLED", "not-a-boolean")

    assert get_token_accounting_enabled() is False


def test_empty_string_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("TOKEN_ACCOUNTING_ENABLED", "")

    assert get_token_accounting_enabled() is False
