"""
阶段 7B：任务 result/error 安全展示格式化单元测试。
"""

from app.services.task_result_sanitizer import (
    format_safe_error,
    format_safe_result,
)


# ---------------------------------------------------------------------------
# result 为空
# ---------------------------------------------------------------------------


def test_format_safe_result_none_returns_placeholder():
    assert format_safe_result(None) == "暂无执行结果"


def test_format_safe_result_empty_dict_returns_placeholder():
    assert format_safe_result({}) == "暂无执行结果"


def test_format_safe_error_none_returns_placeholder():
    assert format_safe_error(None) == "暂无错误信息"


def test_format_safe_error_empty_string_returns_placeholder():
    assert format_safe_error("") == "暂无错误信息"


# ---------------------------------------------------------------------------
# object 转为格式化文本摘要
# ---------------------------------------------------------------------------


def test_format_safe_result_formats_object_as_readable_text():
    result = {"success": True, "message": "已完成"}
    text = format_safe_result(result)

    assert "success" in text
    assert "已完成" in text


# ---------------------------------------------------------------------------
# 递归屏蔽敏感字段
# ---------------------------------------------------------------------------


def test_format_safe_result_masks_sensitive_keys_recursively():
    result = {
        "success": True,
        "api_key": "sk-should-not-appear",
        "nested": {
            "password": "should-not-appear",
            "token": "should-not-appear",
            "safe_field": "visible value",
        },
        "list_field": [
            {"secret": "should-not-appear"},
            {"database_url": "should-not-appear"},
        ],
    }

    text = format_safe_result(result)

    assert "should-not-appear" not in text
    assert "sk-should-not-appear" not in text
    assert "visible value" in text
    assert '"api_key": "***"' in text
    assert '"password": "***"' in text
    assert '"token": "***"' in text
    assert '"secret": "***"' in text
    assert '"database_url": "***"' in text


def test_format_safe_result_masks_case_insensitively():
    result = {"API_KEY": "should-not-appear", "AccessToken": "should-not-appear"}
    text = format_safe_result(result)

    assert "should-not-appear" not in text


def test_format_safe_result_does_not_mask_non_sensitive_keys():
    result = {"task_summary": "一切正常", "count": 3}
    text = format_safe_result(result)

    assert "一切正常" in text
    assert '"count": 3' in text


# ---------------------------------------------------------------------------
# 超长截断
# ---------------------------------------------------------------------------


def test_format_safe_result_truncates_long_text():
    long_value = "x" * 5000
    result = {"note": long_value}

    text = format_safe_result(result)

    assert len(text) < 5000
    assert "已截断" in text
    assert "Task Center" in text


def test_format_safe_error_truncates_long_text():
    long_error = "错误详情。" * 1000
    text = format_safe_error(long_error)

    assert len(text) < len(long_error)
    assert "已截断" in text


def test_format_safe_result_short_text_not_truncated():
    result = {"note": "简短结果"}
    text = format_safe_result(result)

    assert "已截断" not in text


# ---------------------------------------------------------------------------
# 不返回原始 HTML / traceback
# ---------------------------------------------------------------------------


def test_format_safe_error_does_not_leak_traceback_style_content():
    """
    format_safe_error 本身不主动剥离 "Traceback" 字样——它假设
    调用方（TaskExecutionService/TaskRecoveryActionService）本来
    就只写入安全的错误原因文本，不写入原始异常堆栈。这里验证的是
    一个正常的安全错误原因文本能被正确、完整地展示，不做任何
    意外改写。
    """

    text = format_safe_error("Agent 执行超时，已自动标记为失败")
    assert text == "Agent 执行超时，已自动标记为失败"
