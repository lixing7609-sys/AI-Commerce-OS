from copy import deepcopy

from app.founder_ai.ui_behavior_discovery import (
    discover_existing_ui_controls, extract_acceptance_cardinality,
)


def test_exactly_one_cardinality_is_current_task_authority():
    for phrase in ("显示一个清晰的清除入口", "只保留一个操作按钮", "使用唯一的 control", "exactly one clear button"):
        result = extract_acceptance_cardinality(phrase)
        assert result["cardinality"] == "exactly_one"
        assert result["expected_visible_count"] == 1
        assert result["duplicate_control_absent"] is True
        assert result["source"] == "current_task_acceptance"


def test_cardinality_supports_at_least_one_and_none_without_guessing_ambiguous_text():
    assert extract_acceptance_cardinality("至少一个操作入口")["cardinality"] == "at_least_one"
    assert extract_acceptance_cardinality("不要显示任何操作按钮")["cardinality"] == "none"
    assert extract_acceptance_cardinality("增加清除能力并保持布局") is None
    assert extract_acceptance_cardinality("让我可以一次恢复列表") is None


def test_existing_control_discovery_is_read_only_and_scope_preserving(tmp_path):
    source = tmp_path / "SearchPanel.jsx"
    source.write_text(
        '<input type="search" aria-label="Find items" onKeyDown={(event) => {'
        ' if (event.key === "Escape") clear(); }} />'
        '<button aria-label="Clear query" className="clear-control" onClick={() => clear()}>x</button>'
    )
    scope = {
        "allowed_modules": ["Fixture UI"],
        "allowed_file_patterns": ["SearchPanel.jsx"],
        "write_scope": {"allowed_patterns": ["SearchPanel.jsx"]},
    }
    original = deepcopy(scope)
    result = discover_existing_ui_controls(repo_root=tmp_path, semantic_scope=scope, acceptance_text="single clear control")
    assert result["mode"] == "read_only"
    assert result["controls"][0]["input_type"] == "search"
    assert result["controls"][0]["aria_label"] == "Find items"
    assert result["browser_native_controls"][0]["capability"] == "search_cancel"
    assert result["controls"][-1]["click_behavior"] == "application_handler_present"
    assert result["current_control_cardinality"] == {
        "application_clear_controls": 1, "native_search_cancel_capabilities": 1,
        "declared_visible_native_search_cancel_controls": 1,
        "declared_effective_clear_controls": 2,
    }
    assert result["keyboard_behaviors"][0]["key"] == "Escape"
    assert result["scope_unchanged"] is True and scope == original
    assert all(result[key] is False for key in (
        "scope_authority", "risk_authority", "approval_authority",
        "completion_authority", "verification_override_authority",
    ))


def test_discovery_distinguishes_native_capability_from_declared_visibility(tmp_path):
    (tmp_path / "Search.jsx").write_text(
        '<input type="search" data-native-search-cancel="hidden" />'
        '<button aria-label="Clear" onClick={() => clear()}>x</button>'
    )
    result = discover_existing_ui_controls(
        repo_root=tmp_path,
        semantic_scope={"allowed_modules": ["UI"], "allowed_file_patterns": ["Search.jsx"]},
        acceptance_text="exactly one clear control",
    )
    assert result["browser_native_controls"][0]["suppression_declared"] is True
    assert result["current_control_cardinality"]["declared_effective_clear_controls"] == 1


def test_control_state_discovery_records_existing_behavior_without_mutating_scope(tmp_path):
    (tmp_path / "ModeControl.jsx").write_text(
        '<div className="mode-group"><button className={active ? "is-active" : ""} '
        'aria-pressed={active} onClick={() => choose()}>Mode</button></div>'
    )
    scope = {
        "allowed_modules": ["Fixture UI"],
        "allowed_file_patterns": ["ModeControl.jsx"],
        "write_scope": {"allowed_patterns": ["ModeControl.jsx"]},
        "control_state_profile": {
            "control_group": "mode_selector",
            "control_locator": {"strategy": "css", "value": "button"},
            "state_representation": {"type": "class", "name": "is-active", "active_value": True},
            "accessibility_semantics": {"attribute": "aria-pressed", "active_value": "true", "inactive_value": "false"},
            "expected_active_count": 1,
        },
    }
    original = deepcopy(scope)
    result = discover_existing_ui_controls(
        repo_root=tmp_path, semantic_scope=scope, acceptance_text="make selected state accessible",
    )
    discovery = result["control_state_discovery"]
    assert discovery["mode"] == "read_only"
    assert discovery["existing_class_states"] == ["is-active"]
    assert discovery["existing_aria_states"] == ["aria-pressed"]
    assert discovery["single_active_behavior_detected"] is True
    assert discovery["click_behavior_detected"] is True
    assert result["scope_unchanged"] is True
    assert scope == original
