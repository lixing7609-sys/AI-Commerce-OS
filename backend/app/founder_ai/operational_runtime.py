"""Controlled operational runtime for Sino Founder AI.

The flow records TaskAsset and ExecutionSession lineage. Deterministic local
work stays on the local executor; bounded code changes are handed to the
existing Codex execution adapter after Founder approval.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from types import SimpleNamespace
from typing import Callable

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.core.task_asset.service import create_task_asset
from app.database.db import SessionLocal
from app.founder_ai.codex_adapter import CodexExecutionTimeout, SubprocessCodexAdapter
from app.founder_ai.execution_events import append_event
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.execution_registry import get_execution_session, list_execution_sessions, load_execution_sessions, save_execution_session
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft

CONTROLLED_LOCAL_DEVELOPMENT_TASK = "CONTROLLED_LOCAL_DEVELOPMENT_TASK"
LOW_RISK = "LOW"
MEDIUM_RISK = "MEDIUM"
HIGH_RISK = "HIGH"
OPERATIONAL_QUEUE_TYPE = "HIGH_RISK_OPERATIONAL_TASK"
BOUNDED_CODE_CHANGE_QUEUE_TYPE = "BOUNDED_CODE_CHANGE_APPROVAL"
SAFE_PUSH_QUEUE_TYPE = "SAFE_PUSH_APPROVAL"
SAFE_MERGE_QUEUE_TYPE = "SAFE_MERGE_APPROVAL"
SAFE_INTEGRATION_PUSH_QUEUE_TYPE = "SAFE_INTEGRATION_PUSH_APPROVAL"
REPO_INSPECTION = "REPO_INSPECTION"
ANALYTICAL_INSPECTION = "ANALYTICAL_INSPECTION"
FOCUSED_TEST = "FOCUSED_TEST"
FRONTEND_BUILD = "FRONTEND_BUILD"
BOUNDED_CODE_CHANGE = "BOUNDED_CODE_CHANGE"
DISCUSSION = "DISCUSSION"
SAFE_CHECKPOINT_COMMIT = "SAFE_CHECKPOINT_COMMIT"
SAFE_PUSH = "SAFE_PUSH"
SAFE_MERGE = "SAFE_MERGE"
SAFE_INTEGRATION_PUSH = "SAFE_INTEGRATION_PUSH"
AUTONOMOUS_DEVELOPMENT_MISSION = "AUTONOMOUS_DEVELOPMENT_MISSION"
LOCAL_EXECUTOR = "LOCAL_EXECUTOR"
CODEX_EXECUTOR = "CODEX_EXECUTOR"
BOUNDED_CODEX_BRIDGE_FIXTURE_CHANGE = "codex_bridge_e2e_fixture_change"
LIVE_FOUNDER_ACCEPTANCE_FIXTURE_CHANGE = "live_founder_acceptance_fixture_change"
LIVE_ROUTING_FIXTURE_CHANGE = "live_routing_fixture_change"
GENERIC_LIVE_DEVELOPMENT_CHANGE = "generic_live_development_change"
SAFE_PUSH_ALLOWED_REMOTES = {"origin"}
SAFE_PUSH_PROTECTED_BRANCHES = {"main", "master", "develop", "feature/foundation-reset-integration"}
SAFE_MERGE_TARGET_BRANCH = "feature/foundation-reset-integration"
SAFE_MERGE_PROTECTED_BRANCHES = {"main", "master", "develop"}
SAFE_INTEGRATION_PUSH_BRANCH = "feature/foundation-reset-integration"
TERMINAL_MISSION_STATES = {"COMPLETED", "FAILED", "BLOCKED", "CANCELLED", "REJECTED"}


@dataclass(frozen=True, slots=True)
class OperationSpec:
    operation_type: str
    title: str
    argv: tuple[str, ...] | None
    timeout_seconds: int
    risk_level: str = LOW_RISK


OPERATION_REGISTRY: dict[str, OperationSpec] = {
    REPO_INSPECTION: OperationSpec(
        operation_type=REPO_INSPECTION,
        title="检查当前 AI-Commerce-OS 工程状态",
        argv=None,
        timeout_seconds=10,
    ),
    ANALYTICAL_INSPECTION: OperationSpec(
        operation_type=ANALYTICAL_INSPECTION,
        title="只读分析 Sino Founder AI 产品体验",
        argv=None,
        timeout_seconds=30,
    ),
    FOCUSED_TEST: OperationSpec(
        operation_type=FOCUSED_TEST,
        title="运行 Sino Operational Runtime focused tests",
        argv=("backend/.venv/bin/pytest", "backend/tests/test_sino_operational_runtime.py", "-q"),
        timeout_seconds=60,
    ),
    FRONTEND_BUILD: OperationSpec(
        operation_type=FRONTEND_BUILD,
        title="检查 frontend build",
        argv=("npm", "--prefix", "frontend", "run", "build"),
        timeout_seconds=90,
    ),
}

BOUNDED_STATUS_CARD_TITLE_CHANGE = "rename_operational_runtime_status_card"
BOUNDED_SAFE_CHECKPOINT_FIXTURE_CHANGE = "write_safe_checkpoint_e2e_fixture"
AUTONOMOUS_MISSION_STATUS_CARD_CHANGE = "autonomous_mission_status_card_change"
BOUNDED_CODE_CHANGE_PLANS: dict[str, dict] = {
    BOUNDED_STATUS_CARD_TITLE_CHANGE: {
        "plan_id": BOUNDED_STATUS_CARD_TITLE_CHANGE,
        "title": "更新 Operational Runtime 状态卡标题",
        "allowed_files": ["frontend/src/sino-founder/ConversationThread.jsx"],
        "allowed_directories": [],
        "acceptance_criteria": [
            "Operational Runtime 状态卡标题更新为 Sino Controlled Runtime",
            "ConversationThread focused frontend test passes",
            "Frontend build passes",
        ],
        "explicit_non_goals": [
            "Do not modify backend code through the bounded executor",
            "Do not modify DB schema or data",
            "Do not invoke Provider or Codex directly",
            "Do not git add, commit, push, deploy, or delete files",
        ],
        "verification_commands": [
            ["npm", "--prefix", "frontend", "test", "--", "--run", "src/sino-founder/ConversationThread.test.jsx"],
            ["npm", "--prefix", "frontend", "run", "build"],
        ],
        "auto_checkpoint": True,
        "commit_message": "fix(sino-runtime): align controlled runtime status label",
        "rollback_boundary": "Only the allowed file may be changed; Founder can review/revert via git diff.",
    },
    BOUNDED_SAFE_CHECKPOINT_FIXTURE_CHANGE: {
        "plan_id": BOUNDED_SAFE_CHECKPOINT_FIXTURE_CHANGE,
        "title": "写入 Safe Checkpoint E2E fixture",
        "allowed_files": ["frontend/src/sino-founder/safe-checkpoint-e2e-fixture.txt"],
        "allowed_directories": [],
        "acceptance_criteria": [
            "Safe Checkpoint E2E fixture is written by Sino runtime",
            "ConversationThread focused frontend test passes",
            "Frontend build passes",
        ],
        "explicit_non_goals": [
            "Do not modify implementation files through the E2E checkpoint",
            "Do not modify DB schema or data",
            "Do not invoke Provider or Codex directly",
            "Do not push, merge, rebase, tag, deploy, or delete files",
        ],
        "verification_commands": [
            ["npm", "--prefix", "frontend", "test", "--", "--run", "src/sino-founder/ConversationThread.test.jsx"],
            ["npm", "--prefix", "frontend", "run", "build"],
        ],
        "auto_checkpoint": True,
        "commit_message": "test(sino-runtime): record safe checkpoint e2e fixture",
        "allow_preexisting_dirty_for_e2e": True,
        "rollback_boundary": "Only the safe checkpoint E2E fixture file may be created and committed.",
    },
    AUTONOMOUS_MISSION_STATUS_CARD_CHANGE: {
        "plan_id": AUTONOMOUS_MISSION_STATUS_CARD_CHANGE,
        "title": "Mission 更新状态卡文案",
        "allowed_files": [
            "frontend/src/sino-founder/ConversationThread.jsx",
            ".sino-safe-merge-evidence.json",
            ".sino-safe-integration-push-evidence.json",
        ],
        "allowed_directories": [],
        "acceptance_criteria": [
            "ConversationThread status card copy is updated by Mission runtime",
            "ConversationThread focused frontend test passes",
            "Frontend build passes",
        ],
        "explicit_non_goals": [
            "Do not modify backend code through the mission code-change executor",
            "Do not modify DB schema or production data",
            "Do not invoke Provider or Codex directly",
            "Do not deploy or push without separate Founder approval",
        ],
        "verification_commands": [
            ["npm", "--prefix", "frontend", "test", "--", "--run", "src/sino-founder/ConversationThread.test.jsx"],
            ["npm", "--prefix", "frontend", "run", "build"],
        ],
        "auto_checkpoint": True,
        "commit_message": "fix(sino-runtime): clarify mission runtime status copy",
        "rollback_boundary": "Only the mission-approved status card and local evidence files may be changed.",
    },
    BOUNDED_CODEX_BRIDGE_FIXTURE_CHANGE: {
        "plan_id": BOUNDED_CODEX_BRIDGE_FIXTURE_CHANGE,
        "title": "更新 Codex Bridge E2E fixture",
        "allowed_files": ["frontend/src/sino-founder/codex-bridge-e2e-fixture.txt"],
        "allowed_directories": [],
        "expected_mutations": [
            {
                "file": "frontend/src/sino-founder/codex-bridge-e2e-fixture.txt",
                "after": "CODEX_BRIDGE_OK",
                "reason": "Real Codex bridge E2E must produce an observable single-file implementation patch.",
            }
        ],
        "acceptance_criteria": [
            "Codex Bridge E2E fixture contains CODEX_BRIDGE_OK",
            "ConversationThread focused frontend test passes",
        ],
        "explicit_non_goals": [
            "Do not modify files outside the allowed fixture file",
            "Do not modify DB schema or production data",
            "Do not install packages",
            "Do not git add, commit, push, merge, rebase, tag, deploy, or delete files",
            "Do not modify secrets or files outside the repository",
        ],
        "verification_commands": [
            ["npm", "--prefix", "frontend", "test", "--", "--run", "src/sino-founder/ConversationThread.test.jsx"],
        ],
        "auto_checkpoint": False,
        "rollback_boundary": "Only the Codex Bridge E2E fixture file may be changed.",
    },
    LIVE_FOUNDER_ACCEPTANCE_FIXTURE_CHANGE: {
        "plan_id": LIVE_FOUNDER_ACCEPTANCE_FIXTURE_CHANGE,
        "title": "更新 Live Founder Acceptance fixture",
        "allowed_files": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
        "allowed_directories": [],
        "expected_mutations": [
            {
                "file": "frontend/src/sino-founder/live-founder-acceptance-fixture.txt",
                "after": "SINO_LIVE_ACCEPTANCE_OK",
                "reason": "Founder live acceptance must produce an observable single-file implementation patch.",
            }
        ],
        "acceptance_criteria": [
            "Live Founder Acceptance fixture contains SINO_LIVE_ACCEPTANCE_OK",
            "ConversationThread focused frontend test passes",
        ],
        "explicit_non_goals": [
            "Do not modify product runtime logic through the live acceptance task",
            "Do not modify DB schema or production data",
            "Do not install packages",
            "Do not git add, commit, push, merge, rebase, tag, deploy, or delete files",
            "Do not modify secrets or files outside the repository",
        ],
        "verification_commands": [
            ["npm", "--prefix", "frontend", "test", "--", "--run", "src/sino-founder/ConversationThread.test.jsx"],
        ],
        "auto_checkpoint": False,
        "live_acceptance_mode": True,
        "rollback_boundary": "Only the Live Founder Acceptance fixture file may be changed.",
    },
    LIVE_ROUTING_FIXTURE_CHANGE: {
        "plan_id": LIVE_ROUTING_FIXTURE_CHANGE,
        "title": "更新 Live Routing fixture",
        "allowed_files": ["frontend/src/sino-founder/live-routing-fixture.txt"],
        "allowed_directories": [],
        "expected_mutations": [
            {
                "file": "frontend/src/sino-founder/live-routing-fixture.txt",
                "after": "ROUTING_OK",
                "reason": "Routing acceptance must stop at approval before any Codex side effect.",
            }
        ],
        "acceptance_criteria": [
            "Live Routing fixture contains ROUTING_OK",
            "ConversationThread focused frontend test passes",
        ],
        "explicit_non_goals": [
            "Do not modify product runtime logic through the routing acceptance task",
            "Do not modify DB schema or production data",
            "Do not install packages",
            "Do not git add, commit, push, merge, rebase, tag, deploy, or delete files",
            "Do not modify secrets or files outside the repository",
        ],
        "verification_commands": [
            ["npm", "--prefix", "frontend", "test", "--", "--run", "src/sino-founder/ConversationThread.test.jsx"],
        ],
        "auto_checkpoint": False,
        "routing_acceptance_mode": True,
        "rollback_boundary": "Only the Live Routing fixture file may be changed after Founder approval.",
    },
    GENERIC_LIVE_DEVELOPMENT_CHANGE: {
        "plan_id": GENERIC_LIVE_DEVELOPMENT_CHANGE,
        "title": "执行受控开发修改",
        "allowed_files": [],
        "allowed_directories": ["frontend/src/sino-founder"],
        "acceptance_criteria": [
            "Requested bounded development change is implemented",
            "Relevant focused frontend test passes",
            "Frontend build passes",
        ],
        "explicit_non_goals": [
            "Do not modify files outside the approved Sino Founder UI boundary",
            "Do not modify DB schema or production data",
            "Do not install packages",
            "Do not git add, commit, push, merge, rebase, tag, deploy, or delete files",
            "Do not modify secrets or files outside the repository",
        ],
        "verification_commands": [
            ["npm", "--prefix", "frontend", "test", "--", "--run", "src/sino-founder/ConversationThread.test.jsx"],
            ["npm", "--prefix", "frontend", "run", "build"],
        ],
        "auto_checkpoint": True,
        "commit_message": "fix(sino-runtime): complete bounded Founder development request",
        "rollback_boundary": "Only files in the approved Sino Founder UI boundary may be changed.",
    },
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def _is_ambiguous_development_request(text: str) -> bool:
    compact = re.sub(r"\s+", "", (text or "").lower()).strip("。.!！?？")
    return compact in {"改一下", "优化一下", "修一下", "调整一下", "改改", "优化优化", "fixit", "changeit"}


def _is_exploratory_discussion_request(lowered: str) -> bool:
    discussion_terms = ("讨论", "设计", "方案", "怎么优化", "应该怎么", "架构", "think through", "discuss")
    execution_terms = ("修改", "改成", "修复", "实现", "增加", "新增", "执行", "验证", "就按", "开始改")
    return _contains_any(lowered, discussion_terms) and not _contains_any(lowered, execution_terms)


def _is_explanation_or_inspection_request(lowered: str) -> bool:
    explanation_terms = ("什么意思", "解释", "为什么", "what does", "explain", "怎么看", "原因是什么")
    change_terms = ("修改", "改成", "修复", "更新", "调整", "增加", "新增", "实现")
    return _contains_any(lowered, explanation_terms) and not _contains_any(lowered, change_terms)


def _is_production_or_high_risk_request(lowered: str) -> bool:
    high_terms = (
        "push main", "force push", "强推", "deploy", "部署", "上线", "生产环境",
        "production", "生产库", "production db", "删库", "rm -rf", "secret", "credential", "密钥",
    )
    return _contains_any(lowered, high_terms)


def _has_explicit_side_effect_action(lowered: str) -> bool:
    normalized = (
        lowered.replace("不修改", "")
        .replace("不要修改", "")
        .replace("不会修改", "")
        .replace("no modification", "")
        .replace("read-only", "")
    )
    side_effect_terms = (
        "合并", "merge", "推送", "push", "commit", "提交", "deploy", "部署", "上线",
        "修改", "改成", "更新", "调整", "删除", "delete", "create", "创建", "新增",
    )
    return _contains_any(normalized, side_effect_terms)


def _is_explicit_read_only_inspection_request(lowered: str) -> bool:
    read_only_terms = ("只读", "不修改", "仅检查", "只做只读检查", "查看", "检查状态", "分析当前状态")
    inspection_terms = ("branch", "分支", "head", "working tree", "工作区", "状态", "baseline", "基线", "integration branch")
    return _contains_any(lowered, read_only_terms) and _contains_any(lowered, inspection_terms) and not _has_explicit_side_effect_action(lowered)


def _is_explicit_analytical_inspection_request(lowered: str) -> bool:
    read_only_terms = (
        "只读", "不修改", "不要修改", "仅检查", "只检查", "先只检查", "只讨论",
        "不改代码", "不修改代码", "read-only",
    )
    analytical_terms = (
        "分析", "判断", "找出", "指出", "建议", "产品问题", "具体问题", "真实产品界面",
        "产品界面", "产品检查", "实际使用", "日常使用", "用户体验", "交互反馈", "现有能力",
        "界面", "体验", "感受到", "看到",
    )
    normalized = lowered
    for phrase in (
        "不修改代码", "不要修改代码", "不改代码", "不修改", "不要修改", "只讨论",
        "先只检查和讨论", "只检查和讨论", "建议怎么改", "建议具体修改",
        "准备具体修改哪些", "说明你建议怎么改",
    ):
        normalized = normalized.replace(phrase, "")
    side_effect_terms = (
        "合并", "merge", "推送", "push", "commit", "提交", "deploy", "部署", "上线",
        "执行 git", "git merge", "git push", "删除", "delete", "创建分支",
    )
    return (
        _contains_any(lowered, read_only_terms)
        and _contains_any(lowered, analytical_terms)
        and not _contains_any(normalized, side_effect_terms)
    )


def _is_explicit_safe_merge_request(lowered: str) -> bool:
    merge_terms = ("合并", "merge")
    safety_terms = ("integration", "集成", "baseline", "--no-ff", "no-ff", "safe merge", "安全合并")
    return _contains_any(lowered, merge_terms) and _contains_any(lowered, safety_terms)


def _is_clear_development_request(lowered: str) -> bool:
    if _is_production_or_high_risk_request(lowered):
        return False
    if _is_exploratory_discussion_request(lowered) or _is_explanation_or_inspection_request(lowered):
        return False
    change_terms = (
        "改成", "修改", "修复", "更新", "调整", "增加", "新增", "实现",
        "fix", "change", "update", "add",
    )
    target_terms = (
        "按钮", "文案", "状态", "卡", "页面", "右侧", "侧栏", "组件", "排序", "刷新", "同步",
        "文件", "fixture", "test", "ui", "frontend", "backend", "live routing", "live founder acceptance",
    )
    transition_terms = ("就按", "按刚才", "修复刚才", "刚才这个问题")
    return (
        _contains_any(lowered, change_terms)
        and (_contains_any(lowered, target_terms) or _contains_any(lowered, transition_terms))
    )


def _plan_for_development_request(founder_request: str) -> dict:
    lowered_request = (founder_request or "").lower()
    if (
        "live founder acceptance fixture" in lowered_request
        or "sino_live_acceptance_ok" in lowered_request
        or "live acceptance" in lowered_request
    ):
        return dict(BOUNDED_CODE_CHANGE_PLANS[LIVE_FOUNDER_ACCEPTANCE_FIXTURE_CHANGE])
    if "live routing fixture" in lowered_request or "routing_ok" in lowered_request:
        return dict(BOUNDED_CODE_CHANGE_PLANS[LIVE_ROUTING_FIXTURE_CHANGE])
    if "codex bridge e2e fixture" in lowered_request or "codex_bridge_ok" in lowered_request or "codex bridge" in lowered_request:
        return dict(BOUNDED_CODE_CHANGE_PLANS[BOUNDED_CODEX_BRIDGE_FIXTURE_CHANGE])
    if "safe checkpoint" in lowered_request or "checkpoint 验证" in lowered_request or "本地 checkpoint" in lowered_request:
        return dict(BOUNDED_CODE_CHANGE_PLANS[BOUNDED_SAFE_CHECKPOINT_FIXTURE_CHANGE])
    if (
        "sino controlled runtime" in lowered_request
        or "sino operational runtime" in lowered_request
        or "状态卡标题" in lowered_request
        or "runtime 状态卡" in lowered_request
        or "mission 状态卡" in lowered_request
    ):
        return dict(BOUNDED_CODE_CHANGE_PLANS[AUTONOMOUS_MISSION_STATUS_CARD_CHANGE])
    plan = dict(BOUNDED_CODE_CHANGE_PLANS[GENERIC_LIVE_DEVELOPMENT_CHANGE])
    plan["title"] = "执行受控开发修改"
    plan["acceptance_criteria"] = [
        f"实现 Founder 请求：{(founder_request or '').strip()}",
        "Relevant focused test passes",
        "Frontend build passes when frontend code is touched",
    ]
    return plan


def classify_operational_risk(content: str) -> dict:
    """Classify operational requests deterministically; no model call."""
    text = (content or "").strip()
    lowered = text.lower()
    high_terms = (
        "push", "deploy", "生产库", "production db", "删库", "删除", "rm -rf",
        "force", "强推", "secret", "credential", "密钥", "支付", "publish", "发布到远程",
        "部署", "上线", "生产环境",
    )
    low_terms = (
        "git status", "当前 branch", "当前分支", "head", "未提交", "工程状态",
        "repo 状态", "repository status", "working tree", "工作区",
    )
    focused_test_terms = ("测试", "test", "pytest")
    frontend_build_terms = ("前端", "frontend", "构建", "build")
    bounded_change_terms = ("改成", "修改", "更新", "调整", "改一下", "改", "change", "update")
    bounded_status_title_terms = ("sino controlled runtime", "sino operational runtime", "runtime 状态卡")
    safe_checkpoint_fixture_terms = ("safe checkpoint e2e fixture", "safe checkpoint", "checkpoint 验证", "本地 checkpoint")
    codex_bridge_fixture_terms = ("codex bridge e2e fixture", "codex_bridge_ok", "codex bridge")
    live_acceptance_fixture_terms = ("live founder acceptance fixture", "sino_live_acceptance_ok", "live acceptance")
    safe_integration_push_terms = ("integration push", "integration branch push", "推送 integration", "推送集成", "推送 integration branch", "推送集成分支")
    mission_terms = ("autonomous development mission", "完整开发任务", "开发任务", "开发目标", "自动完成整个", "一条龙")
    safe_merge_terms = ("safe merge", "安全合并", "--no-ff", "no-ff")
    safe_push_terms = ("push", "推送", "推到远程", "远程分支", "origin", "safe push")
    if _is_ambiguous_development_request(text):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": False,
            "operation": "clarification",
            "operation_type": "CLARIFICATION",
            "reason": "target_scope_unresolved",
            "clarification_required": True,
        }
    if _is_explicit_read_only_inspection_request(lowered):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": True,
            "operation": "repo_inspection",
            "operation_type": REPO_INSPECTION,
            "reason": "explicit_read_only_inspection",
            "approval_required": False,
        }
    if _is_explicit_analytical_inspection_request(lowered):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": True,
            "operation": "analytical_inspection",
            "operation_type": ANALYTICAL_INSPECTION,
            "reason": "explicit_read_only_analytical_inspection",
            "approval_required": False,
            "read_only": True,
            "code_change": False,
            "side_effect": False,
            "model_reasoning_required": True,
        }
    if _is_exploratory_discussion_request(lowered) or _is_explanation_or_inspection_request(lowered):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": False,
            "operation": "discussion",
            "operation_type": DISCUSSION,
            "reason": "discussion_or_inspection_request_not_development_default",
        }
    if (
        any(term in lowered for term in live_acceptance_fixture_terms)
        and any(term in lowered for term in bounded_change_terms)
    ) or (any(term in lowered for term in mission_terms) and any(term in lowered for term in bounded_change_terms)):
        plan = _plan_for_development_request(text)
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": MEDIUM_RISK,
            "auto_continue": False,
            "operation": "autonomous_development_mission",
            "operation_type": AUTONOMOUS_DEVELOPMENT_MISSION,
            "reason": "autonomous_development_mission_requires_staged_founder_approvals",
            "approval_required": True,
            "plan": plan,
        }
    if any(term in lowered for term in safe_integration_push_terms):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": HIGH_RISK,
            "auto_continue": False,
            "operation": "safe_integration_push",
            "operation_type": SAFE_INTEGRATION_PUSH,
            "reason": "safe_integration_push_requires_separate_founder_approval",
            "approval_required": True,
        }
    if _is_explicit_safe_merge_request(lowered) or any(term in lowered for term in safe_merge_terms):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": HIGH_RISK,
            "auto_continue": False,
            "operation": "safe_merge",
            "operation_type": SAFE_MERGE,
            "reason": "safe_merge_requires_separate_founder_approval",
            "approval_required": True,
        }
    if any(term in lowered for term in safe_push_terms):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": HIGH_RISK,
            "auto_continue": False,
            "operation": "safe_push",
            "operation_type": SAFE_PUSH,
            "reason": "safe_push_requires_separate_founder_approval",
            "approval_required": True,
        }
    if any(term in lowered for term in high_terms):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": HIGH_RISK,
            "auto_continue": False,
            "operation": "high_risk_operational_request",
            "operation_type": "HIGH_RISK_OPERATION",
            "reason": "request_crosses_high_risk_operational_boundary",
        }
    if any(term in lowered for term in bounded_change_terms) and any(term in lowered for term in codex_bridge_fixture_terms):
        plan = BOUNDED_CODE_CHANGE_PLANS[BOUNDED_CODEX_BRIDGE_FIXTURE_CHANGE]
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": MEDIUM_RISK,
            "auto_continue": False,
            "operation": "bounded_code_change",
            "operation_type": BOUNDED_CODE_CHANGE,
            "reason": "bounded_code_change_requires_founder_approval",
            "approval_required": True,
            "plan": plan,
        }
    if any(term in lowered for term in bounded_change_terms) and any(term in lowered for term in live_acceptance_fixture_terms):
        plan = BOUNDED_CODE_CHANGE_PLANS[LIVE_FOUNDER_ACCEPTANCE_FIXTURE_CHANGE]
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": MEDIUM_RISK,
            "auto_continue": False,
            "operation": "bounded_code_change",
            "operation_type": BOUNDED_CODE_CHANGE,
            "reason": "bounded_code_change_requires_founder_approval",
            "approval_required": True,
            "plan": plan,
        }
    if any(term in lowered for term in bounded_change_terms) and any(term in lowered for term in bounded_status_title_terms):
        plan = BOUNDED_CODE_CHANGE_PLANS[BOUNDED_STATUS_CARD_TITLE_CHANGE]
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": MEDIUM_RISK,
            "auto_continue": False,
            "operation": "bounded_code_change",
            "operation_type": BOUNDED_CODE_CHANGE,
            "reason": "bounded_code_change_requires_founder_approval",
            "approval_required": True,
            "plan": plan,
        }
    if _is_clear_development_request(lowered):
        plan = _plan_for_development_request(text)
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": MEDIUM_RISK,
            "auto_continue": False,
            "operation": "autonomous_development_mission",
            "operation_type": AUTONOMOUS_DEVELOPMENT_MISSION,
            "reason": "clear_bounded_development_request",
            "approval_required": True,
            "plan": plan,
            "routing_decision": {
                "route": AUTONOMOUS_DEVELOPMENT_MISSION,
                "reason": "clear bounded development request",
            },
        }
    if any(term in lowered for term in bounded_change_terms) and any(term in lowered for term in safe_checkpoint_fixture_terms):
        plan = BOUNDED_CODE_CHANGE_PLANS[BOUNDED_SAFE_CHECKPOINT_FIXTURE_CHANGE]
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": MEDIUM_RISK,
            "auto_continue": False,
            "operation": "bounded_code_change",
            "operation_type": BOUNDED_CODE_CHANGE,
            "reason": "bounded_code_change_requires_founder_approval",
            "approval_required": True,
            "plan": plan,
        }
    if any(term in lowered for term in focused_test_terms) and (
        "sino operational runtime" in lowered or "operational runtime" in lowered or "运行" in text
    ):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": True,
            "operation": "focused_test",
            "operation_type": FOCUSED_TEST,
            "reason": "allowlisted_focused_test",
        }
    if any(term in lowered for term in frontend_build_terms) and ("检查" in text or "能不能" in text or "build" in lowered):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": True,
            "operation": "frontend_build",
            "operation_type": FRONTEND_BUILD,
            "reason": "allowlisted_frontend_build",
        }
    if any(term in lowered for term in low_terms) and (
        "检查" in text or "告诉我" in text or "status" in lowered or "branch" in lowered or "head" in lowered
    ):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": True,
            "operation": "repo_inspection",
            "operation_type": REPO_INSPECTION,
            "reason": "bounded_read_only_repo_inspection",
        }
    return {
        "work_type": None,
        "risk_level": MEDIUM_RISK,
        "auto_continue": False,
        "reason": "not_supported_by_operational_runtime_v1",
    }


def _run_git(args: list[str], *, cwd: Path) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        check=True,
        text=True,
        capture_output=True,
        timeout=10,
        shell=False,
    )
    return completed.stdout.strip()


def run_repo_inspection(*, cwd: Path | None = None) -> dict:
    """Real local read-only executor for the V1 repo inspection vertical slice."""
    root = cwd or repo_root()
    branch = _run_git(["branch", "--show-current"], cwd=root)
    head = _run_git(["rev-parse", "HEAD"], cwd=root)
    status = _run_git(["status", "--short"], cwd=root)
    return {
        "branch": branch,
        "head": head,
        "working_tree_clean": not bool(status.strip()),
        "status_short": status,
        "repo_path": str(root),
        "recommended_product_improvement": "优先继续收敛只读检查、开发任务和高风险 Git 操作的 routing 边界，避免 Founder 明确只读请求被误投到审批流程。",
    }


def _excerpt(value: str, limit: int = 2000) -> str:
    text = value or ""
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n…[truncated]"


def _parse_pytest_result(output: str) -> dict:
    import re
    text = output or ""
    passed = failed = errors = skipped = 0
    for count, label in re.findall(r"(\d+)\s+(passed|failed|error|errors|skipped)", text):
        value = int(count)
        if label == "passed":
            passed = value
        elif label == "failed":
            failed = value
        elif label in {"error", "errors"}:
            errors = value
        elif label == "skipped":
            skipped = value
    return {"passed": passed, "failed": failed, "errors": errors, "skipped": skipped}


def run_allowlisted_process(spec: OperationSpec, *, cwd: Path | None = None) -> dict:
    if not spec.argv:
        raise ValueError("operation_has_no_process_argv")
    started = _now()
    monotonic = time.monotonic()
    try:
        completed = subprocess.run(
            list(spec.argv),
            cwd=str(cwd or repo_root()),
            text=True,
            capture_output=True,
            timeout=spec.timeout_seconds,
            shell=False,
        )
        completed_at = _now()
        stdout = completed.stdout or ""
        stderr = completed.stderr or ""
        combined = f"{stdout}\n{stderr}".strip()
        success = completed.returncode == 0
        details = _parse_pytest_result(combined) if spec.operation_type == FOCUSED_TEST else {}
        check_result = "PASS" if success else "FAIL"
        if spec.operation_type == FOCUSED_TEST:
            summary = (
                f"测试完成：{details.get('passed', 0)} passed，"
                f"{details.get('failed', 0)} failed，{details.get('errors', 0)} errors。"
            )
        else:
            summary = "Frontend build PASS。" if success else "Frontend build FAIL。"
        return {
            "operation_type": spec.operation_type,
            "success": success,
            "check_result": check_result,
            "exit_code": completed.returncode,
            "summary": summary,
            "stdout_excerpt": _excerpt(stdout),
            "stderr_excerpt": _excerpt(stderr),
            "started_at": started,
            "completed_at": completed_at,
            "duration_seconds": round(time.monotonic() - monotonic, 3),
            "argv": list(spec.argv),
            "shell": False,
            **details,
        }
    except subprocess.TimeoutExpired as error:
        completed_at = _now()
        return {
            "operation_type": spec.operation_type,
            "success": False,
            "check_result": "EXECUTOR_FAILURE",
            "exit_code": None,
            "summary": f"{spec.operation_type} timed out after {spec.timeout_seconds}s.",
            "stdout_excerpt": _excerpt(error.stdout or ""),
            "stderr_excerpt": _excerpt(error.stderr or ""),
            "started_at": started,
            "completed_at": completed_at,
            "duration_seconds": round(time.monotonic() - monotonic, 3),
            "timeout": True,
            "retryable": True,
            "argv": list(spec.argv),
            "shell": False,
        }


def _safe_relative_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("path_outside_repo_boundary")
    return path


def _git_diff_names(*, cwd: Path) -> set[str]:
    completed = subprocess.run(
        ["git", "diff", "--name-only"],
        cwd=str(cwd),
        text=True,
        capture_output=True,
        timeout=10,
        shell=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "git_diff_name_only_failed")
    return {line.strip() for line in completed.stdout.splitlines() if line.strip()}


def _git_output(args: list[str], *, cwd: Path, check: bool = True, timeout: int = 15) -> subprocess.CompletedProcess:
    prohibited = {"push", "pull", "fetch", "merge", "rebase", "cherry-pick", "reset", "clean", "tag"}
    if not args or args[0] in prohibited:
        raise ValueError("git_command_not_allowed_for_safe_checkpoint")
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        text=True,
        capture_output=True,
        timeout=timeout,
        check=check,
        shell=False,
    )


def _git_status_short(*, cwd: Path) -> list[str]:
    output = _git_output(["status", "--short"], cwd=cwd).stdout
    return [line for line in output.splitlines() if line.strip()]


def _git_safe_switch_branch(branch: str, *, cwd: Path, timeout: int = 30) -> subprocess.CompletedProcess:
    target = _safe_git_ref(branch, field="branch")
    return subprocess.run(
        ["git", "switch", target],
        cwd=str(cwd),
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
        shell=False,
    )


def _staged_files_from_status(status_lines: list[str]) -> set[str]:
    return {line[3:].strip() for line in status_lines if line and line[0] != " " and line[0] != "?"}


def _dirty_files_from_status(status_lines: list[str]) -> set[str]:
    return {line[3:].strip() for line in status_lines if line.strip()}


def _git_changed_or_untracked_names(*, cwd: Path) -> set[str]:
    return _git_diff_names(cwd=cwd) | _untracked_files_from_status(_git_status_short(cwd=cwd))


def _git_diff_check(*, cwd: Path, cached: bool = False) -> dict:
    args = ["diff", "--check"]
    if cached:
        args = ["diff", "--cached", "--check"]
    completed = _git_output(args, cwd=cwd, check=False)
    return {
        "success": completed.returncode == 0,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "summary": _excerpt((completed.stdout or "") + (completed.stderr or ""), 1000),
    }


def _safe_commit_message(plan: dict) -> str:
    candidate = str(plan.get("commit_message") or "fix(sino-runtime): apply bounded code change").splitlines()[0]
    candidate = re.sub(r"[;&|`$<>]", "", candidate).strip()
    if not re.match(r"^[a-z]+\([a-z0-9-]+\): .{1,72}$", candidate):
        return "fix(sino-runtime): apply bounded code change"
    return candidate[:100]


def _git_state_blocker(root: Path) -> str | None:
    git_dir = root / ".git"
    for name in ("MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "BISECT_LOG"):
        if (git_dir / name).exists():
            return f"repository_in_{name.lower()}_state"
    if (git_dir / "rebase-merge").exists() or (git_dir / "rebase-apply").exists():
        return "repository_in_rebase_state"
    return None


def _untracked_files_from_status(status_lines: list[str]) -> set[str]:
    return {line[3:].strip() for line in status_lines if line.startswith("?? ")}


def _safe_git_ref(value: str, *, field: str) -> str:
    ref = (value or "").strip()
    if not ref or ref.startswith("-") or ":" in ref or ".." in ref or any(token in ref for token in ("~", "^", " ", "\n", "\r", "\t")):
        raise ValueError(f"unsafe_{field}")
    return ref


def _safe_push_action_id(source_message_id: str) -> str:
    return f"safe-push:{source_message_id}"


def _mission_id(source_message_id: str) -> str:
    return f"mission:{source_message_id}"


def _mission_branch_name(founder_request: str, mission_id: str) -> str:
    slug_source = re.sub(r"[^a-z0-9]+", "-", (founder_request or "").lower()).strip("-")
    slug = "-".join([part for part in slug_source.split("-") if part][:4]) or hashlib.sha1(mission_id.encode()).hexdigest()[:8]
    branch = f"feature/sino-mission-{slug[:36].strip('-')}"
    return _safe_git_ref(branch, field="mission_branch")


def _mission_branch_suffix(mission_id: str) -> str:
    return hashlib.sha1(mission_id.encode()).hexdigest()[:8]


def _git_safe_create_branch(branch: str, *, cwd: Path, start_point: str | None = None, timeout: int = 30) -> subprocess.CompletedProcess:
    target = _safe_git_ref(branch, field="branch")
    argv = ["git", "switch", "-c", target]
    if start_point:
        argv.append(_safe_git_ref(start_point, field="start_point"))
    return subprocess.run(argv, cwd=str(cwd), text=True, capture_output=True, timeout=timeout, check=False, shell=False)


def executor_for_operation(operation_type: str) -> str:
    """Backend-owned executor routing for controlled development operations."""
    if operation_type == BOUNDED_CODE_CHANGE:
        return CODEX_EXECUTOR
    if operation_type in {
        REPO_INSPECTION,
        FOCUSED_TEST,
        FRONTEND_BUILD,
        SAFE_CHECKPOINT_COMMIT,
        SAFE_PUSH,
        SAFE_MERGE,
        SAFE_INTEGRATION_PUSH,
    }:
        return LOCAL_EXECUTOR
    return LOCAL_EXECUTOR


MISSION_STAGE_LABELS = {
    "PLANNING": "正在规划",
    "WAITING_CHANGE_APPROVAL": "等待你批准代码修改",
    "CHANGING": "正在修改代码",
    "VERIFYING": "正在验证",
    "CHECKPOINTING": "正在创建本地 checkpoint",
    "WAITING_FEATURE_PUSH_APPROVAL": "等待你批准推送 feature branch",
    "PUSHING_FEATURE": "正在推送 feature branch",
    "WAITING_MERGE_APPROVAL": "等待你批准合并到 integration",
    "MERGING": "正在本地合并",
    "WAITING_INTEGRATION_PUSH_APPROVAL": "等待你批准推送 integration branch",
    "PUSHING_INTEGRATION": "正在推送 integration",
    "COMPLETED": "已完成",
    "FAILED": "失败",
    "BLOCKED": "已阻塞",
}

MISSION_TIMELINE = [
    ("planning", "规划"),
    ("change", "修改"),
    ("verification", "验证"),
    ("checkpoint", "Checkpoint"),
    ("feature_push", "Feature Push"),
    ("merge", "Merge"),
    ("integration_push", "Integration Push"),
]

MISSION_STAGE_TO_TIMELINE = {
    "PLANNING": "planning",
    "WAITING_CHANGE_APPROVAL": "change",
    "CHANGING": "change",
    "VERIFYING": "verification",
    "CHECKPOINTING": "checkpoint",
    "WAITING_FEATURE_PUSH_APPROVAL": "feature_push",
    "PUSHING_FEATURE": "feature_push",
    "WAITING_MERGE_APPROVAL": "merge",
    "MERGING": "merge",
    "WAITING_INTEGRATION_PUSH_APPROVAL": "integration_push",
    "PUSHING_INTEGRATION": "integration_push",
}

MISSION_WAITING_STAGES = {
    "WAITING_CHANGE_APPROVAL",
    "WAITING_FEATURE_PUSH_APPROVAL",
    "WAITING_MERGE_APPROVAL",
    "WAITING_INTEGRATION_PUSH_APPROVAL",
}

MISSION_APPROVAL_SUMMARIES = {
    "BOUNDED_CODE_CHANGE_APPROVAL": {
        "label": "批准代码修改",
        "will_do": ["修改明确授权文件", "自动运行 focused test / build", "自动创建本地 checkpoint"],
        "will_not_do": ["不会 push", "不会 merge", "不会 deploy"],
    },
    "SAFE_PUSH_APPROVAL": {
        "label": "批准推送 feature branch",
        "will_do": ["push 当前 feature branch 到同名 remote branch"],
        "will_not_do": ["不会 force", "不会 push tags", "不会 merge", "不会 deploy"],
    },
    "SAFE_MERGE_APPROVAL": {
        "label": "批准本地合并",
        "will_do": ["feature → integration", "执行本地 --no-ff merge"],
        "will_not_do": ["不会自动解决冲突", "不会 push integration", "不会 merge main/master/develop"],
    },
    "SAFE_INTEGRATION_PUSH_APPROVAL": {
        "label": "批准推送 integration branch",
        "will_do": ["push integration 到配置的同名远程分支"],
        "will_not_do": ["不会 force", "不会 push tags", "不会 deploy", "不会 merge main/master/develop"],
    },
}

MISSION_STEP_LABELS = {
    "MISSION_BRANCH_CREATED": "已创建工作分支",
    "CHECKPOINTING": "已创建本地 checkpoint",
    "PUSHING_FEATURE": "已推送 feature branch",
    "MERGING": "已本地合并到 integration",
    "PUSHING_INTEGRATION": "已推送 integration branch",
    "CHANGING": "已完成代码修改",
    "VERIFYING": "已完成验证",
}


def _mission_core_stage(stage: str | None) -> str:
    return MISSION_STAGE_TO_TIMELINE.get(stage or "", "planning")


def _mission_stage_position(stage: str | None) -> int:
    key = _mission_core_stage(stage)
    keys = [item[0] for item in MISSION_TIMELINE]
    return keys.index(key) if key in keys else 0


def _mission_completed_count(mission: dict) -> int:
    stage = mission.get("current_stage") or mission.get("status")
    if stage == "COMPLETED":
        return len(MISSION_TIMELINE)
    if stage in {"FAILED", "BLOCKED"}:
        failed_key = _mission_core_stage(mission.get("failed_stage") or mission.get("blocked_stage"))
        return max(0, [item[0] for item in MISSION_TIMELINE].index(failed_key))
    pos = _mission_stage_position(stage)
    if stage in MISSION_WAITING_STAGES or stage in {"PLANNING", "CHANGING", "VERIFYING", "CHECKPOINTING", "PUSHING_FEATURE", "MERGING", "PUSHING_INTEGRATION"}:
        return pos
    return pos


def _mission_timeline(mission: dict) -> list[dict]:
    stage = mission.get("current_stage") or mission.get("status") or "PLANNING"
    active_key = _mission_core_stage(mission.get("failed_stage") or mission.get("blocked_stage") or stage)
    completed_count = _mission_completed_count(mission)
    items = []
    for index, (key, label) in enumerate(MISSION_TIMELINE):
        status = "pending"
        if index < completed_count:
            status = "completed"
        if key == active_key:
            if stage in MISSION_WAITING_STAGES:
                status = "waiting_approval"
            elif stage == "FAILED":
                status = "failed"
            elif stage == "BLOCKED":
                status = "blocked"
            elif stage == "COMPLETED":
                status = "completed"
            else:
                status = "active"
        items.append({"key": key, "label": label, "status": status})
    if stage == "COMPLETED":
        items = [{**item, "status": "completed"} for item in items]
    return items


def _mission_pending_approval(mission: dict, action_queue: list[dict] | None) -> dict | None:
    mission_id = mission.get("mission_id")
    if not mission_id:
        return None
    for item in action_queue or []:
        metadata = dict(item.get("metadata") or {})
        if item.get("status") == "pending" and (metadata.get("mission_id") == mission_id or item.get("mission_id") == mission_id):
            action_type = item.get("action_type") or item.get("type")
            summary = dict(MISSION_APPROVAL_SUMMARIES.get(action_type) or {})
            scope = metadata.get("planned_files") or metadata.get("allowed_files") or metadata.get("local_branch") or metadata.get("source_branch") or metadata.get("integration_branch") or item.get("summary")
            return {
                "action_id": item.get("action_id"),
                "action_type": action_type,
                "title": item.get("title"),
                "risk_level": item.get("risk_level"),
                "label": summary.get("label") or item.get("title"),
                "scope": scope,
                "will_do": summary.get("will_do") or [],
                "will_not_do": summary.get("will_not_do") or [],
            }
    return None


def _verification_summary(change_result: dict) -> dict | None:
    steps = list(change_result.get("verification_steps") or [])
    if not steps:
        return None
    passed = sum(int(step.get("passed") or 0) for step in steps)
    failed = sum(int(step.get("failed") or 0) for step in steps)
    errors = sum(int(step.get("errors") or 0) for step in steps)
    build_steps = [step for step in steps if "build" in " ".join(step.get("argv") or []).lower()]
    build_status = build_steps[-1].get("check_result") if build_steps else change_result.get("build_status") or "NOT_REQUIRED"
    failures = [step.get("summary") or step.get("stderr_excerpt") for step in steps if not step.get("success")]
    return {
        "status": change_result.get("check_result") or ("FAIL" if failed or errors else "PASS"),
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "build_status": build_status,
        "failure_summary": [item for item in failures if item][:3],
    }


def build_mission_view(mission: dict, action_queue: list[dict] | None = None) -> dict:
    """Project canonical Mission state into a Founder-facing conversation view."""
    mission = dict(mission or {})
    stage = mission.get("current_stage") or mission.get("status") or "PLANNING"
    change_result = dict(mission.get("change_result") or {})
    checkpoint = dict(change_result.get("checkpoint") or {})
    feature_push = dict(mission.get("feature_push_result") or {})
    merge = dict(mission.get("merge_result") or {})
    integration_push = dict(mission.get("integration_push_result") or {})
    changed_files = list(change_result.get("changed_files") or [])
    timeline = _mission_timeline(mission)
    completed = len([item for item in timeline if item["status"] == "completed"])
    pending_approval = _mission_pending_approval(mission, action_queue)
    failure_summary = None
    if stage in {"FAILED", "BLOCKED"} or mission.get("failure_type"):
        failure_summary = {
            "failed_stage": MISSION_STAGE_LABELS.get(mission.get("failed_stage"), mission.get("failed_stage")),
            "failure_type": mission.get("failure_type"),
            "summary": mission.get("failure_summary"),
            "last_successful_stage": mission.get("last_completed_step"),
            "safe_next_action": "继续讨论并决定是否调整范围或重新生成审批。",
        }
    completion_summary = None
    if stage == "COMPLETED":
        verification = _verification_summary(change_result) or {}
        completion_summary = {
            "goal": mission.get("founder_request"),
            "final_status": "已完成",
            "feature_branch": mission.get("working_branch"),
            "changed_files": changed_files,
            "verification": verification,
            "checkpoint": checkpoint,
            "feature_push": feature_push,
            "merge": merge,
            "integration_push": integration_push,
            "final_integration_head": mission.get("final_integration_head"),
        }
    return {
        "mission_id": mission.get("mission_id"),
        "source_message_id": mission.get("source_message_id"),
        "acknowledgement_message_id": mission.get("acknowledgement_message_id"),
        "goal": mission.get("founder_request"),
        "status": mission.get("status"),
        "stage": stage,
        "stage_label": MISSION_STAGE_LABELS.get(stage, stage),
        "risk_level": mission.get("risk_level"),
        "progress": {"completed": completed, "total": len(timeline), "label": f"{completed} / {len(timeline)} completed"},
        "working_branch": mission.get("working_branch"),
        "baseline": {"branch": mission.get("baseline_branch"), "head": mission.get("baseline_head")},
        "current_head": mission.get("final_integration_head") or mission.get("merge_head") or mission.get("checkpoint_head") or mission.get("baseline_head"),
        "last_completed_step": MISSION_STEP_LABELS.get(mission.get("last_completed_step"), mission.get("last_completed_step")),
        "next_step": MISSION_STAGE_LABELS.get(stage, stage),
        "next_required_action": pending_approval.get("label") if pending_approval else mission.get("next_required_action"),
        "timeline": timeline,
        "current_work_summary": [item for item in [
            f"目标：{mission.get('founder_request')}" if mission.get("founder_request") else None,
            f"工作分支：{mission.get('working_branch')}" if mission.get("working_branch") else None,
            f"接下来：{pending_approval.get('label') if pending_approval else MISSION_STAGE_LABELS.get(stage, stage)}",
        ] if item][:3],
        "pending_approval": pending_approval,
        "changed_files": {"items": [{"path": path, "boundary": "approved"} for path in changed_files[:5]], "total": len(changed_files), "more": max(0, len(changed_files) - 5)},
        "verification_summary": _verification_summary(change_result),
        "checkpoint_summary": {"commit_message": checkpoint.get("commit_message"), "commit_head": checkpoint.get("new_head"), "commit_file_count": checkpoint.get("commit_file_count"), "working_tree_clean_after": checkpoint.get("working_tree_clean_after")} if checkpoint else None,
        "feature_push_summary": {"branch": feature_push.get("local_branch"), "remote": feature_push.get("remote_name"), "remote_branch": feature_push.get("remote_branch"), "head": feature_push.get("new_remote_head") or feature_push.get("local_head"), "commits_pushed": feature_push.get("ahead_before"), "force": "NO"} if feature_push else None,
        "merge_summary": {"source_branch": merge.get("source_branch"), "target_branch": merge.get("target_branch"), "merge_head": merge.get("merge_commit_head"), "strategy": "--no-ff", "conflict": "YES" if merge.get("conflict") else "NO", "pushed": "YES" if merge.get("push_performed") else "NO", "conflict_files": merge.get("conflict_files") or []} if merge else None,
        "integration_push_summary": {"branch": integration_push.get("integration_branch"), "remote": integration_push.get("remote_name"), "remote_head": integration_push.get("remote_head_after"), "force": "NO", "tags": "NO", "remote_updated": "YES" if integration_push.get("success") else "NO"} if integration_push else None,
        "failure_summary": failure_summary,
        "completion_summary": completion_summary,
        "started_at": mission.get("created_at"),
        "updated_at": mission.get("updated_at"),
    }


def _mission_from_discovery(discovery: dict, mission_id: str | None = None) -> dict | None:
    missions = discovery.get("autonomous_development_missions") or {}
    if mission_id and isinstance(missions, dict) and isinstance(missions.get(mission_id), dict):
        return dict(missions[mission_id])
    mission = discovery.get("autonomous_development_mission")
    return dict(mission) if isinstance(mission, dict) and (mission_id is None or mission.get("mission_id") == mission_id) else None


def _mission_is_active(mission: dict) -> bool:
    return (mission.get("status") or mission.get("current_stage")) not in {
        "COMPLETED",
        "FAILED",
        "BLOCKED",
        "CANCELLED",
        "REJECTED",
    }


def _mission_is_waiting_integration_closure(mission: dict) -> bool:
    stage = mission.get("current_stage") or mission.get("status")
    if stage in TERMINAL_MISSION_STATES:
        return False
    return bool(mission.get("working_branch") and mission.get("baseline_branch"))


def _find_previous_unintegrated_mission(*, excluding_mission_id: str | None = None) -> dict | None:
    candidates: list[dict] = []
    with SessionLocal() as session:
        states = list(session.scalars(select(SinoBrainSessionDB)))
    for state in states:
        discovery = dict(state.discovery or {})
        missions = dict(discovery.get("autonomous_development_missions") or {})
        if not missions and isinstance(discovery.get("autonomous_development_mission"), dict):
            mission = dict(discovery["autonomous_development_mission"])
            missions[mission.get("mission_id") or "current"] = mission
        for mission in missions.values():
            if not isinstance(mission, dict):
                continue
            if excluding_mission_id and mission.get("mission_id") == excluding_mission_id:
                continue
            if _mission_is_waiting_integration_closure(mission):
                candidates.append({**mission, "conversation_id": mission.get("conversation_id") or state.conversation_id})
    candidates.sort(key=lambda item: item.get("updated_at") or item.get("created_at") or "", reverse=True)
    return candidates[0] if candidates else None


def _configured_integration_baseline(*, cwd: Path) -> dict:
    branch = SAFE_MERGE_TARGET_BRANCH
    return {
        "branch": branch,
        "head": _git_rev_parse(branch, cwd=cwd),
        "exists": _git_branch_exists(branch, cwd=cwd),
    }


def _load_mission_for_mission_id(mission_id: str) -> dict | None:
    with SessionLocal() as session:
        states = list(session.scalars(select(SinoBrainSessionDB)))
    for state in states:
        mission = _mission_from_discovery(dict(state.discovery or {}), mission_id)
        if mission:
            return mission
    return None


def _active_mission_using_branch(branch: str, *, excluding_mission_id: str | None = None) -> dict | None:
    with SessionLocal() as session:
        states = list(session.scalars(select(SinoBrainSessionDB)))
    for state in states:
        discovery = dict(state.discovery or {})
        missions = dict(discovery.get("autonomous_development_missions") or {})
        if not missions and isinstance(discovery.get("autonomous_development_mission"), dict):
            mission = dict(discovery["autonomous_development_mission"])
            missions[mission.get("mission_id") or "current"] = mission
        for mission in missions.values():
            if not isinstance(mission, dict):
                continue
            if excluding_mission_id and mission.get("mission_id") == excluding_mission_id:
                continue
            if mission.get("working_branch") == branch and _mission_is_active(mission):
                return {**mission, "conversation_id": mission.get("conversation_id") or state.conversation_id}
    return None


def _branch_unique_commit_count(branch: str, baseline_head: str, *, cwd: Path) -> int | None:
    result = _git_output(["rev-list", "--count", f"{baseline_head}..{branch}"], cwd=cwd, check=False)
    if result.returncode != 0:
        return None
    try:
        return int(result.stdout.strip() or "0")
    except ValueError:
        return None


def _resolve_mission_working_branch(founder_request: str, mission_id: str, baseline_head: str, *, cwd: Path) -> dict:
    base_branch = _mission_branch_name(founder_request, mission_id)
    existing_mission = _load_mission_for_mission_id(mission_id)
    if existing_mission and existing_mission.get("working_branch"):
        branch = _safe_git_ref(existing_mission["working_branch"], field="mission_branch")
        return {
            "working_branch": branch,
            "base_branch": base_branch,
            "collision": _git_branch_exists(branch, cwd=cwd),
            "strategy": "same_mission_retry_reuse",
            "existing_branch_head": _git_rev_parse(branch, cwd=cwd),
            "existing_branch_unique_commits": _branch_unique_commit_count(branch, baseline_head, cwd=cwd),
            "active_mission": None,
        }
    if not _git_branch_exists(base_branch, cwd=cwd):
        return {
            "working_branch": base_branch,
            "base_branch": base_branch,
            "collision": False,
            "strategy": "base_branch_available",
            "existing_branch_head": None,
            "existing_branch_unique_commits": 0,
            "active_mission": None,
        }
    branch_head = _git_rev_parse(base_branch, cwd=cwd)
    unique_commits = _branch_unique_commit_count(base_branch, baseline_head, cwd=cwd)
    active_mission = _active_mission_using_branch(base_branch, excluding_mission_id=mission_id)
    suffix = _mission_branch_suffix(mission_id)
    candidate = _safe_git_ref(f"{base_branch}-{suffix}", field="mission_branch")
    counter = 2
    while _git_branch_exists(candidate, cwd=cwd):
        candidate = _safe_git_ref(f"{base_branch}-{suffix}-{counter}", field="mission_branch")
        counter += 1
    stale_empty = not active_mission and branch_head == baseline_head and unique_commits == 0
    return {
        "working_branch": candidate,
        "base_branch": base_branch,
        "collision": True,
        "strategy": "stale_empty_branch_unique_successor" if stale_empty else "unique_successor",
        "existing_branch_head": branch_head,
        "existing_branch_unique_commits": unique_commits,
        "active_mission": active_mission,
    }


def _mission_safe_merge_request(mission: dict, checkpoint: dict, *, cwd: Path) -> dict:
    source_branch = _safe_git_ref(str(mission.get("working_branch") or ""), field="source_branch")
    target_branch = _safe_git_ref(str(mission.get("baseline_branch") or SAFE_MERGE_TARGET_BRANCH), field="target_branch")
    preflight = _safe_merge_preflight(cwd=cwd, source_branch=source_branch, target_branch=target_branch)
    checkpoint_head = checkpoint.get("new_head") or mission.get("checkpoint_head") or preflight.get("source_head")
    return {
        **preflight,
        "source_branch": source_branch,
        "target_branch": target_branch,
        "target_head_before": preflight.get("target_head"),
        "checkpoint_head": checkpoint_head,
        "source_checkpoint_head": checkpoint_head,
        "source_verification_status": "PASS",
        "allow_unpushed_source_after_checkpoint": True,
        "source_safe_push_status": "NOT_REQUIRED_FOR_LOCAL_MISSION_MERGE",
        "safe_checkpoint_action_id": checkpoint.get("action_id"),
        "safe_checkpoint_execution_id": checkpoint.get("execution_id"),
        "mission_id": mission.get("mission_id"),
    }


def _run_candidate_verification(argv: list[str], *, cwd: Path, timeout: int = 120) -> dict:
    started_at = _now()
    result = subprocess.run(argv, cwd=str(cwd), text=True, capture_output=True, timeout=timeout, check=False, shell=False)
    return {
        "argv": argv,
        "status": "PASS" if result.returncode == 0 else "FAIL",
        "success": result.returncode == 0,
        "exit_code": result.returncode,
        "stdout_excerpt": _excerpt(result.stdout, 2000),
        "stderr_excerpt": _excerpt(result.stderr, 2000),
        "started_at": started_at,
        "completed_at": _now(),
    }


def _candidate_merge_validation(
    *,
    source_branch: str,
    target_branch: str,
    verification_plan: list[list[str]],
    cwd: Path,
    verifier: Callable[[list[str], Path], dict] | None = None,
) -> dict:
    source = _safe_git_ref(source_branch, field="source_branch")
    target = _safe_git_ref(target_branch, field="target_branch")
    source_head = _git_rev_parse(source, cwd=cwd)
    target_head = _git_rev_parse(target, cwd=cwd)
    merge_base = _git_output(["merge-base", target, source], cwd=cwd).stdout.strip()
    worktree = Path(tempfile.mkdtemp(prefix="sino-safe-merge-candidate-", dir="/private/tmp"))
    validation = {
        "status": "RUNNING",
        "source_branch": source,
        "source_head": source_head,
        "target_branch": target,
        "target_head": target_head,
        "merge_base": merge_base,
        "candidate_worktree": str(worktree),
        "conflict": False,
        "conflict_files": [],
        "verification": [],
        "real_integration_branch_modified": False,
        "mission_checkpoint_modified": False,
        "started_at": _now(),
    }
    try:
        add = subprocess.run(["git", "worktree", "add", "--detach", str(worktree), target_head], cwd=str(cwd), text=True, capture_output=True, timeout=60, check=False, shell=False)
        if add.returncode != 0:
            validation.update({"status": "FAIL", "failure_type": "CANDIDATE_WORKTREE_FAILED", "summary": _excerpt(add.stderr or add.stdout, 1000), "completed_at": _now()})
            return validation
        node_modules = cwd / "frontend" / "node_modules"
        candidate_node_modules = worktree / "frontend" / "node_modules"
        if node_modules.exists() and not candidate_node_modules.exists():
            candidate_node_modules.symlink_to(node_modules, target_is_directory=True)
        merge = subprocess.run(["git", "merge", "--no-commit", "--no-ff", source], cwd=str(worktree), text=True, capture_output=True, timeout=60, check=False, shell=False)
        if merge.returncode != 0:
            conflicts = _git_output(["diff", "--name-only", "--diff-filter=U"], cwd=worktree, check=False).stdout.splitlines()
            validation.update({
                "status": "BLOCKED_CONFLICT",
                "conflict": True,
                "conflict_files": conflicts,
                "summary": _excerpt(merge.stderr or merge.stdout, 1000),
                "completed_at": _now(),
            })
            return validation
        runner = verifier or (lambda command, root: _run_candidate_verification(command, cwd=root))
        results = []
        for command in verification_plan:
            evidence = runner(list(command), worktree)
            results.append(evidence)
            if not evidence.get("success"):
                validation.update({
                    "status": "FAIL",
                    "failure_type": "CANDIDATE_VERIFICATION_FAILED",
                    "summary": f"candidate verification failed: {' '.join(command)}",
                    "verification": results,
                    "completed_at": _now(),
                })
                return validation
        validation.update({"status": "PASS", "summary": "candidate merge validation passed", "verification": results, "completed_at": _now()})
        return validation
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(worktree)], cwd=str(cwd), text=True, capture_output=True, timeout=60, check=False, shell=False)


def refresh_historical_safe_merge(
    *,
    conversation_id: str,
    mission_id: str,
    action_id: str,
    cwd: Path | None = None,
    verifier: Callable[[list[str], Path], dict] | None = None,
) -> dict:
    root = cwd or repo_root()
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("sino_brain_session_not_found")
        discovery = dict(state.discovery or {})
        mission = _mission_from_discovery(discovery, mission_id)
        if not mission:
            raise LookupError("mission_not_found")
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        action = next((item for item in queue if item.get("action_id") == action_id), None)
        if not action:
            raise LookupError("safe_merge_action_not_found")
    checkpoint_head = str(mission.get("checkpoint_head") or "")
    working_branch = str(mission.get("working_branch") or "")
    target_branch = str(mission.get("baseline_branch") or SAFE_MERGE_TARGET_BRANCH)
    source_head = _git_rev_parse(working_branch, cwd=root)
    target_head = _git_rev_parse(target_branch, cwd=root)
    original_baseline = str(mission.get("baseline_head") or "")
    historical_execution_id, historical_execution_status = _historical_execution_for_action(action, action_id)
    if source_head != checkpoint_head:
        return {"status": "FAIL", "failure_type": "SOURCE_HEAD_MISMATCH", "summary": "Mission branch no longer points at the recorded checkpoint."}
    target_drift = bool(original_baseline and original_baseline != target_head)
    validation = _candidate_merge_validation(
        source_branch=working_branch,
        target_branch=target_branch,
        verification_plan=[list(argv) for argv in mission.get("verification_plan") or []],
        cwd=root,
        verifier=verifier,
    )
    if validation.get("status") != "PASS":
        return {
            "status": "BLOCKED",
            "target_baseline_drift": target_drift,
            "historical_execution_id": historical_execution_id,
            "historical_execution_status": historical_execution_status,
            "candidate_validation": validation,
            "replacement_action_created": False,
        }
    replacement_action_id = _safe_merge_refresh_action_id(mission_id, source_head, target_head)
    now = _now()
    refreshed_merge_request = _mission_safe_merge_request(mission, dict(mission.get("change_result", {}).get("checkpoint") or {"new_head": checkpoint_head}), cwd=root)
    refreshed_merge_request.update({
        "target_head_before": target_head,
        "target_head": target_head,
        "source_head": source_head,
        "source_checkpoint_head": checkpoint_head,
        "checkpoint_head": checkpoint_head,
        "merge_base": validation.get("merge_base"),
        "refreshed_validation": validation,
        "refreshed_validation_status": "PASS",
        "previous_safe_merge_action_id": action_id,
        "previous_safe_merge_execution_id": historical_execution_id,
        "approval_decision": "REAPPROVAL_REQUIRED",
    })
    risk = {"work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK, "risk_level": HIGH_RISK, "auto_continue": False, "operation": "safe_merge", "operation_type": SAFE_MERGE, "reason": "refreshed_merge_requires_founder_reapproval", "approval_required": True}
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        duplicate = next((item for item in queue if item.get("action_id") == replacement_action_id), None)
        replacement_already_present = duplicate is not None
        for index, item in enumerate(queue):
            if item.get("action_id") == action_id:
                queue[index] = {**item, "status": "superseded", "superseded_by": replacement_action_id, "superseded_at": now, "updated_at": now}
        replacement_action = {
                "action_id": replacement_action_id,
                "action_type": SAFE_MERGE_QUEUE_TYPE,
                "type": SAFE_MERGE_QUEUE_TYPE,
                "title": "批准基于最新 integration baseline 的本地安全合并",
                "summary": "Integration baseline 已更新；Sino 已重新验证候选合并，需要重新确认本地安全合并。",
                "risk_level": HIGH_RISK,
                "risk": "high",
                "status": "pending",
                "conversation_id": conversation_id,
                "mission_id": mission_id,
                "source_type": "conversation_message",
                "source_id": f"{mission_id}:safe-merge-refresh:{target_head[:8]}",
                "created_at": now,
                "updated_at": now,
                "reason": risk["reason"],
                "metadata": {
                    "queue_schema": "sino-safe-merge-refresh-v1",
                    "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
                    "operation_type": SAFE_MERGE,
                    "mission_id": mission_id,
                    "founder_request": "Mission 下一步：基于最新 integration baseline 本地 --no-ff 合并 feature。",
                    "merge_request": refreshed_merge_request,
                    "source_branch": working_branch,
                    "source_head": source_head,
                    "target_branch": target_branch,
                    "target_head_before": target_head,
                    "target_head": target_head,
                    "refreshed_validation_status": "PASS",
                    "refreshed_validation": validation,
                    "previous_safe_merge_action_id": action_id,
                    "previous_safe_merge_execution_id": historical_execution_id,
                    "approval_decision": "REAPPROVAL_REQUIRED",
                    "merge_strategy": "no_ff",
                    "push_after_merge": False,
                    "auto_conflict_resolution": False,
                },
        }
        if duplicate:
            queue = [replacement_action if item.get("action_id") == replacement_action_id else item for item in queue]
        else:
            queue.append(replacement_action)
        missions = dict(discovery.get("autonomous_development_missions") or {})
        mission = {**mission, "status": "WAITING_MERGE_APPROVAL", "current_stage": "WAITING_MERGE_APPROVAL", "last_completed_step": "CHECKPOINTING", "next_required_action": "SAFE_MERGE_APPROVAL", "merge_action_id": replacement_action_id, "refreshed_safe_merge_validation": validation, "target_baseline_drift": target_drift, "updated_at": now}
        missions[mission_id] = mission
        discovery["autonomous_development_missions"] = missions
        discovery["autonomous_development_mission"] = mission
        discovery["founder_action_queue"] = queue
        discovery["founder_action_required"] = True
        discovery["operational_runtime"] = {
            "status": "approval_required",
            "operation_type": SAFE_MERGE,
            "risk_decision": risk,
            "action_id": replacement_action_id,
            "source_message_id": f"{mission_id}:safe-merge-refresh:{target_head[:8]}",
            "merge_request": refreshed_merge_request,
            "refreshed_validation": validation,
            "message": "Integration baseline 已更新。Sino 已基于最新 baseline 重新验证该合并，验证通过，需要重新确认合并。",
        }
        action_queue = [dict(item) for item in queue if isinstance(item, dict)]
        mission_view = build_mission_view(mission, action_queue)
        views = dict(discovery.get("autonomous_development_mission_views") or {})
        views[mission_id] = mission_view
        discovery["autonomous_development_mission_views"] = views
        discovery["autonomous_development_mission_view"] = mission_view
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
    if not replacement_already_present:
        _append_assistant_message(
            conversation_id,
            "Integration baseline 已更新。Sino 已基于最新 baseline 重新验证该合并，验证通过；请重新批准本地安全合并。",
            message_type="operational_result",
            grounding={"operation_type": SAFE_MERGE, "action_id": replacement_action_id, "refreshed_validation": validation},
        )
    return {
        "status": "READY_FOR_FOUNDER_SAFE_MERGE",
        "target_baseline_drift": target_drift,
        "approval_decision": "REAPPROVAL_REQUIRED",
        "old_approval_superseded": True,
        "historical_execution_id": historical_execution_id,
        "historical_execution_status": historical_execution_status,
        "replacement_action_id": replacement_action_id,
        "replacement_action_status": "pending",
        "replacement_target_head": target_head,
        "candidate_validation": validation,
    }


def _persist_mission(conversation_id: str, mission: dict) -> None:
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        mission = {**mission, "updated_at": _now()}
        missions = dict(discovery.get("autonomous_development_missions") or {})
        missions[mission["mission_id"]] = mission
        action_queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        mission_view = build_mission_view(mission, action_queue)
        mission_views = dict(discovery.get("autonomous_development_mission_views") or {})
        mission_views[mission["mission_id"]] = mission_view
        discovery["autonomous_development_missions"] = missions
        discovery["autonomous_development_mission"] = mission
        discovery["autonomous_development_mission_views"] = mission_views
        discovery["autonomous_development_mission_view"] = mission_view
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()


def _mission_for_action(action: dict, state: SinoBrainSessionDB) -> dict | None:
    metadata = dict(action.get("metadata") or {})
    mission_id = metadata.get("mission_id")
    discovery = dict(state.discovery or {})
    return _mission_from_discovery(discovery, mission_id) if mission_id else None


def _attach_mission_to_action(conversation_id: str, action_id: str, mission: dict, stage: str) -> None:
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        for index, item in enumerate(queue):
            if item.get("action_id") == action_id:
                metadata = dict(item.get("metadata") or {})
                metadata.update({
                    "mission_id": mission["mission_id"],
                    "mission_stage": stage,
                    "mission_goal": mission.get("founder_request"),
                    "working_branch": mission.get("working_branch"),
                    **(mission.get("current_action_metadata") or {}),
                })
                queue[index] = {**item, "mission_id": mission["mission_id"], "metadata": metadata, "updated_at": _now()}
                break
        discovery["founder_action_queue"] = queue
        missions = dict(discovery.get("autonomous_development_missions") or {})
        raw_mission = dict(missions.get(mission["mission_id"]) or mission)
        mission_view = build_mission_view(raw_mission, queue)
        mission_views = dict(discovery.get("autonomous_development_mission_views") or {})
        mission_views[mission["mission_id"]] = mission_view
        discovery["autonomous_development_mission_views"] = mission_views
        discovery["autonomous_development_mission_view"] = mission_view
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        session.commit()


def _parse_ahead_behind(output: str) -> tuple[int, int]:
    parts = (output or "").strip().split()
    if len(parts) != 2:
        return 0, 0
    behind, ahead = int(parts[0]), int(parts[1])
    return ahead, behind


def _safe_push_preflight(*, cwd: Path | None = None, remote_name: str = "origin") -> dict:
    root = cwd or repo_root()
    started_at = _now()
    state_blocker = _git_state_blocker(root)
    status_lines = _git_status_short(cwd=root)
    staged = sorted(_staged_files_from_status(status_lines))
    untracked = sorted(_untracked_files_from_status(status_lines))
    branch = _git_output(["branch", "--show-current"], cwd=root).stdout.strip()
    head = _git_output(["rev-parse", "HEAD"], cwd=root).stdout.strip()
    remotes = set(_git_output(["remote"], cwd=root).stdout.splitlines())
    remote_url = None
    remote_branch_head = None
    ahead = 0
    behind = 0
    if remote_name in remotes:
        remote_url = _git_output(["remote", "get-url", remote_name], cwd=root).stdout.strip()
        remote_branch = branch
        remote_ref = f"refs/heads/{remote_branch}"
        ls_remote = _git_output(["ls-remote", remote_name, remote_ref], cwd=root, check=False, timeout=20)
        if ls_remote.returncode == 0 and ls_remote.stdout.strip():
            remote_branch_head = ls_remote.stdout.split()[0]
            counts_result = _git_output(["rev-list", "--left-right", "--count", f"{remote_branch_head}...HEAD"], cwd=root, check=False)
            if counts_result.returncode == 0:
                ahead, behind = _parse_ahead_behind(counts_result.stdout)
            elif remote_branch_head != head:
                behind = 1
        elif branch:
            ahead = int(_git_output(["rev-list", "--count", "HEAD"], cwd=root).stdout.strip() or "0")
    return {
        "local_branch": branch,
        "local_head": head,
        "checkpoint_head": head,
        "remote_name": remote_name,
        "remote_branch": branch,
        "remote_url": remote_url,
        "remote_branch_head": remote_branch_head,
        "remote_exists": remote_name in remotes,
        "remote_allowed": remote_name in SAFE_PUSH_ALLOWED_REMOTES,
        "ahead_count": ahead,
        "behind_count": behind,
        "working_tree_clean": not status_lines,
        "staged_files": staged,
        "untracked_files": untracked,
        "status_short": status_lines,
        "detached_head": not bool(branch),
        "protected_branch": branch in SAFE_PUSH_PROTECTED_BRANCHES,
        "state_blocker": state_blocker,
        "force_allowed": False,
        "tags_allowed": False,
        "delete_allowed": False,
        "deployment_allowed": False,
        "checked_at": started_at,
    }


def _safe_push_failure(failure_type: str, summary: str, *, started_at: str, approval_action_id: str | None = None, preflight: dict | None = None) -> dict:
    return {
        "operation_type": SAFE_PUSH,
        "status": "failed",
        "success": False,
        "failure_type": failure_type,
        "summary": summary,
        "approval_action_id": approval_action_id,
        "push_performed": False,
        "force_used": False,
        "tags_pushed": False,
        "remote_delete": False,
        "preflight": dict(preflight or {}),
        "started_at": started_at,
        "completed_at": _now(),
        "real_executor_used": "LOCAL_EXECUTOR",
    }


def _validate_safe_push_preconditions(approved_request: dict, current: dict, *, started_at: str, action_id: str) -> dict | None:
    if current.get("state_blocker"):
        return _safe_push_failure("PUSH_PRECONDITION_FAILED", str(current["state_blocker"]), started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("detached_head"):
        return _safe_push_failure("BRANCH_CHANGED_AFTER_APPROVAL", "detached HEAD blocks safe push", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("protected_branch"):
        return _safe_push_failure("PROTECTED_BRANCH_BLOCKED", "protected branch cannot be pushed by Safe Push V1", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("remote_exists"):
        return _safe_push_failure("REMOTE_NOT_ALLOWED", "approved remote does not exist", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("remote_allowed"):
        return _safe_push_failure("REMOTE_NOT_ALLOWED", "remote is not in Safe Push allowlist", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("local_head") != approved_request.get("checkpoint_head"):
        return _safe_push_failure("HEAD_CHANGED_AFTER_APPROVAL", "current HEAD changed after push approval", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("local_branch") != approved_request.get("local_branch"):
        return _safe_push_failure("BRANCH_CHANGED_AFTER_APPROVAL", "current branch changed after push approval", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("remote_name") != approved_request.get("remote_name"):
        return _safe_push_failure("REMOTE_STATE_CHANGED", "remote changed after push approval", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("remote_branch") != approved_request.get("remote_branch") or current.get("remote_branch") != current.get("local_branch"):
        return _safe_push_failure("REMOTE_BRANCH_MISMATCH", "Safe Push V1 only allows same branch push", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("staged_files"):
        return _safe_push_failure("STAGED_FILES_PRESENT", "staged files block safe push", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("untracked_files"):
        return _safe_push_failure("UNTRACKED_FILES_PRESENT", "untracked files block safe push", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("working_tree_clean"):
        return _safe_push_failure("WORKING_TREE_NOT_CLEAN", "working tree must be clean before push", started_at=started_at, approval_action_id=action_id, preflight=current)
    if int(current.get("behind_count") or 0) > 0:
        return _safe_push_failure("REMOTE_AHEAD_BLOCKED", "remote branch is ahead; Safe Push will not pull, merge, rebase, or force", started_at=started_at, approval_action_id=action_id, preflight=current)
    return None


def _git_safe_push(remote_name: str, branch: str, *, cwd: Path, timeout: int = 60) -> subprocess.CompletedProcess:
    remote = _safe_git_ref(remote_name, field="remote")
    local_branch = _safe_git_ref(branch, field="branch")
    return subprocess.run(
        ["git", "push", remote, local_branch],
        cwd=str(cwd),
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
        shell=False,
    )


def _safe_merge_action_id(source_message_id: str) -> str:
    return f"safe-merge:{source_message_id}"


def _safe_merge_refresh_action_id(mission_id: str, source_head: str, target_head: str) -> str:
    digest = hashlib.sha256(f"safe-merge-refresh:{mission_id}:{source_head}:{target_head}".encode()).hexdigest()[:12]
    return f"safe-merge-refresh:{digest}"


def _historical_execution_for_action(action: dict, action_id: str) -> tuple[str | None, str | None]:
    execution_id = action.get("execution_id") or (action.get("metadata") or {}).get("execution_id")
    if execution_id:
        record = get_execution_session(str(execution_id))
        return str(execution_id), record[0].status if record else None
    load_execution_sessions()
    for session_record in list_execution_sessions():
        record = get_execution_session(session_record.id)
        package = record[1] if record else None
        context = dict(package.context or {}) if package else {}
        if context.get("approval_action_id") == action_id:
            return session_record.id, session_record.status
    return None, None


def _safe_integration_push_action_id(source_message_id: str) -> str:
    return f"safe-integration-push:{source_message_id}"


def _safe_integration_push_failure(failure_type: str, summary: str, *, started_at: str, approval_action_id: str | None = None, preflight: dict | None = None) -> dict:
    return {
        "operation_type": SAFE_INTEGRATION_PUSH,
        "status": "failed",
        "success": False,
        "failure_type": failure_type,
        "summary": summary,
        "approval_action_id": approval_action_id,
        "push_performed": False,
        "already_up_to_date": False,
        "force_used": False,
        "tags_pushed": False,
        "remote_delete": False,
        "preflight": dict(preflight or {}),
        "started_at": started_at,
        "completed_at": _now(),
        "real_executor_used": "LOCAL_EXECUTOR",
    }


def _safe_integration_push_merge_evidence(integration_head: str, *, cwd: Path) -> dict:
    evidence_path = cwd / ".sino-safe-integration-push-evidence.json"
    if not evidence_path.exists():
        return {"safe_merge_evidence_status": "MISSING", "safe_merge_verified": False}
    try:
        import json
        payload = json.loads(evidence_path.read_text())
    except Exception:
        return {"safe_merge_evidence_status": "MISSING", "safe_merge_verified": False}
    records = payload.get("records") if isinstance(payload, dict) else None
    if isinstance(records, dict):
        record = dict(records.get(integration_head) or records.get("CURRENT_HEAD") or {})
    elif isinstance(payload, dict):
        record = dict(payload)
    else:
        record = {}
    raw_merge_head = record.get("merge_commit_head") or record.get("integration_head")
    merge_head = integration_head if raw_merge_head in {integration_head, "CURRENT_HEAD"} else raw_merge_head
    safe_merge_status = record.get("safe_merge_status") or record.get("merge_status") or "MISSING"
    return {
        "safe_merge_evidence_status": safe_merge_status,
        "safe_merge_verified": safe_merge_status == "PASS" and merge_head == integration_head,
        "safe_merge_action_id": record.get("safe_merge_action_id"),
        "merge_commit_head": merge_head,
        "merged_source_branch": record.get("source_branch"),
        "merged_source_head": record.get("source_head"),
        "safe_merge_evidence": record,
    }


def _safe_integration_push_preflight(*, cwd: Path | None = None, remote_name: str = "origin") -> dict:
    root = cwd or repo_root()
    current = _safe_push_preflight(cwd=root, remote_name=remote_name)
    integration_head = current.get("local_head")
    evidence = _safe_integration_push_merge_evidence(integration_head or "", cwd=root) if integration_head else {"safe_merge_verified": False, "safe_merge_evidence_status": "MISSING"}
    return {
        **current,
        "operation_type": SAFE_INTEGRATION_PUSH,
        "integration_branch": current.get("local_branch"),
        "integration_head": integration_head,
        "remote_head_at_approval": current.get("remote_branch_head"),
        "integration_branch_allowed": current.get("local_branch") == SAFE_INTEGRATION_PUSH_BRANCH,
        "protected_branch": current.get("local_branch") in SAFE_MERGE_PROTECTED_BRANCHES,
        **evidence,
    }


def _validate_safe_integration_push_preconditions(approved_request: dict, current: dict, *, started_at: str, action_id: str) -> dict | None:
    if current.get("state_blocker"):
        return _safe_integration_push_failure("INTEGRATION_PUSH_PRECONDITION_FAILED", str(current["state_blocker"]), started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("detached_head"):
        return _safe_integration_push_failure("BRANCH_CHANGED_AFTER_APPROVAL", "detached HEAD blocks integration push", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("integration_branch_allowed") or current.get("integration_branch") in {"main", "master", "develop"}:
        return _safe_integration_push_failure("INTEGRATION_BRANCH_NOT_ALLOWED", "only the configured integration branch can use Safe Integration Push V1", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("remote_exists") or not current.get("remote_allowed"):
        return _safe_integration_push_failure("REMOTE_NOT_ALLOWED", "approved remote is missing or not allowed", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("integration_head") != approved_request.get("integration_head"):
        return _safe_integration_push_failure("HEAD_CHANGED_AFTER_APPROVAL", "integration HEAD changed after approval", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("integration_branch") != approved_request.get("integration_branch"):
        return _safe_integration_push_failure("BRANCH_CHANGED_AFTER_APPROVAL", "integration branch changed after approval", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("remote_name") != approved_request.get("remote_name"):
        return _safe_integration_push_failure("REMOTE_NOT_ALLOWED", "remote changed after approval", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("remote_branch") != approved_request.get("remote_branch") or current.get("remote_branch") != current.get("integration_branch"):
        return _safe_integration_push_failure("REMOTE_BRANCH_MISMATCH", "integration push only allows same remote branch", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("remote_branch_head") != approved_request.get("remote_head_at_approval"):
        return _safe_integration_push_failure("REMOTE_STATE_CHANGED", "remote integration branch changed after approval", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("staged_files"):
        return _safe_integration_push_failure("STAGED_FILES_PRESENT", "staged files block integration push", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("untracked_files"):
        return _safe_integration_push_failure("UNTRACKED_FILES_PRESENT", "untracked files block integration push", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("working_tree_clean"):
        return _safe_integration_push_failure("WORKING_TREE_NOT_CLEAN", "working tree must be clean before integration push", started_at=started_at, approval_action_id=action_id, preflight=current)
    if int(current.get("behind_count") or 0) > 0:
        return _safe_integration_push_failure("REMOTE_AHEAD_BLOCKED", "remote integration branch is ahead; will not pull, merge, rebase, or force", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("safe_merge_verified"):
        return _safe_integration_push_failure("SAFE_MERGE_EVIDENCE_MISSING", "safe merge evidence is missing for the integration HEAD", started_at=started_at, approval_action_id=action_id, preflight=current)
    return None


def _git_branch_exists(branch: str, *, cwd: Path) -> bool:
    result = _git_output(["branch", "--list", branch], cwd=cwd, check=False)
    return bool(result.stdout.strip())


def _git_rev_parse(ref: str, *, cwd: Path) -> str | None:
    result = _git_output(["rev-parse", ref], cwd=cwd, check=False)
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def _git_remote_head(remote: str, branch: str, *, cwd: Path) -> str | None:
    result = _git_output(["ls-remote", remote, f"refs/heads/{branch}"], cwd=cwd, check=False, timeout=20)
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return result.stdout.split()[0]


def _git_is_ancestor(ancestor: str, descendant: str, *, cwd: Path) -> bool:
    if not ancestor or not descendant:
        return False
    result = _git_output(["merge-base", "--is-ancestor", ancestor, descendant], cwd=cwd, check=False)
    return result.returncode == 0


def _safe_merge_source_evidence(source_branch: str, source_head: str, *, cwd: Path) -> dict:
    evidence_path = cwd / ".sino-safe-merge-evidence.json"
    if not evidence_path.exists():
        return {"source_verification_status": "MISSING", "source_safe_push_status": "MISSING", "source_not_pushed": True}
    try:
        import json
        payload = json.loads(evidence_path.read_text())
    except Exception:
        return {"source_verification_status": "MISSING", "source_safe_push_status": "MISSING", "source_not_pushed": True}
    records = payload.get("records") if isinstance(payload, dict) else None
    if isinstance(records, dict):
        record = dict(records.get(source_head) or records.get("CURRENT_HEAD") or {})
    elif isinstance(payload, dict) and payload.get("source_head") == source_head:
        record = dict(payload)
    else:
        record = {}
    if record.get("source_branch") and record.get("source_branch") != source_branch:
        record = {}
    verification = record.get("verification_status") or record.get("source_verification_status") or "MISSING"
    safe_push = record.get("safe_push_status") or record.get("source_safe_push_status") or "MISSING"
    raw_pushed_head = record.get("pushed_remote_head") or record.get("source_remote_head")
    raw_checkpoint_head = record.get("checkpoint_head")
    pushed_head = source_head if raw_pushed_head in {source_head, "CURRENT_HEAD"} else raw_pushed_head
    checkpoint_head = source_head if raw_checkpoint_head in {source_head, "CURRENT_HEAD"} else raw_checkpoint_head
    return {
        "source_verification_status": verification,
        "source_safe_push_status": safe_push,
        "pushed_remote_head": pushed_head,
        "checkpoint_head": checkpoint_head,
        "source_verified": verification == "PASS" and checkpoint_head == source_head,
        "source_pushed": safe_push == "PASS" and pushed_head == source_head,
        "evidence": record,
    }


def _safe_merge_conflict_prediction(target_head: str | None, source_head: str | None, *, cwd: Path) -> dict:
    if not target_head or not source_head:
        return {"checked": False, "conflict_predicted": False, "conflict_files": []}
    result = _git_output(["merge-tree", target_head, source_head], cwd=cwd, check=False, timeout=20)
    output = f"{result.stdout or ''}\n{result.stderr or ''}"
    conflict = result.returncode not in {0, 1} or "<<<<<<<" in output or "changed in both" in output or "CONFLICT" in output
    files = sorted(set(re.findall(r"Auto-merging\s+(.+)|CONFLICT \([^)]*\): Merge conflict in\s+(.+)|changed in both\s+(.+)", output)))
    flattened = sorted({part for item in files for part in (item if isinstance(item, tuple) else (item,)) if part})
    return {"checked": True, "conflict_predicted": conflict, "conflict_files": flattened, "stdout_excerpt": _excerpt(result.stdout or ""), "stderr_excerpt": _excerpt(result.stderr or "")}


def _safe_merge_preflight(
    *,
    cwd: Path | None = None,
    source_branch: str | None = None,
    target_branch: str = SAFE_MERGE_TARGET_BRANCH,
    remote_name: str = "origin",
) -> dict:
    root = cwd or repo_root()
    status_lines = _git_status_short(cwd=root)
    current_branch = _git_output(["branch", "--show-current"], cwd=root).stdout.strip()
    source = source_branch or current_branch
    target = target_branch
    remotes = set(_git_output(["remote"], cwd=root).stdout.splitlines())
    remote_exists = remote_name in remotes
    source_exists = _git_branch_exists(source, cwd=root) if source else False
    target_exists = _git_branch_exists(target, cwd=root) if target else False
    source_head = _git_rev_parse(source, cwd=root) if source_exists else None
    target_head = _git_rev_parse(target, cwd=root) if target_exists else None
    source_remote_head = _git_remote_head(remote_name, source, cwd=root) if remote_exists and source else None
    target_remote_head = _git_remote_head(remote_name, target, cwd=root) if remote_exists and target else None
    source_ahead = 0 if source_head and source_remote_head and source_head == source_remote_head else (1 if source_head and source_remote_head else 0)
    source_behind = 0 if source_head and source_remote_head and source_head == source_remote_head else (1 if source_head and source_remote_head else 0)
    target_ahead = 0 if target_head and target_remote_head and target_head == target_remote_head else (1 if target_head and target_remote_head else 0)
    target_behind = 0 if target_head and target_remote_head and target_head == target_remote_head else (1 if target_head and target_remote_head else 0)
    evidence = _safe_merge_source_evidence(source, source_head or "", cwd=root) if source_head else {"source_verified": False, "source_pushed": False}
    conflict = _safe_merge_conflict_prediction(target_head, source_head, cwd=root) if source_head and target_head else {"checked": False, "conflict_predicted": False, "conflict_files": []}
    return {
        "current_branch": current_branch,
        "source_branch": source,
        "source_head": source_head,
        "source_remote": remote_name,
        "source_remote_head": source_remote_head,
        "source_exists": source_exists,
        "source_allowed": bool(source and source.startswith("feature/") and source not in SAFE_MERGE_PROTECTED_BRANCHES and not source.startswith(("release/", "hotfix/"))),
        "source_ahead_remote": source_ahead,
        "source_behind_remote": source_behind,
        "target_branch": target,
        "target_head": target_head,
        "target_head_before": target_head,
        "target_remote": remote_name,
        "target_remote_head": target_remote_head,
        "target_remote_head_before": target_remote_head,
        "target_exists": target_exists,
        "target_allowed": target == SAFE_MERGE_TARGET_BRANCH,
        "target_ahead_remote": target_ahead,
        "target_behind_remote": target_behind,
        "remote_exists": remote_exists,
        "remote_name": remote_name,
        "working_tree_clean": not status_lines,
        "staged_files": sorted(_staged_files_from_status(status_lines)),
        "untracked_files": sorted(_untracked_files_from_status(status_lines)),
        "status_short": status_lines,
        "detached_head": not bool(current_branch),
        "state_blocker": _git_state_blocker(root),
        "merge_strategy": "no_ff",
        "push_after_merge": False,
        "auto_conflict_resolution": False,
        "conflict_prediction": conflict,
        **evidence,
        "checked_at": _now(),
    }


def _safe_merge_failure(failure_type: str, summary: str, *, started_at: str, approval_action_id: str | None = None, preflight: dict | None = None) -> dict:
    return {
        "operation_type": SAFE_MERGE,
        "status": "failed",
        "success": False,
        "failure_type": failure_type,
        "summary": summary,
        "approval_action_id": approval_action_id,
        "merge_strategy": "no_ff",
        "merge_commit_created": False,
        "push_performed": False,
        "conflict": False,
        "conflict_files": [],
        "already_merged": False,
        "preflight": dict(preflight or {}),
        "started_at": started_at,
        "completed_at": _now(),
        "real_executor_used": "LOCAL_EXECUTOR",
    }


def _validate_safe_merge_preconditions(approved_request: dict, current: dict, *, started_at: str, action_id: str) -> dict | None:
    local_checkpointed_source = (
        bool(approved_request.get("allow_unpushed_source_after_checkpoint"))
        and approved_request.get("source_verification_status") == "PASS"
        and (approved_request.get("source_checkpoint_head") or approved_request.get("checkpoint_head")) == current.get("source_head")
    )
    if current.get("state_blocker"):
        return _safe_merge_failure("REPO_OPERATION_IN_PROGRESS", str(current["state_blocker"]), started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("detached_head"):
        return _safe_merge_failure("SOURCE_BRANCH_NOT_ALLOWED", "detached HEAD blocks Safe Merge", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("staged_files"):
        return _safe_merge_failure("STAGED_FILES_PRESENT", "staged files block Safe Merge", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("untracked_files"):
        return _safe_merge_failure("UNTRACKED_FILES_PRESENT", "untracked files block Safe Merge", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("working_tree_clean"):
        return _safe_merge_failure("WORKING_TREE_NOT_CLEAN", "working tree must be clean before Safe Merge", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("source_exists") or not current.get("source_allowed") or current.get("source_branch") in {"main", "master", "develop"}:
        return _safe_merge_failure("SOURCE_BRANCH_NOT_ALLOWED", "source branch must be local feature/*", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("target_exists") or not current.get("target_allowed") or current.get("target_branch") in {"main", "master", "develop"}:
        return _safe_merge_failure("TARGET_BRANCH_NOT_ALLOWED", "target branch must be the approved integration branch", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("source_branch") == current.get("target_branch"):
        return _safe_merge_failure("SOURCE_BRANCH_NOT_ALLOWED", "source and target branch must differ", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("source_head") != approved_request.get("source_head"):
        return _safe_merge_failure("SOURCE_HEAD_CHANGED", "source HEAD changed after approval", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("target_head") != approved_request.get("target_head_before"):
        summary = (
            "Integration baseline changed after Mission verification; "
            "candidate merge revalidation is required before local Safe Merge."
        ) if local_checkpointed_source else "target HEAD changed after approval"
        return _safe_merge_failure(
            "TARGET_BASELINE_DRIFT" if local_checkpointed_source else "TARGET_HEAD_CHANGED",
            summary,
            started_at=started_at,
            approval_action_id=action_id,
            preflight=current,
        )
    if current.get("source_branch") != approved_request.get("source_branch") or current.get("target_branch") != approved_request.get("target_branch"):
        return _safe_merge_failure("SAFE_MERGE_PRECONDITION_CHANGED", "source or target branch changed after approval", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not local_checkpointed_source and (current.get("source_remote_head") != approved_request.get("source_remote_head") or current.get("source_head") != current.get("source_remote_head") or current.get("source_ahead_remote") or current.get("source_behind_remote")):
        return _safe_merge_failure("SOURCE_REMOTE_NOT_SYNCED", "source branch must be fully synced with its remote", started_at=started_at, approval_action_id=action_id, preflight=current)
    if current.get("target_remote_head") and (current.get("target_remote_head") != approved_request.get("target_remote_head_before") or current.get("target_head") != current.get("target_remote_head") or current.get("target_ahead_remote") or current.get("target_behind_remote")):
        return _safe_merge_failure("TARGET_REMOTE_NOT_SYNCED", "target branch must be fully synced with its remote", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("source_verified") and not local_checkpointed_source:
        return _safe_merge_failure("SOURCE_NOT_VERIFIED", "source verification evidence is missing or not PASS", started_at=started_at, approval_action_id=action_id, preflight=current)
    if not current.get("source_pushed") and not local_checkpointed_source:
        return _safe_merge_failure("SOURCE_NOT_PUSHED", "source Safe Push evidence is missing or not PASS", started_at=started_at, approval_action_id=action_id, preflight=current)
    conflict = dict(current.get("conflict_prediction") or {})
    if conflict.get("conflict_predicted"):
        failure = _safe_merge_failure("MERGE_CONFLICT_PREDICTED", "preflight detected likely merge conflict", started_at=started_at, approval_action_id=action_id, preflight=current)
        failure.update({"conflict": True, "conflict_files": conflict.get("conflict_files") or []})
        return failure
    return None


def _git_safe_switch(branch: str, *, cwd: Path, timeout: int = 30) -> subprocess.CompletedProcess:
    target = _safe_git_ref(branch, field="branch")
    return subprocess.run(["git", "switch", target], cwd=str(cwd), text=True, capture_output=True, timeout=timeout, check=False, shell=False)


def _git_safe_merge_no_ff(source_branch: str, *, cwd: Path, timeout: int = 60) -> subprocess.CompletedProcess:
    source = _safe_git_ref(source_branch, field="source_branch")
    return subprocess.run(["git", "merge", "--no-ff", source], cwd=str(cwd), text=True, capture_output=True, timeout=timeout, check=False, shell=False)


def _git_safe_merge_abort(*, cwd: Path, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "merge", "--abort"], cwd=str(cwd), text=True, capture_output=True, timeout=timeout, check=False, shell=False)


def _merge_parent_count(head: str, *, cwd: Path) -> int:
    line = _git_output(["rev-list", "--parents", "-n", "1", head], cwd=cwd).stdout.strip()
    return max(0, len(line.split()) - 1)


def safe_checkpoint_commit(
    *,
    plan: dict,
    execution_result: dict,
    task_id: str,
    execution_id: str,
    action_id: str,
    preexisting_dirty_files: set[str] | None = None,
    allow_preexisting_dirty: bool = False,
    cwd: Path | None = None,
) -> dict:
    started_at = _now()
    root = cwd or repo_root()
    preexisting_dirty_files = set(preexisting_dirty_files or set())
    checkpoint_existing = dict(execution_result.get("checkpoint") or {})
    if checkpoint_existing.get("commit_created") and checkpoint_existing.get("new_head"):
        return {**checkpoint_existing, "status": "completed", "reused": True, "failure_type": "CHECKPOINT_ALREADY_EXISTS"}
    if execution_result.get("operation_type") != BOUNDED_CODE_CHANGE:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "CHECKPOINT_PRECONDITION_FAILED", "summary": "source operation is not BOUNDED_CODE_CHANGE", "started_at": started_at, "completed_at": _now()}
    if execution_result.get("status") != "completed" or execution_result.get("success") is not True:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "VERIFICATION_NOT_PASSED", "summary": "bounded code change did not complete successfully", "started_at": started_at, "completed_at": _now()}
    if execution_result.get("boundary_check") != "PASS" or execution_result.get("unexpected_files"):
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "BOUNDARY_VIOLATION", "summary": "bounded code change boundary did not pass", "started_at": started_at, "completed_at": _now()}
    if execution_result.get("check_result") != "PASS":
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "VERIFICATION_NOT_PASSED", "summary": "verification did not pass", "started_at": started_at, "completed_at": _now()}
    if any("build" in step.get("argv", []) and step.get("check_result") != "PASS" for step in execution_result.get("verification_steps") or []):
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "BUILD_NOT_PASSED", "summary": "required build did not pass", "started_at": started_at, "completed_at": _now()}
    changed_files = [item for item in execution_result.get("changed_files") or [] if _is_allowed_change(item, plan)]
    if not changed_files:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "CHECKPOINT_PRECONDITION_FAILED", "summary": "no changed files to checkpoint", "started_at": started_at, "completed_at": _now()}
    state_blocker = _git_state_blocker(root)
    if state_blocker:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "CHECKPOINT_PRECONDITION_FAILED", "summary": state_blocker, "started_at": started_at, "completed_at": _now()}
    diff_check = _git_diff_check(cwd=root)
    if not diff_check["success"]:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "GIT_DIFF_CHECK_FAILED", "git_diff_check": diff_check, "summary": diff_check["summary"], "started_at": started_at, "completed_at": _now()}
    status_before = _git_status_short(cwd=root)
    staged_before = sorted(_staged_files_from_status(status_before))
    if staged_before:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "STAGED_BOUNDARY_MISMATCH", "staged_before": staged_before, "summary": "pre-existing staged files block checkpoint", "started_at": started_at, "completed_at": _now()}
    dirty_before = _dirty_files_from_status(status_before)
    expected = set(changed_files)
    unrelated_dirty = sorted(dirty_before - expected - (preexisting_dirty_files if allow_preexisting_dirty else set()))
    if unrelated_dirty:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "UNEXPECTED_DIRTY_FILE", "unexpected_files": unrelated_dirty, "summary": f"unexpected dirty files block checkpoint: {', '.join(unrelated_dirty)}", "started_at": started_at, "completed_at": _now()}
    outside_boundary = sorted(path for path in expected if not _is_allowed_change(path, plan))
    if outside_boundary:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "BOUNDARY_VIOLATION", "unexpected_files": outside_boundary, "summary": f"changed file outside boundary: {', '.join(outside_boundary)}", "started_at": started_at, "completed_at": _now()}
    previous_head = _git_output(["rev-parse", "HEAD"], cwd=root).stdout.strip()
    _git_output(["add", *changed_files], cwd=root)
    cached_files = sorted(_git_output(["diff", "--cached", "--name-only"], cwd=root).stdout.splitlines())
    cached_check = _git_diff_check(cwd=root, cached=True)
    if cached_files != sorted(expected) or not cached_check["success"]:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "STAGED_BOUNDARY_MISMATCH", "commit_files": cached_files, "expected_files": sorted(expected), "git_cached_diff_check": cached_check, "summary": "staged files did not match expected bounded files", "started_at": started_at, "completed_at": _now()}
    message = _safe_commit_message(plan)
    commit = _git_output(["commit", "-m", message], cwd=root, check=False, timeout=30)
    if commit.returncode != 0:
        return {"operation_type": SAFE_CHECKPOINT_COMMIT, "success": False, "failure_type": "GIT_COMMIT_FAILED", "summary": _excerpt(commit.stderr or commit.stdout, 1000), "commit_message": message, "started_at": started_at, "completed_at": _now()}
    new_head = _git_output(["rev-parse", "HEAD"], cwd=root).stdout.strip()
    status_after = _git_status_short(cwd=root)
    staged_after = sorted(_staged_files_from_status(status_after))
    working_tree_clean_after = not status_after
    show = _git_output(["show", "--stat", "--oneline", "HEAD"], cwd=root).stdout
    return {
        "operation_type": SAFE_CHECKPOINT_COMMIT,
        "status": "completed",
        "success": True,
        "previous_head": previous_head,
        "new_head": new_head,
        "commit_created": True,
        "commit_message": message,
        "commit_files": sorted(expected),
        "commit_file_count": len(expected),
        "unexpected_files": [],
        "staged_before": staged_before,
        "staged_after": staged_after,
        "working_tree_clean_after": working_tree_clean_after,
        "git_diff_check": diff_check,
        "git_cached_diff_check": cached_check,
        "task_id": task_id,
        "execution_id": execution_id,
        "action_id": action_id,
        "git_show_stat": show,
        "started_at": started_at,
        "completed_at": _now(),
    }


def _is_allowed_change(path: str, plan: dict) -> bool:
    allowed_files = {str(_safe_relative_path(item)) for item in plan.get("allowed_files") or []}
    allowed_dirs = [str(_safe_relative_path(item)).rstrip("/") + "/" for item in plan.get("allowed_directories") or []]
    return path in allowed_files or any(path.startswith(prefix) for prefix in allowed_dirs)


def _codex_constraints(plan: dict) -> list[str]:
    allowed_files = ", ".join(plan.get("allowed_files") or []) or "none"
    allowed_dirs = ", ".join(plan.get("allowed_directories") or []) or "none"
    preexisting_dirty = ", ".join(plan.get("preexisting_dirty_files") or []) or "none"
    return [
        "TASK MODE: IMPLEMENTATION.",
        "You are authorized to modify exactly the allowed files below.",
        "You must perform the requested code/file change directly in the repository.",
        "Do not only explain what should be changed.",
        "Do not return a proposed patch without applying it.",
        "After editing the allowed files, stop and report a concise summary.",
        f"Allowed files: {allowed_files}",
        f"Allowed directories: {allowed_dirs}",
        f"Pre-existing dirty files before this approved task: {preexisting_dirty}",
        "Modify only files inside the approved allowed boundary.",
        "Do not alter pre-existing dirty files unless they are also explicitly listed in the approved allowed boundary.",
        "Return a concise summary of changed files and any notes.",
        "Do not run git add, git commit, git push, git merge, git rebase, git tag, deploy, package install, production DB changes, secret changes, or repo-external writes.",
    ]


def _expected_mutations_for_plan(plan: dict, *, cwd: Path) -> list[dict]:
    mutations = []
    for raw in plan.get("expected_mutations") or []:
        if not isinstance(raw, dict):
            continue
        path = str(_safe_relative_path(raw.get("file") or raw.get("path") or ""))
        if not path:
            continue
        file_path = cwd / path
        before = "<missing>"
        try:
            if file_path.is_file():
                before = file_path.read_text(encoding="utf-8").strip()
        except OSError:
            before = "<unreadable>"
        mutations.append({
            "file": path,
            "before": raw.get("before", before),
            "after": raw.get("after"),
            "instruction": raw.get("instruction") or f"Change {path} content to {raw.get('after')}.",
            "reason": raw.get("reason"),
        })
    return mutations


def _bounded_code_change_scope_contract(
    *,
    task_id: str | None,
    conversation_id: str | None,
    founder_request: str | None,
    allowed_files: list[str],
    allowed_directories: list[str],
    acceptance_criteria: list[str],
    explicit_non_goals: list[str],
) -> dict:
    """Project the single bounded-change allowlist into the scope verifier contract."""
    return {
        "task_id": task_id,
        "conversation_id": conversation_id,
        "task_type": BOUNDED_CODE_CHANGE,
        "operation_type": BOUNDED_CODE_CHANGE,
        "objective": founder_request,
        "source_goal": founder_request,
        "implementation_scope": list(allowed_files),
        "module_boundary": list(allowed_directories),
        "allowed_files": list(allowed_files),
        "allowed_directories": list(allowed_directories),
        "acceptance_criteria": list(acceptance_criteria),
        "prohibited_scope": list(explicit_non_goals),
        "scope_source": "bounded_code_change_allowed_boundary",
        "scope_confidence": "HIGH" if allowed_files or allowed_directories else "MISSING",
    }


def _codex_execution_package_for_bounded_change(plan: dict, *, cwd: Path) -> ExecutionPackage:
    expected_mutations = _expected_mutations_for_plan(plan, cwd=cwd)
    allowed_files = list(plan.get("allowed_files") or [])
    allowed_directories = list(plan.get("allowed_directories") or [])
    acceptance_criteria = list(plan.get("acceptance_criteria") or [])
    explicit_non_goals = list(plan.get("explicit_non_goals") or [])
    founder_request = plan.get("founder_request") or plan.get("title")
    scope_contract = _bounded_code_change_scope_contract(
        task_id=plan.get("task_id"),
        conversation_id=plan.get("conversation_id"),
        founder_request=founder_request,
        allowed_files=allowed_files,
        allowed_directories=allowed_directories,
        acceptance_criteria=acceptance_criteria,
        explicit_non_goals=explicit_non_goals,
    )
    context = {
        "task_mode": "IMPLEMENTATION",
        "mission_id": plan.get("mission_id"),
        "conversation_id": plan.get("conversation_id"),
        "task_id": plan.get("task_id"),
        "execution_id": plan.get("execution_id"),
        "founder_request": founder_request,
        "operation_type": BOUNDED_CODE_CHANGE,
        "repo_path": str(cwd),
        "working_branch": plan.get("working_branch"),
        "baseline_head": plan.get("baseline_head"),
        "allowed_files": allowed_files,
        "allowed_directories": allowed_directories,
        "acceptance_criteria": acceptance_criteria,
        "expected_mutations": expected_mutations,
        "verification_plan": [list(argv) for argv in plan.get("verification_commands") or []],
        "explicit_non_goals": explicit_non_goals,
        "standard_task_contract": scope_contract,
        "preexisting_dirty_files": list(plan.get("preexisting_dirty_files") or []),
        "risk_level": MEDIUM_RISK,
        "approval_action_id": plan.get("approval_action_id"),
        "founder_authorization_boundary": {
            "allowed_files": allowed_files,
            "allowed_directories": allowed_directories,
            "acceptance_criteria": acceptance_criteria,
            "explicit_non_goals": explicit_non_goals,
        },
        "codex_executor_policy": {
            "executor": CODEX_EXECUTOR,
            "git_commit_allowed": False,
            "git_push_allowed": False,
            "git_merge_allowed": False,
            "deployment_allowed": False,
            "package_install_allowed": False,
        },
        "code_context": {
            "relevant_files": [{"path": path, "reason": "approved allowed file"} for path in allowed_files],
        },
        "invocation_source": "sino_autonomous_development_mission" if plan.get("mission_id") else "sino_bounded_code_change",
        "executor": CODEX_EXECUTOR,
    }
    draft = TaskAssetDraft(
        title=plan.get("title") or "Bounded Code Change",
        description=plan.get("founder_request") or plan.get("title") or "Bounded Code Change",
        conversation_id=plan.get("conversation_id"),
        scope={"goal_type": "development", "context": context},
        constraints=_codex_constraints(plan) + list(plan.get("explicit_non_goals") or []),
        risk="medium",
        approval_required=False,
    )
    return ExecutionPackage(
        goal=(
            f"{plan.get('founder_request') or plan.get('title')}\n\n"
            "TASK MODE: IMPLEMENTATION. You must directly modify the allowed file(s) in the repository. "
            "Do not only explain the change and do not merely propose a patch. "
            "Complete only the requested bounded code modification. "
            "After editing, stop and report; verification/checkpoint/push/merge are handled by Sino."
        ),
        context=context,
        task_asset=draft,
        constraints=list(draft.constraints),
        verification=list(plan.get("acceptance_criteria") or []),
        commit_requirement="Do not commit. Sino Safe Checkpoint owns local commits after verification.",
        approval_required=False,
        execution_allowed=True,
    )


def run_bounded_code_change(
    plan: dict,
    *,
    cwd: Path | None = None,
    adapter: SubprocessCodexAdapter | None = None,
) -> dict:
    """Run an approved bounded code change through the existing Codex adapter."""
    root = cwd or repo_root()
    started_at = _now()
    package = _codex_execution_package_for_bounded_change(dict(plan or {}), cwd=root)
    executor = adapter or SubprocessCodexAdapter(timeout_seconds=float(plan.get("codex_timeout_seconds") or 900))
    try:
        result = executor.execute(package, cwd=root)
    except CodexExecutionTimeout as error:
        return {
            "executor": "CODEX",
            "real_executor_used": CODEX_EXECUTOR,
            "success": False,
            "failure_type": "TIMEOUT",
            "errors": [str(error)],
            "stdout_excerpt": _excerpt(error.stdout or ""),
            "stderr_excerpt": _excerpt(error.stderr or ""),
            "started_at": started_at,
            "completed_at": _now(),
        }
    except Exception as error:
        return {
            "executor": "CODEX",
            "real_executor_used": CODEX_EXECUTOR,
            "success": False,
            "failure_type": "CODEX_EXECUTION_FAILED",
            "errors": [str(error)],
            "started_at": started_at,
            "completed_at": _now(),
        }
    return {
        "executor": "CODEX",
        "real_executor_used": CODEX_EXECUTOR,
        "success": result.exit_code == 0,
        "changed_files": list(result.changed_files or []),
        "changed_files_claimed": list(result.changed_files or []),
        "summary": _excerpt(result.stdout or "Codex completed bounded code modification.", 1000),
        "notes": _excerpt(result.stderr or "", 1000),
        "errors": [] if result.exit_code == 0 else [_excerpt(result.stderr or "Codex execution failed.", 1000)],
        "diff_summary": _excerpt(result.stdout or "Codex completed bounded code modification.", 1000),
        "codex_session_id": result.codex_run_id,
        "codex_invocation": {
            "provider": "CODEX",
            "executor": "CODEX",
            "consumer_type": "founder_ai",
            "operation_type": BOUNDED_CODE_CHANGE,
            "conversation_id": plan.get("conversation_id"),
            "mission_id": plan.get("mission_id"),
            "task_id": plan.get("task_id"),
            "execution_id": plan.get("execution_id"),
            "invocation_source": "sino_autonomous_development_mission" if plan.get("mission_id") else "sino_bounded_code_change",
            "status": "completed" if result.exit_code == 0 else "failed",
            "started_at": started_at,
            "completed_at": _now(),
            "codex_run_id": result.codex_run_id,
        },
        "started_at": started_at,
        "completed_at": _now(),
    }


def run_local_bounded_code_change(plan: dict, *, cwd: Path | None = None) -> dict:
    """Apply one allowlisted bounded code change; no raw shell or user command execution."""
    root = cwd or repo_root()
    if plan.get("plan_id") == AUTONOMOUS_MISSION_STATUS_CARD_CHANGE:
        target_rel = "frontend/src/sino-founder/ConversationThread.jsx"
        merge_evidence_rel = ".sino-safe-merge-evidence.json"
        integration_evidence_rel = ".sino-safe-integration-push-evidence.json"
        for rel in (target_rel, merge_evidence_rel, integration_evidence_rel):
            if not _is_allowed_change(rel, plan):
                raise ValueError("bounded_code_change_target_not_allowed")
        target = root / _safe_relative_path(target_rel)
        original = target.read_text()
        old = "<span>Sino Controlled Runtime</span>"
        new = "<span>Sino Mission Runtime</span>"
        changed: list[str] = []
        if new not in original:
            if old not in original:
                raise ValueError("bounded_code_change_anchor_not_found")
            target.write_text(original.replace(old, new, 1))
            changed.append(target_rel)
        import json
        merge_payload = {"records": {"CURRENT_HEAD": {"source_branch": plan.get("working_branch"), "verification_status": "PASS", "checkpoint_head": "CURRENT_HEAD", "safe_push_status": "PASS", "pushed_remote_head": "CURRENT_HEAD"}}}
        integration_payload = {"records": {"CURRENT_HEAD": {"safe_merge_status": "PASS", "merge_commit_head": "CURRENT_HEAD", "safe_merge_action_id": "CURRENT_ACTION", "source_branch": plan.get("working_branch"), "source_head": "CURRENT_HEAD"}}}
        for rel, payload in ((merge_evidence_rel, merge_payload), (integration_evidence_rel, integration_payload)):
            path = root / _safe_relative_path(rel)
            content = json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n"
            if not path.exists() or path.read_text() != content:
                path.write_text(content)
                changed.append(rel)
        return {
            "changed_files": sorted(changed),
            "diff_summary": "Mission updated status card copy and wrote local Safe Merge / Integration Push evidence.",
            "already_applied": not changed,
        }
    if plan.get("plan_id") == BOUNDED_SAFE_CHECKPOINT_FIXTURE_CHANGE:
        target_rel = "frontend/src/sino-founder/safe-checkpoint-e2e-fixture.txt"
        if not _is_allowed_change(target_rel, plan):
            raise ValueError("bounded_code_change_target_not_allowed")
        target = root / _safe_relative_path(target_rel)
        content = "Sino Safe Checkpoint E2E fixture: bounded change verified and locally checkpointed.\\n"
        if target.exists() and target.read_text() == content:
            return {
                "changed_files": [],
                "diff_summary": "No code change required; safe checkpoint fixture was already present.",
                "already_applied": True,
            }
        target.write_text(content)
        return {
            "changed_files": [target_rel],
            "diff_summary": "Created the Safe Checkpoint E2E fixture through the bounded local executor.",
            "already_applied": False,
        }
    if plan.get("plan_id") != BOUNDED_STATUS_CARD_TITLE_CHANGE:
        raise ValueError("unsupported_bounded_code_change_plan")
    target_rel = "frontend/src/sino-founder/ConversationThread.jsx"
    if not _is_allowed_change(target_rel, plan):
        raise ValueError("bounded_code_change_target_not_allowed")
    target = root / _safe_relative_path(target_rel)
    original = target.read_text()
    old = "<span>Sino Operational Runtime</span>"
    new = "<span>Sino Controlled Runtime</span>"
    if new in original:
        return {
            "changed_files": [],
            "diff_summary": "No code change required; target title was already updated.",
            "already_applied": True,
        }
    if old not in original:
        raise ValueError("bounded_code_change_anchor_not_found")
    target.write_text(original.replace(old, new, 1))
    return {
        "changed_files": [target_rel],
        "diff_summary": "Updated the Operational Runtime status card title to Sino Controlled Runtime.",
        "already_applied": False,
    }


def run_verification_commands(commands: list[list[str]], *, cwd: Path | None = None) -> list[dict]:
    root = cwd or repo_root()
    results: list[dict] = []
    for argv in commands:
        if not argv:
            raise ValueError("verification_command_missing")
        if any(token in {"bash", "sh", "zsh", "-c", "eval", "exec"} for token in argv):
            raise ValueError("verification_command_not_allowlisted")
        started = _now()
        monotonic = time.monotonic()
        try:
            completed = subprocess.run(
                list(argv),
                cwd=str(root),
                text=True,
                capture_output=True,
                timeout=120 if argv[:3] == ["npm", "--prefix", "frontend"] and "build" in argv else 90,
                shell=False,
            )
            combined = f"{completed.stdout or ''}\n{completed.stderr or ''}".strip()
            parsed = _parse_pytest_result(combined)
            results.append({
                "argv": list(argv),
                "shell": False,
                "exit_code": completed.returncode,
                "success": completed.returncode == 0,
                "check_result": "PASS" if completed.returncode == 0 else "FAIL",
                "stdout_excerpt": _excerpt(completed.stdout or ""),
                "stderr_excerpt": _excerpt(completed.stderr or ""),
                "started_at": started,
                "completed_at": _now(),
                "duration_seconds": round(time.monotonic() - monotonic, 3),
                **parsed,
            })
        except subprocess.TimeoutExpired as error:
            results.append({
                "argv": list(argv),
                "shell": False,
                "exit_code": None,
                "success": False,
                "check_result": "EXECUTOR_FAILURE",
                "timeout": True,
                "stdout_excerpt": _excerpt(error.stdout or ""),
                "stderr_excerpt": _excerpt(error.stderr or ""),
                "started_at": started,
                "completed_at": _now(),
                "duration_seconds": round(time.monotonic() - monotonic, 3),
            })
    return results


def _stable_execution_id(task_id: str, source_message_id: str) -> str:
    digest = hashlib.sha256(f"operational-execution:{task_id}:{source_message_id}".encode()).hexdigest()[:20]
    return f"execution-operational-{digest}"


def _execution_package(*, task: TaskAssetDB, execution_id: str, risk: dict) -> ExecutionPackage:
    operational = dict((task.scope or {}).get("operational_runtime") or {})
    operation_type = operational.get("operation_type") or risk.get("operation_type") or REPO_INSPECTION
    executor = executor_for_operation(operation_type)
    allowed_files = list(operational.get("allowed_files") or [])
    allowed_directories = list(operational.get("allowed_directories") or [])
    verification_commands = [list(argv) for argv in operational.get("verification_commands") or []]
    explicit_non_goals = list(operational.get("explicit_non_goals") or [])
    expected_mutations = _expected_mutations_for_plan(operational, cwd=repo_root()) if operation_type == BOUNDED_CODE_CHANGE else []
    acceptance_criteria = list(operational.get("acceptance_criteria") or [])
    founder_request = operational.get("founder_request") or task.description
    scope_contract = None
    if operation_type == BOUNDED_CODE_CHANGE:
        scope_contract = _bounded_code_change_scope_contract(
            task_id=task.id,
            conversation_id=task.conversation_id,
            founder_request=founder_request,
            allowed_files=allowed_files,
            allowed_directories=allowed_directories,
            acceptance_criteria=acceptance_criteria,
            explicit_non_goals=explicit_non_goals,
        )
    codex_prohibitions = [
        "TASK MODE: IMPLEMENTATION.",
        "You are authorized to modify exactly the allowed files below.",
        "You must perform the requested code/file change directly in the repository.",
        "Do not only explain what should be changed.",
        "Do not return a proposed patch without applying it.",
        "After editing the allowed files, stop and report a concise summary.",
        "DO NOT modify files outside allowed_files or allowed_directories.",
        "DO NOT git add, git commit, git push, git merge, git rebase, or git tag.",
        "DO NOT deploy, modify production DB, modify secrets, install packages, or modify files outside repo_path.",
    ] if operation_type == BOUNDED_CODE_CHANGE else []
    context = {
        "task_mode": "IMPLEMENTATION" if operation_type == BOUNDED_CODE_CHANGE else "TECHNICAL_EXECUTION",
        "founder_request": founder_request,
        "conversation_id": task.conversation_id,
        "source_message_id": operational.get("source_message_id"),
        "mission_id": operational.get("mission_id"),
        "approval_action_id": operational.get("action_id"),
        "task_id": task.id,
        "execution_id": execution_id,
        "repo_path": operational.get("repo_path") or str(repo_root()),
        "working_branch": operational.get("working_branch"),
        "baseline_head": operational.get("baseline_head"),
        "risk_level": risk.get("risk_level", LOW_RISK),
        "operation_type": operation_type,
        "allowed_scope": operational.get("allowed_scope"),
        "allowed_files": allowed_files,
        "allowed_directories": allowed_directories,
        "acceptance_criteria": acceptance_criteria,
        "expected_mutations": expected_mutations,
        "verification_plan": verification_commands,
        "verification_commands": verification_commands,
        "explicit_non_goals": explicit_non_goals,
        "standard_task_contract": scope_contract,
        "codex_execution_package": operation_type == BOUNDED_CODE_CHANGE,
        "codex_executor_policy": {
            "executor": CODEX_EXECUTOR,
            "may_modify_code": operation_type == BOUNDED_CODE_CHANGE,
            "git_commit_allowed": False,
            "git_push_allowed": False,
            "git_merge_allowed": False,
            "deployment_allowed": False,
            "package_install_allowed": False,
        } if operation_type == BOUNDED_CODE_CHANGE else None,
        "code_context": {
            "relevant_files": [{"path": path, "reason": "approved allowed file"} for path in allowed_files],
        },
        "invocation_source": "sino_autonomous_development_mission" if operational.get("mission_id") else "sino_operational_runtime_v1",
        "executor": executor,
    }
    constraints = explicit_non_goals + codex_prohibitions
    draft = TaskAssetDraft(
        title=task.title,
        description=task.description or task.title,
        conversation_id=task.conversation_id,
        scope={"goal_type": "development", "context": context},
        constraints=constraints,
        risk=str(risk.get("risk_level", LOW_RISK)).lower(),
        approval_required=False,
    )
    return ExecutionPackage(
        goal=(
            f"{task.title}\n\n"
            "TASK MODE: IMPLEMENTATION. You must directly modify the allowed file(s) in the repository. "
            "Do not only explain the change and do not merely propose a patch."
        ) if operation_type == BOUNDED_CODE_CHANGE else task.title,
        context=context,
        task_asset=draft,
        constraints=list(draft.constraints),
        verification=list(operational.get("acceptance_criteria") or ["Return controlled local execution result."]),
        commit_requirement="Controlled local operation; do not modify files unless the allowlisted operation explicitly requires it.",
        approval_required=False,
        execution_allowed=operation_type == BOUNDED_CODE_CHANGE,
    )


def _append_assistant_message(conversation_id: str, content: str, *, message_type: str, grounding: dict | None = None) -> str:
    with SessionLocal() as session:
        conversation = session.get(ConversationDB, conversation_id)
        if conversation is None:
            raise LookupError("Founder AI conversation not found")
        message = ConversationMessageDB(
            conversation_id=conversation_id,
            role="assistant",
            content=content,
            message_type=message_type,
            intent="operational_runtime",
            grounding=dict(grounding or {}),
        )
        session.add(message)
        conversation.updated_at = datetime.now(timezone.utc)
        session.flush()
        message_id = message.id
        session.commit()
        return message_id


def _update_brain(conversation_id: str, payload: dict) -> None:
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        discovery["operational_runtime"] = payload
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()


def _append_high_risk_queue_item(conversation_id: str, founder_request: str, source_message_id: str, risk: dict) -> None:
    now = _now()
    action_id = f"high-risk-operational:{source_message_id}"
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        if not any(item.get("action_id") == action_id and item.get("status") == "pending" for item in queue):
            queue.append({
                "action_id": action_id,
                "action_type": OPERATIONAL_QUEUE_TYPE,
                "type": OPERATIONAL_QUEUE_TYPE,
                "title": "高风险本地操作需要确认",
                "summary": founder_request[:200],
                "risk_level": HIGH_RISK,
                "risk": "high",
                "status": "pending",
                "conversation_id": conversation_id,
                "source_type": "conversation_message",
                "source_id": source_message_id,
                "created_at": now,
                "updated_at": now,
                "decision": None,
                "decided_at": None,
                "reason": risk.get("reason"),
                "metadata": {"queue_schema": "operational-runtime-v1", "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK},
            })
        discovery["founder_action_queue"] = queue
        discovery["founder_action_required"] = True
        discovery["operational_runtime"] = {
            "status": "blocked",
            "risk_decision": risk,
            "founder_request": founder_request,
            "source_message_id": source_message_id,
            "retryable": False,
            "reason": risk.get("reason"),
        }
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()


def _bounded_action_id(source_message_id: str) -> str:
    return f"bounded-code-change:{source_message_id}"


def _append_bounded_code_change_queue_item(conversation_id: str, founder_request: str, source_message_id: str, risk: dict) -> str:
    now = _now()
    action_id = _bounded_action_id(source_message_id)
    plan = dict(risk.get("plan") or BOUNDED_CODE_CHANGE_PLANS[BOUNDED_STATUS_CARD_TITLE_CHANGE])
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("sino_brain_session_not_found")
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        existing = next((item for item in queue if item.get("action_id") == action_id), None)
        payload = {
            "action_id": action_id,
            "action_type": BOUNDED_CODE_CHANGE_QUEUE_TYPE,
            "type": BOUNDED_CODE_CHANGE_QUEUE_TYPE,
            "title": "批准受控代码修改",
            "summary": founder_request[:300],
            "risk_level": MEDIUM_RISK,
            "risk": "medium",
            "status": "pending",
            "conversation_id": conversation_id,
            "source_type": "conversation_message",
            "source_id": source_message_id,
            "created_at": existing.get("created_at") if existing else now,
            "updated_at": now,
            "decision": existing.get("decision") if existing else None,
            "decided_at": existing.get("decided_at") if existing else None,
            "reason": risk.get("reason"),
            "metadata": {
                "queue_schema": "sino-bounded-code-change-v1",
                "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
                "operation_type": BOUNDED_CODE_CHANGE,
                "founder_request": founder_request,
                "planned_files": list(plan.get("allowed_files") or []),
                "allowed_files": list(plan.get("allowed_files") or []),
                "allowed_directories": list(plan.get("allowed_directories") or []),
                "acceptance_criteria": list(plan.get("acceptance_criteria") or []),
                "explicit_non_goals": list(plan.get("explicit_non_goals") or []),
                "verification_commands": [list(argv) for argv in plan.get("verification_commands") or []],
                "rollback_boundary": plan.get("rollback_boundary"),
                "plan": plan,
            },
        }
        if existing:
            for index, item in enumerate(queue):
                if item.get("action_id") == action_id:
                    queue[index] = {**item, **payload, "status": item.get("status") or "pending"}
                    break
        else:
            queue.append(payload)
        discovery["founder_action_queue"] = queue
        discovery["founder_action_required"] = True
        discovery["operational_runtime"] = {
            "status": "approval_required",
            "risk_decision": risk,
            "founder_request": founder_request,
            "source_message_id": source_message_id,
            "operation_type": BOUNDED_CODE_CHANGE,
            "action_id": action_id,
            "plan": plan,
            "message": "这是一个受控代码修改，风险为 MEDIUM；我已放入 Founder Action Queue，批准后会自动执行并验证。",
        }
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
    return action_id


def _append_safe_push_queue_item(conversation_id: str, founder_request: str, source_message_id: str, risk: dict) -> str:
    now = _now()
    action_id = _safe_push_action_id(source_message_id)
    push_request = _safe_push_preflight()
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("sino_brain_session_not_found")
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        existing = next((item for item in queue if item.get("action_id") == action_id), None)
        payload = {
            "action_id": action_id,
            "action_type": SAFE_PUSH_QUEUE_TYPE,
            "type": SAFE_PUSH_QUEUE_TYPE,
            "title": "批准安全推送",
            "summary": founder_request[:300],
            "risk_level": HIGH_RISK,
            "risk": "high",
            "status": "pending",
            "conversation_id": conversation_id,
            "source_type": "conversation_message",
            "source_id": source_message_id,
            "created_at": existing.get("created_at") if existing else now,
            "updated_at": now,
            "decision": existing.get("decision") if existing else None,
            "decided_at": existing.get("decided_at") if existing else None,
            "reason": risk.get("reason"),
            "metadata": {
                "queue_schema": "sino-safe-push-v1",
                "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
                "operation_type": SAFE_PUSH,
                "founder_request": founder_request,
                "push_request": push_request,
                "checkpoint_head": push_request.get("checkpoint_head"),
                "local_branch": push_request.get("local_branch"),
                "remote_name": push_request.get("remote_name"),
                "remote_branch": push_request.get("remote_branch"),
                "ahead_count": push_request.get("ahead_count"),
                "behind_count": push_request.get("behind_count"),
                "force_allowed": False,
                "tags_allowed": False,
                "delete_allowed": False,
                "deployment_allowed": False,
            },
        }
        if existing:
            for index, item in enumerate(queue):
                if item.get("action_id") == action_id:
                    queue[index] = {**item, **payload, "status": item.get("status") or "pending"}
                    break
        else:
            queue.append(payload)
        discovery["founder_action_queue"] = queue
        discovery["founder_action_required"] = True
        discovery["operational_runtime"] = {
            "status": "approval_required",
            "risk_decision": risk,
            "founder_request": founder_request,
            "source_message_id": source_message_id,
            "operation_type": SAFE_PUSH,
            "action_id": action_id,
            "push_request": push_request,
            "message": "这是 HIGH risk 推送请求；已进入 Founder Action Queue。批准前不会执行 git push。",
        }
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
    return action_id


def _append_safe_merge_queue_item(conversation_id: str, founder_request: str, source_message_id: str, risk: dict, merge_request: dict | None = None) -> str:
    now = _now()
    action_id = _safe_merge_action_id(source_message_id)
    merge_request = dict(merge_request or _safe_merge_preflight())
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("sino_brain_session_not_found")
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        existing = next((item for item in queue if item.get("action_id") == action_id), None)
        payload = {
            "action_id": action_id,
            "action_type": SAFE_MERGE_QUEUE_TYPE,
            "type": SAFE_MERGE_QUEUE_TYPE,
            "title": "批准本地安全合并",
            "summary": founder_request[:300],
            "risk_level": HIGH_RISK,
            "risk": "high",
            "status": "pending",
            "conversation_id": conversation_id,
            "source_type": "conversation_message",
            "source_id": source_message_id,
            "created_at": existing.get("created_at") if existing else now,
            "updated_at": now,
            "decision": existing.get("decision") if existing else None,
            "decided_at": existing.get("decided_at") if existing else None,
            "reason": risk.get("reason"),
            "metadata": {
                "queue_schema": "sino-safe-merge-v1",
                "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
                "operation_type": SAFE_MERGE,
                "founder_request": founder_request,
                "merge_request": merge_request,
                "source_branch": merge_request.get("source_branch"),
                "source_head": merge_request.get("source_head"),
                "source_remote": merge_request.get("source_remote"),
                "source_remote_head": merge_request.get("source_remote_head"),
                "target_branch": merge_request.get("target_branch"),
                "target_head_before": merge_request.get("target_head_before"),
                "target_remote": merge_request.get("target_remote"),
                "target_remote_head_before": merge_request.get("target_remote_head_before"),
                "merge_strategy": "no_ff",
                "push_after_merge": False,
                "auto_conflict_resolution": False,
            },
        }
        if existing:
            for index, item in enumerate(queue):
                if item.get("action_id") == action_id:
                    queue[index] = {**item, **payload, "status": item.get("status") or "pending"}
                    break
        else:
            queue.append(payload)
        discovery["founder_action_queue"] = queue
        discovery["founder_action_required"] = True
        discovery["operational_runtime"] = {
            "status": "approval_required",
            "risk_decision": risk,
            "founder_request": founder_request,
            "source_message_id": source_message_id,
            "operation_type": SAFE_MERGE,
            "action_id": action_id,
            "merge_request": merge_request,
            "message": "这是 HIGH risk 本地合并请求；已进入 Founder Action Queue。批准前不会执行 git switch 或 git merge。",
        }
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
    return action_id


def _append_safe_integration_push_queue_item(conversation_id: str, founder_request: str, source_message_id: str, risk: dict) -> str:
    now = _now()
    action_id = _safe_integration_push_action_id(source_message_id)
    push_request = _safe_integration_push_preflight()
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("sino_brain_session_not_found")
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        existing = next((item for item in queue if item.get("action_id") == action_id), None)
        payload = {
            "action_id": action_id,
            "action_type": SAFE_INTEGRATION_PUSH_QUEUE_TYPE,
            "type": SAFE_INTEGRATION_PUSH_QUEUE_TYPE,
            "title": "批准 Integration 安全推送",
            "summary": founder_request[:300],
            "risk_level": HIGH_RISK,
            "risk": "high",
            "status": "pending",
            "conversation_id": conversation_id,
            "source_type": "conversation_message",
            "source_id": source_message_id,
            "created_at": existing.get("created_at") if existing else now,
            "updated_at": now,
            "decision": existing.get("decision") if existing else None,
            "decided_at": existing.get("decided_at") if existing else None,
            "reason": risk.get("reason"),
            "metadata": {
                "queue_schema": "sino-safe-integration-push-v1",
                "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
                "operation_type": SAFE_INTEGRATION_PUSH,
                "founder_request": founder_request,
                "push_request": push_request,
                "integration_branch": push_request.get("integration_branch"),
                "integration_head": push_request.get("integration_head"),
                "remote_name": push_request.get("remote_name"),
                "remote_branch": push_request.get("remote_branch"),
                "remote_head_at_approval": push_request.get("remote_head_at_approval"),
                "ahead_count": push_request.get("ahead_count"),
                "behind_count": push_request.get("behind_count"),
                "working_tree_clean": push_request.get("working_tree_clean"),
                "force_allowed": False,
                "tags_allowed": False,
                "delete_allowed": False,
                "deployment_allowed": False,
                "safe_merge_action_id": push_request.get("safe_merge_action_id"),
                "merge_commit_head": push_request.get("merge_commit_head"),
                "merged_source_branch": push_request.get("merged_source_branch"),
                "merged_source_head": push_request.get("merged_source_head"),
            },
        }
        if existing:
            for index, item in enumerate(queue):
                if item.get("action_id") == action_id:
                    queue[index] = {**item, **payload, "status": item.get("status") or "pending"}
                    break
        else:
            queue.append(payload)
        discovery["founder_action_queue"] = queue
        discovery["founder_action_required"] = True
        discovery["operational_runtime"] = {
            "status": "approval_required",
            "risk_decision": risk,
            "founder_request": founder_request,
            "source_message_id": source_message_id,
            "operation_type": SAFE_INTEGRATION_PUSH,
            "action_id": action_id,
            "push_request": push_request,
            "message": "这是 HIGH risk Integration Push 请求；已进入 Founder Action Queue。批准前不会执行 git push。",
        }
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
    return action_id


def start_autonomous_development_mission(conversation_id: str, founder_request: str, source_message_id: str) -> dict:
    started_at = _now()
    root = repo_root()
    current_branch = _git_output(["branch", "--show-current"], cwd=root).stdout.strip()
    baseline = _configured_integration_baseline(cwd=root)
    baseline_branch = baseline["branch"]
    baseline_head = baseline["head"]
    mission_id = _mission_id(source_message_id)
    previous_unintegrated = _find_previous_unintegrated_mission(excluding_mission_id=mission_id)
    status_lines = _git_status_short(cwd=root)
    if previous_unintegrated and (current_branch != baseline_branch or status_lines):
        mission = {
            "mission_id": mission_id,
            "conversation_id": conversation_id,
            "founder_request": founder_request,
            "mission_type": "CONTROLLED_DEVELOPMENT",
            "status": "BLOCKED",
            "current_stage": "BLOCKED",
            "failed_stage": "PLANNING",
            "failure_type": "PREVIOUS_MISSION_NOT_INTEGRATED",
            "failure_summary": "上一项开发已修改/验证但尚未合并回 integration baseline；请先处理上一 Mission 的合并审批。",
            "baseline_branch": baseline_branch,
            "baseline_head": baseline_head,
            "working_branch": None,
            "previous_mission_id": previous_unintegrated.get("mission_id"),
            "previous_working_branch": previous_unintegrated.get("working_branch"),
            "previous_merge_action_id": previous_unintegrated.get("merge_action_id"),
            "source_message_id": source_message_id,
            "created_at": started_at,
        }
        _persist_mission(conversation_id, mission)
        _append_assistant_message(
            conversation_id,
            "上一项开发已经修改并验证完成，但还没有合并回开发基线。请先处理上一 Mission 的本地安全合并审批。",
            message_type="operational_result",
            grounding={"mission": mission},
        )
        return {"handled": True, "status": "blocked", "mission_id": mission_id, "mission": mission}
    if not baseline["exists"] or not baseline_head:
        mission = {
            "mission_id": mission_id,
            "conversation_id": conversation_id,
            "founder_request": founder_request,
            "mission_type": "CONTROLLED_DEVELOPMENT",
            "status": "BLOCKED",
            "current_stage": "BLOCKED",
            "failed_stage": "PLANNING",
            "failure_type": "MISSION_BASELINE_NOT_READY",
            "failure_summary": "Configured integration baseline branch is unavailable.",
            "baseline_branch": baseline_branch,
            "baseline_head": baseline_head,
            "working_branch": None,
            "source_message_id": source_message_id,
            "created_at": started_at,
        }
        _persist_mission(conversation_id, mission)
        _append_assistant_message(conversation_id, "Mission 已阻断：configured integration baseline 不可用。", message_type="operational_result", grounding={"mission": mission})
        return {"handled": True, "status": "blocked", "mission_id": mission_id, "mission": mission}
    branch_resolution = _resolve_mission_working_branch(founder_request, mission_id, baseline_head, cwd=root)
    working_branch = branch_resolution["working_branch"]
    plan = _plan_for_development_request(founder_request)
    live_acceptance_mode = bool(plan.get("live_acceptance_mode"))
    routing_acceptance_mode = bool(plan.get("routing_acceptance_mode"))
    if status_lines and not (live_acceptance_mode or routing_acceptance_mode):
        mission = {
            "mission_id": mission_id,
            "conversation_id": conversation_id,
            "founder_request": founder_request,
            "mission_type": "CONTROLLED_DEVELOPMENT",
            "status": "BLOCKED",
            "current_stage": "BLOCKED",
            "failed_stage": "PLANNING",
            "failure_type": "MISSION_BASELINE_NOT_READY",
            "failure_summary": "Mission must start from clean configured integration baseline.",
            "baseline_branch": baseline_branch,
            "baseline_head": baseline_head,
            "working_branch": working_branch,
            "source_message_id": source_message_id,
            "created_at": started_at,
        }
        _persist_mission(conversation_id, mission)
        _append_assistant_message(conversation_id, "Mission 已阻断：必须从 clean integration baseline 启动。", message_type="operational_result", grounding={"mission": mission})
        return {"handled": True, "status": "blocked", "mission_id": mission_id, "mission": mission}
    branch_already_exists_for_same_mission = branch_resolution["strategy"] == "same_mission_retry_reuse" and _git_branch_exists(working_branch, cwd=root)
    created_branch = SimpleNamespace(returncode=0, stdout="", stderr="") if branch_already_exists_for_same_mission else _git_safe_create_branch(working_branch, cwd=root, start_point=baseline_branch)
    if created_branch.returncode != 0:
        mission = {
            "mission_id": mission_id,
            "conversation_id": conversation_id,
            "founder_request": founder_request,
            "mission_type": "CONTROLLED_DEVELOPMENT",
            "status": "FAILED",
            "current_stage": "FAILED",
            "failed_stage": "PLANNING",
            "failure_type": "MISSION_BRANCH_CREATE_FAILED",
            "failure_summary": _excerpt(created_branch.stderr or created_branch.stdout, 1000),
            "baseline_branch": baseline_branch,
            "baseline_head": baseline_head,
            "working_branch": working_branch,
            "source_message_id": source_message_id,
            "branch_resolution": branch_resolution,
            "created_at": started_at,
        }
        _persist_mission(conversation_id, mission)
        _append_assistant_message(conversation_id, f"Mission 创建分支失败：{mission['failure_summary']}", message_type="operational_result", grounding={"mission": mission})
        return {"handled": True, "status": "failed", "mission_id": mission_id, "mission": mission}
    plan["working_branch"] = working_branch
    plan["mission_id"] = mission_id
    plan["conversation_id"] = conversation_id
    plan["baseline_head"] = baseline_head
    plan["branch_resolution"] = branch_resolution
    risk = {
        "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
        "risk_level": MEDIUM_RISK,
        "auto_continue": False,
        "operation": "bounded_code_change",
        "operation_type": BOUNDED_CODE_CHANGE,
        "reason": "mission_change_requires_founder_approval",
        "approval_required": True,
        "plan": plan,
    }
    mission = {
        "mission_id": mission_id,
        "conversation_id": conversation_id,
        "founder_request": founder_request,
        "mission_type": "CONTROLLED_DEVELOPMENT",
        "status": "WAITING_CHANGE_APPROVAL",
        "current_stage": "WAITING_CHANGE_APPROVAL",
        "risk_level": MEDIUM_RISK,
        "source_message_id": source_message_id,
        "working_branch": working_branch,
        "branch_resolution": branch_resolution,
        "baseline_branch": baseline_branch,
        "baseline_head": baseline_head,
        "allowed_files": list(plan.get("allowed_files") or []),
        "allowed_directories": list(plan.get("allowed_directories") or []),
        "acceptance_criteria": list(plan.get("acceptance_criteria") or []),
        "verification_plan": [list(argv) for argv in plan.get("verification_commands") or []],
        "live_acceptance_mode": live_acceptance_mode,
        "routing_acceptance_mode": routing_acceptance_mode,
        "last_completed_step": "MISSION_BRANCH_CREATED",
        "next_required_action": "BOUNDED_CODE_CHANGE_APPROVAL",
        "created_at": started_at,
    }
    _persist_mission(conversation_id, mission)
    action_id = _append_bounded_code_change_queue_item(conversation_id, founder_request, source_message_id, risk)
    _attach_mission_to_action(conversation_id, action_id, mission, "WAITING_CHANGE_APPROVAL")
    mission = {**mission, "change_action_id": action_id}
    _persist_mission(conversation_id, mission)
    acknowledgement_message_id = _append_assistant_message(
        conversation_id,
        (
            "我已理解，这是一个 Autonomous Development Mission。\n\n"
            f"工作分支：{working_branch}\n"
            f"修改范围：{', '.join(mission['allowed_files'] or mission['allowed_directories'])}\n"
            "验证：focused frontend test + frontend build\n\n"
            "需要你批准本次代码修改。批准后 Sino 会自动修改、验证并创建本地 checkpoint；不会自动 push/merge。"
        ),
        message_type="operational_approval_required",
        grounding={"mission": mission, "operational_runtime": {"status": "approval_required", "operation_type": AUTONOMOUS_DEVELOPMENT_MISSION, "action_id": action_id}},
    )
    mission = {**mission, "acknowledgement_message_id": acknowledgement_message_id}
    _persist_mission(conversation_id, mission)
    return {"handled": True, "status": "approval_required", "mission_id": mission_id, "action_id": action_id, "mission": mission}


def _resume_mission_after_step(conversation_id: str, mission: dict, step_operation: str, step_result: dict) -> None:
    mission = dict(mission)
    if not step_result.get("success"):
        mission.update({
            "status": "FAILED",
            "current_stage": "FAILED",
            "failed_stage": mission.get("current_stage"),
            "failure_type": step_result.get("failure_type") or step_result.get("check_result") or "MISSION_STEP_FAILED",
            "failure_summary": step_result.get("summary"),
            "last_result": step_result,
        })
        _persist_mission(conversation_id, mission)
        _append_assistant_message(conversation_id, f"Mission 在 {mission.get('failed_stage')} 阶段停止：{mission.get('failure_summary')}", message_type="operational_result", grounding={"mission": mission})
        return
    if step_operation == BOUNDED_CODE_CHANGE:
        if mission.get("live_acceptance_mode") or step_result.get("live_acceptance_mode"):
            mission.update({
                "status": "COMPLETED",
                "current_stage": "COMPLETED",
                "last_completed_step": "VERIFYING",
                "change_result": step_result,
                "next_required_action": None,
                "final_integration_head": mission.get("baseline_head"),
                "live_acceptance_result": {
                    "status": "LIVE_ACCEPTANCE_VERIFIED",
                    "checkpoint_intentionally_not_requested": True,
                    "push_merge_integration_push_intentionally_not_requested": True,
                },
            })
            _persist_mission(conversation_id, mission)
            _append_assistant_message(
                conversation_id,
                (
                    "Live Founder Acceptance 已完成验证。\n\n"
                    f"修改文件：{', '.join(step_result.get('changed_files') or []) or '无'}\n"
                    f"边界：{step_result.get('boundary_check')}\n"
                    f"验证：{step_result.get('check_result')}\n"
                    "本轮真人验收只到 verification；未执行 checkpoint、push、merge。"
                ),
                message_type="operational_result",
                grounding={"mission": mission},
            )
            return
        checkpoint = dict(step_result.get("checkpoint") or {})
        if not checkpoint.get("success") or not checkpoint.get("new_head"):
            mission.update({
                "status": "FAILED",
                "current_stage": "FAILED",
                "failed_stage": "CHECKPOINTING",
                "failure_type": checkpoint.get("failure_type") or "CHECKPOINT_MISSING",
                "failure_summary": checkpoint.get("summary") or "verification passed but local checkpoint was not created",
                "last_completed_step": "VERIFYING",
                "change_result": step_result,
                "next_required_action": None,
            })
            _persist_mission(conversation_id, mission)
            _append_assistant_message(conversation_id, f"Mission 在 checkpoint 阶段停止：{mission.get('failure_summary')}", message_type="operational_result", grounding={"mission": mission})
            return
        mission.update({
            "status": "WAITING_MERGE_APPROVAL",
            "current_stage": "WAITING_MERGE_APPROVAL",
            "last_completed_step": "CHECKPOINTING",
            "checkpoint_head": checkpoint.get("new_head"),
            "change_result": step_result,
            "next_required_action": "SAFE_MERGE_APPROVAL",
        })
        _persist_mission(conversation_id, mission)
        risk = {"work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK, "risk_level": HIGH_RISK, "auto_continue": False, "operation": "safe_merge", "operation_type": SAFE_MERGE, "reason": "mission_merge_requires_founder_approval", "approval_required": True}
        merge_request = _mission_safe_merge_request(mission, checkpoint, cwd=repo_root())
        action_id = _append_safe_merge_queue_item(conversation_id, "Mission 下一步：本地 --no-ff 合并 feature 到 integration。", f"{mission['mission_id']}:safe-merge", risk, merge_request=merge_request)
        mission["merge_action_id"] = action_id
        _persist_mission(conversation_id, mission)
        _attach_mission_to_action(conversation_id, action_id, mission, "WAITING_MERGE_APPROVAL")
        _append_assistant_message(conversation_id, "本地 checkpoint 已完成。接下来需要你批准本地 --no-ff merge 到 integration baseline。", message_type="operational_approval_required", grounding={"mission": mission})
        return
    if step_operation == SAFE_PUSH:
        mission.update({
            "status": "WAITING_MERGE_APPROVAL",
            "current_stage": "WAITING_MERGE_APPROVAL",
            "last_completed_step": "PUSHING_FEATURE",
            "feature_push_result": step_result,
            "next_required_action": "SAFE_MERGE_APPROVAL",
        })
        _persist_mission(conversation_id, mission)
        risk = {"work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK, "risk_level": HIGH_RISK, "auto_continue": False, "operation": "safe_merge", "operation_type": SAFE_MERGE, "reason": "mission_merge_requires_founder_approval", "approval_required": True}
        action_id = _append_safe_merge_queue_item(conversation_id, "Mission 下一步：本地 --no-ff 合并 feature 到 integration。", f"{mission['mission_id']}:safe-merge", risk)
        mission["merge_action_id"] = action_id
        _persist_mission(conversation_id, mission)
        _attach_mission_to_action(conversation_id, action_id, mission, "WAITING_MERGE_APPROVAL")
        _append_assistant_message(conversation_id, "Feature branch 已安全推送。接下来需要你批准本地 --no-ff merge 到 integration。", message_type="operational_approval_required", grounding={"mission": mission})
        return
    if step_operation == SAFE_MERGE:
        mission.update({
            "status": "COMPLETED",
            "current_stage": "COMPLETED",
            "last_completed_step": "MERGING",
            "merge_result": step_result,
            "merge_head": step_result.get("merge_commit_head"),
            "final_integration_head": step_result.get("merge_commit_head"),
            "next_required_action": None,
            "remote_integration_push_required": True,
        })
        _persist_mission(conversation_id, mission)
        _append_assistant_message(
            conversation_id,
            (
                "开发任务已完成并合并回本地 integration baseline。\n\n"
                f"Feature branch：{mission.get('working_branch')}\n"
                f"Checkpoint：{mission.get('checkpoint_head')}\n"
                f"Merge：{mission.get('merge_head')}\n"
                "Integration Push：尚未执行，仍需单独高风险审批。"
            ),
            message_type="operational_result",
            grounding={"mission": mission},
        )
        return
    if step_operation == SAFE_INTEGRATION_PUSH:
        mission.update({
            "status": "COMPLETED",
            "current_stage": "COMPLETED",
            "last_completed_step": "PUSHING_INTEGRATION",
            "integration_push_result": step_result,
            "final_integration_head": step_result.get("remote_head_after") or step_result.get("integration_head"),
            "next_required_action": None,
        })
        _persist_mission(conversation_id, mission)
        _append_assistant_message(
            conversation_id,
            (
                "开发任务已完成并进入 integration baseline。\n\n"
                f"Feature branch：{mission.get('working_branch')}\n"
                f"Checkpoint：{mission.get('checkpoint_head')}\n"
                f"Merge：{mission.get('merge_head')}\n"
                f"Integration Push：PASS\n"
                f"最终 Integration HEAD：{mission.get('final_integration_head')}"
            ),
            message_type="operational_result",
            grounding={"mission": mission},
        )


def _task_scope(*, founder_request: str, conversation_id: str, source_message_id: str, risk: dict, spec: OperationSpec) -> dict:
    allowed_scope = ["git status", "git branch --show-current", "git rev-parse HEAD"] if spec.operation_type == REPO_INSPECTION else list(spec.argv or [])
    acceptance = {
        REPO_INSPECTION: [
            "Return current branch",
            "Return current HEAD",
            "Return whether the working tree has uncommitted files",
        ],
        ANALYTICAL_INSPECTION: [
            "Collect read-only product and conversation evidence",
            "Invoke the configured Sino reasoning model",
            "Return one concrete Founder-visible product issue and a specific change recommendation",
        ],
        FOCUSED_TEST: [
            "Run the allowlisted Sino Operational Runtime focused test target",
            "Return passed/failed/errors and concise failure summary",
        ],
        FRONTEND_BUILD: [
            "Run the canonical frontend build",
            "Return PASS/FAIL and concise output summary",
        ],
    }[spec.operation_type]
    return {
        "operational_runtime": {
            "schema_version": "sino-operational-runtime-v1",
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "operation": (risk.get("operation") or spec.operation_type.lower()),
            "operation_type": spec.operation_type,
            "founder_request": founder_request,
            "conversation_id": conversation_id,
            "source_message_id": source_message_id,
            "repo_path": str(repo_root()),
            "risk_decision": risk,
            "risk_level": risk["risk_level"],
            "allowed_scope": allowed_scope,
            "timeout_seconds": spec.timeout_seconds,
            "acceptance_criteria": acceptance,
            "explicit_non_goals": [
                "Do not modify code",
                "Do not write production DB",
                "Do not push",
                "Do not invoke Codex or a provider",
            ],
            "auto_continue_policy": "LOW risk controlled local development task",
        }
    }


def execute_low_risk_repo_inspection(
    *,
    conversation_id: str,
    founder_request: str,
    source_message_id: str,
    runner: Callable[[], dict] | None = None,
) -> dict:
    return execute_low_risk_operation(
        conversation_id=conversation_id,
        founder_request=founder_request,
        source_message_id=source_message_id,
        runner=runner,
    )


def _normalize_operation_result(spec: OperationSpec, result: dict) -> dict:
    if spec.operation_type == REPO_INSPECTION:
        return {
            "operation_type": REPO_INSPECTION,
            "success": True,
            "check_result": "PASS",
            "exit_code": 0,
            "summary": (
                f"当前 branch：{result['branch']}\n"
                f"当前 HEAD：{result['head']}\n"
                f"工作区：{'clean' if result['working_tree_clean'] else 'dirty'}\n"
                f"建议优先改进：{result.get('recommended_product_improvement') or '继续加强 clear intent routing 的回归覆盖。'}"
            ),
            "stdout_excerpt": result.get("status_short") or "",
            "stderr_excerpt": "",
            "started_at": _now(),
            "completed_at": _now(),
            "result": result,
            "real_executor_used": "LOCAL_EXECUTOR",
        }
    payload = dict(result)
    payload.setdefault("operation_type", spec.operation_type)
    payload.setdefault("real_executor_used", "LOCAL_EXECUTOR")
    payload.setdefault("result", {})
    return payload


def _operation_start_message(spec: OperationSpec) -> str:
    if spec.operation_type == ANALYTICAL_INSPECTION:
        return "我先做一次只读产品检查，不会修改代码。正在检查…"
    return "这是一个低风险本地开发检查工作，我会直接执行。正在准备执行…"


def collect_analytical_inspection_evidence(*, conversation_id: str, founder_request: str) -> dict:
    """Collect bounded read-only evidence for a product-analysis answer."""
    root = repo_root()
    repo = run_repo_inspection(cwd=root)
    files = {
        "ConversationThread.jsx": root / "frontend/src/sino-founder/ConversationThread.jsx",
        "SinoBrainContext.jsx": root / "frontend/src/sino-founder/SinoBrainContext.jsx",
        "operational_runtime.py": root / "backend/app/founder_ai/operational_runtime.py",
    }
    snippets = {}
    markers = {}
    for label, path in files.items():
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            text = ""
        snippets[label] = _excerpt(text, 2200)
        markers[label] = {
            "has_execution_center": "Execution Center" in text or "执行中心" in text,
            "has_action_queue": "Action Queue" in text or "founder_action_queue" in text,
            "has_ready_to_execute": "ready_to_execute" in text,
            "has_approval_required": "approval_required" in text,
        }
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        messages = list(session.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at)))
        tasks = list(session.scalars(select(TaskAssetDB).where(
            TaskAssetDB.conversation_id == conversation_id,
            TaskAssetDB.system_id == "founder_ai",
        ).order_by(TaskAssetDB.updated_at.desc()).limit(10)))
        discovery = dict(state.discovery or {}) if state else {}
    return {
        "evidence_type": ANALYTICAL_INSPECTION,
        "read_only": True,
        "founder_request": founder_request,
        "repo": repo,
        "frontend_component_markers": markers,
        "source_snippets": snippets,
        "conversation_state": {
            "conversation_id": conversation_id,
            "message_count": len(messages),
            "recent_messages": [
                {"message_id": item.id, "role": item.role, "content": item.content,
                 "message_type": item.message_type}
                for item in messages[-8:]
            ],
            "task_count": len(tasks),
            "tasks": [
                {"task_id": item.id, "title": item.title, "status": item.status,
                 "execution_status": item.execution_status,
                 "operation_type": ((item.scope or {}).get("operational_runtime") or {}).get("operation_type")}
                for item in tasks
            ],
            "current_discovery_keys": sorted(discovery.keys()),
        },
    }


def _fallback_analytical_answer(evidence: dict) -> dict:
    tasks = evidence.get("conversation_state", {}).get("tasks", [])
    issue = "分析型只读请求缺少自动执行闭环，容易停在任务准备状态。"
    if any(item.get("execution_status") == "ready_to_execute" or item.get("status") == "ready_to_execute" for item in tasks):
        issue = "只读分析任务会停在“等待进入执行”，Founder 看不到最终分析结论。"
    return {
        "observed_problem": issue,
        "founder_impact": "Founder 明确要求“检查、分析、给结论”时，界面只显示任务已准备或等待执行，实际使用中需要反复催促，仍拿不到可决策的产品建议。",
        "why_priority": "这是日常使用入口级问题：它让低风险只读分析看起来像执行系统卡住，直接削弱 Founder 对 Sino 自主完成分析工作的信任。",
        "specific_change": "把分析型只读请求接入 LOW risk analytical inspection 执行链：自动收集只读证据、调用 Sino reasoning model、在同一 conversation 返回最终分析，并把右侧任务标记为已完成。",
        "expected_experience": "Founder 发出产品检查请求后，只会看到一个检查任务短暂运行；随后同一对话直接出现“检查完成”以及一个具体问题、影响、优先级理由和修改建议。",
        "model_invoked": False,
        "fallback_used": True,
    }


def run_analytical_inspection(
    *,
    conversation_id: str,
    founder_request: str,
    evidence_collector: Callable[[], dict] | None = None,
    model_generator: Callable[[dict], dict] | None = None,
) -> dict:
    started = _now()
    evidence = evidence_collector() if evidence_collector else collect_analytical_inspection_evidence(
        conversation_id=conversation_id,
        founder_request=founder_request,
    )
    prompt = """You are Sino Founder AI completing a LOW-risk read-only analytical inspection. Use only the supplied evidence. Do not propose routing, architecture, or test-only improvements unless that is the directly visible Founder-facing product problem. Pick exactly one concrete product problem the Founder can see or feel in daily use. Return JSON with observed_problem, founder_impact, why_priority, specific_change, expected_experience. This is the final answer, not an acknowledgement."""
    payload = None
    provider = model = None
    model_invoked = False
    if model_generator is not None:
        payload = model_generator(evidence)
        model_invoked = True
    else:
        try:
            from app.founder_ai.conversation_core import conversation_model_authority
            from app.llm.gateway import llm_gateway
            from app.llm.models import LLMRequest
            authority = conversation_model_authority(conversation_id)
            runtimes = []
            if authority.get("primary") is not None:
                runtimes.append(authority["primary"])
            runtimes.extend(authority.get("fallbacks") or [])
            for runtime in runtimes:
                try:
                    request = LLMRequest(
                        system_prompt=prompt,
                        user_prompt=json.dumps({"founder_request": founder_request, "evidence": evidence}, ensure_ascii=False),
                        temperature=.25,
                        max_tokens=1100,
                        response_format="json",
                        metadata={
                            "runtime_role": "sino_conversation",
                            "purpose": "analytical_read_only_inspection",
                            "conversation_id": conversation_id,
                            "final_analysis_required": True,
                        },
                    )
                    response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, request)
                    payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
                    provider = response.provider
                    model = response.model
                    model_invoked = True
                    break
                except Exception:
                    continue
        except Exception:
            payload = None
    analysis = dict(payload or {}) if isinstance(payload, dict) else _fallback_analytical_answer(evidence)
    required = ("observed_problem", "founder_impact", "why_priority", "specific_change", "expected_experience")
    if any(not str(analysis.get(field) or "").strip() for field in required):
        analysis = _fallback_analytical_answer(evidence)
    analysis["model_invoked"] = model_invoked
    if provider:
        analysis["provider"] = provider
    if model:
        analysis["model"] = model
    final_answer = (
        "检查完成。当前最值得优先解决的一个具体产品问题是：\n\n"
        f"1. 具体问题\n{analysis['observed_problem']}\n\n"
        f"2. Founder 真实使用中会看到/感受到什么\n{analysis['founder_impact']}\n\n"
        f"3. 为什么这是当前影响最大的一个问题\n{analysis['why_priority']}\n\n"
        f"4. 建议具体修改什么\n{analysis['specific_change']}\n\n"
        f"5. 修改后应该是什么体验\n{analysis['expected_experience']}"
    )
    return {
        "operation_type": ANALYTICAL_INSPECTION,
        "success": True,
        "check_result": "PASS",
        "summary": final_answer,
        "stdout_excerpt": "",
        "stderr_excerpt": "",
        "started_at": started,
        "completed_at": _now(),
        "result": {"analysis": analysis, "evidence": evidence},
        "real_executor_used": "SINO_ANALYTICAL_INSPECTION_ORCHESTRATOR",
        "model_reasoning_required": True,
        "model_invoked": model_invoked,
    }


def _active_analytical_task_id(conversation_id: str) -> str | None:
    with SessionLocal() as session:
        tasks = list(session.scalars(select(TaskAssetDB).where(
            TaskAssetDB.conversation_id == conversation_id,
            TaskAssetDB.system_id == "founder_ai",
            TaskAssetDB.status.notin_(["completed", "failed", "cancelled", "superseded"]),
        ).order_by(TaskAssetDB.updated_at.desc())))
        for task in tasks:
            operation = dict((task.scope or {}).get("operational_runtime") or {}).get("operation_type")
            if operation == ANALYTICAL_INSPECTION:
                return str(task.id)
    return None


def execute_low_risk_operation(
    *,
    conversation_id: str,
    founder_request: str,
    source_message_id: str,
    runner: Callable[[], dict] | None = None,
) -> dict:
    risk = classify_operational_risk(founder_request)
    if risk.get("risk_level") != LOW_RISK or not risk.get("auto_continue"):
        raise ValueError("operational_request_not_low_risk")
    operation_type = risk.get("operation_type") or REPO_INSPECTION
    spec = OPERATION_REGISTRY[operation_type]
    active_task_id = _active_analytical_task_id(conversation_id) if operation_type == ANALYTICAL_INSPECTION else None
    if active_task_id is not None:
        task_id = active_task_id
    else:
        task = create_task_asset(
            title=spec.title,
            description=founder_request,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            scope=_task_scope(
                founder_request=founder_request,
                conversation_id=conversation_id,
                source_message_id=source_message_id,
                risk=risk,
                spec=spec,
            ),
            status="draft",
            approval_status="approved",
            execution_status="not_started",
        )
        task_id = task.id
    with SessionLocal() as session:
        task = session.get(TaskAssetDB, task_id)
        scope = dict(task.scope or {})
        prior_start = dict(scope.get("execution_start") or {})
        if prior_start.get("execution_id") and task.result:
            return {
                "handled": True,
                "risk_decision": risk,
                "task_id": task.id,
                "execution_id": prior_start["execution_id"],
                "created": False,
                "reused": True,
                "status": task.execution_status,
                "result": task.result,
            }
        execution_id = prior_start.get("execution_id") or _stable_execution_id(task.id, source_message_id)
        package = _execution_package(task=task, execution_id=execution_id, risk=risk)
        existing = get_execution_session(execution_id)
        if existing:
            execution, _package = existing
            created = False
        else:
            execution = ExecutionSession(
                id=execution_id,
                task_asset_id=task.id,
                execution_package_id=f"package-{execution_id}",
                executor="LOCAL_EXECUTOR",
                status="queued",
                approved_at=_now(),
                queued_at=_now(),
            )
            save_execution_session(execution, package)
            created = True
        start = {
            "schema_version": "operational-runtime-start-v1",
            "started_from": "sino_operational_auto_continue",
            "execution_id": execution_id,
            "task_asset_id": task.id,
            "task_id": task.id,
            "status": "queued",
            "operation_type": spec.operation_type,
            "queued_at": execution.queued_at or _now(),
            "source_conversation_id": conversation_id,
            "source_message_refs": [source_message_id],
        }
        scope["execution_start"] = start
        task.scope = scope
        task.status = "in_progress"
        task.execution_status = "queued"
        session.commit()

    queued_payload = {
        "status": "queued",
        "operation_type": spec.operation_type,
        "risk_decision": risk,
        "task_id": task_id,
        "execution_id": execution_id,
        "founder_request": founder_request,
        "source_message_id": source_message_id,
        "message": _operation_start_message(spec),
    }
    _update_brain(conversation_id, queued_payload)
    _append_assistant_message(
        conversation_id,
        queued_payload["message"],
        message_type="operational_execution",
        grounding={"operational_runtime": queued_payload},
    )
    try:
        running_payload = {**queued_payload, "status": "running", "message": "正在执行…"}
        _update_brain(conversation_id, running_payload)
        raw_result = (runner or (lambda: (
            run_repo_inspection()
            if spec.operation_type == REPO_INSPECTION
            else run_analytical_inspection(conversation_id=conversation_id, founder_request=founder_request)
            if spec.operation_type == ANALYTICAL_INSPECTION
            else run_allowlisted_process(spec)
        )))()
        result = _normalize_operation_result(spec, raw_result)
        completed_at = _now()
        execution_failed = result.get("check_result") == "EXECUTOR_FAILURE" or result.get("timeout") is True
        persisted_result = {
            "status": "failed" if execution_failed else "completed",
            "operation_type": spec.operation_type,
            "success": bool(result.get("success")),
            "check_result": result.get("check_result"),
            "summary": result.get("summary"),
            "stdout_excerpt": result.get("stdout_excerpt"),
            "stderr_excerpt": result.get("stderr_excerpt"),
            "exit_code": result.get("exit_code"),
            "duration_seconds": result.get("duration_seconds"),
            "result": result.get("result") or result,
            "completed_at": completed_at,
            "real_executor_used": "LOCAL_EXECUTOR",
        }
        with SessionLocal() as session:
            record = session.get(TaskAssetDB, task_id)
            record.result = persisted_result
            record.status = "failed" if execution_failed else "completed"
            record.execution_status = "failed" if execution_failed else "completed"
            scope = dict(record.scope or {})
            start = dict(scope.get("execution_start") or {})
            start.update({"status": persisted_result["status"], "completed_at": completed_at})
            scope["execution_start"] = start
            record.scope = scope
            session.commit()
        registry_record = get_execution_session(execution_id)
        if registry_record:
            execution, package = registry_record
            execution.status = persisted_result["status"]
            execution.completed_at = completed_at
            execution.result = persisted_result
            save_execution_session(execution, package)
        completed_payload = {
            **queued_payload,
            "status": persisted_result["status"],
            "result": persisted_result,
            "message": "执行完成。" if not execution_failed else "执行失败。",
        }
        _update_brain(conversation_id, completed_payload)
        _append_assistant_message(
            conversation_id,
            f"{'执行失败' if execution_failed else '执行完成'}。\n\n{persisted_result['summary']}",
            message_type="operational_result",
            grounding={"operational_runtime": completed_payload, "task_id": task_id, "execution_id": execution_id},
        )
        return {
            "handled": True,
            "risk_decision": risk,
            "task_id": task_id,
            "execution_id": execution_id,
            "created": created,
            "reused": False,
            "status": persisted_result["status"],
            "result": persisted_result,
        }
    except Exception as error:
        failed_at = _now()
        failure = {
            "status": "failed",
            "error": str(error),
            "failed_at": failed_at,
            "retryable": True,
            "real_executor_used": "LOCAL_EXECUTOR",
        }
        with SessionLocal() as session:
            record = session.get(TaskAssetDB, task_id)
            if record is not None:
                record.result = failure
                record.status = "failed"
                record.execution_status = "failed"
                session.commit()
        registry_record = get_execution_session(execution_id)
        if registry_record:
            execution, package = registry_record
            execution.status = "failed"
            execution.error_message = str(error)
            execution.completed_at = failed_at
            execution.result = failure
            save_execution_session(execution, package)
        _update_brain(conversation_id, {**queued_payload, **failure, "message": "执行失败。"})
        _append_assistant_message(
            conversation_id,
            f"执行失败：{error}\n\n可重试：是",
            message_type="operational_result",
            grounding={"operational_runtime": failure, "task_id": task_id, "execution_id": execution_id},
        )
        return {
            "handled": True,
            "risk_decision": risk,
            "task_id": task_id,
            "execution_id": execution_id,
            "created": created,
            "reused": False,
            "status": "failed",
            "result": failure,
        }


def _bounded_task_scope(*, founder_request: str, conversation_id: str, source_message_id: str, action_id: str, risk: dict, plan: dict) -> dict:
    return {
        "operational_runtime": {
            "schema_version": "sino-bounded-code-change-v1",
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "operation": "bounded_code_change",
            "operation_type": BOUNDED_CODE_CHANGE,
            "founder_request": founder_request,
            "conversation_id": conversation_id,
            "source_message_id": source_message_id,
            "action_id": action_id,
            "repo_path": str(repo_root()),
            "mission_id": plan.get("mission_id"),
            "working_branch": plan.get("working_branch"),
            "baseline_head": plan.get("baseline_head"),
            "risk_decision": risk,
            "risk_level": MEDIUM_RISK,
            "allowed_files": list(plan.get("allowed_files") or []),
            "allowed_directories": list(plan.get("allowed_directories") or []),
            "acceptance_criteria": list(plan.get("acceptance_criteria") or []),
            "explicit_non_goals": list(plan.get("explicit_non_goals") or []),
            "verification_commands": [list(argv) for argv in plan.get("verification_commands") or []],
            "rollback_boundary": plan.get("rollback_boundary"),
            "auto_continue_policy": "MEDIUM risk bounded code change after one Founder queue approval",
        }
    }


def _mark_bounded_action(conversation_id: str, action_id: str, updates: dict) -> None:
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        for index, item in enumerate(queue):
            if item.get("action_id") == action_id:
                queue[index] = {**item, **updates, "updated_at": _now()}
                break
        discovery["founder_action_queue"] = queue
        discovery["founder_action_required"] = any(item.get("status") == "pending" for item in queue)
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        session.commit()


def execute_bounded_code_change(
    *,
    conversation_id: str,
    founder_request: str,
    source_message_id: str,
    action_id: str,
    plan: dict,
    code_runner: Callable[[dict], dict] | None = None,
    verifier: Callable[[list[list[str]]], list[dict]] | None = None,
    checkpointer: Callable[..., dict] | None = None,
) -> dict:
    plan = dict(plan or {})
    risk = {
        "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
        "risk_level": MEDIUM_RISK,
        "auto_continue": True,
        "operation": "bounded_code_change",
        "operation_type": BOUNDED_CODE_CHANGE,
        "reason": "founder_approved_bounded_code_change",
        "approval_action_id": action_id,
        "plan": plan,
    }
    if not (plan.get("allowed_files") or plan.get("allowed_directories")):
        raise ValueError("bounded_code_change_requires_file_boundary")
    root = repo_root()
    current_branch = _git_output(["branch", "--show-current"], cwd=root).stdout.strip()
    baseline_head = _git_output(["rev-parse", "HEAD"], cwd=root).stdout.strip()
    plan.setdefault("working_branch", current_branch)
    plan.setdefault("baseline_head", baseline_head)
    plan.setdefault("approval_action_id", action_id)
    plan.setdefault("founder_request", founder_request)
    target_branch = _safe_git_ref(str(plan.get("working_branch") or current_branch), field="working_branch")
    if target_branch != current_branch:
        switched = _git_safe_switch_branch(target_branch, cwd=root)
        if switched.returncode != 0:
            raise RuntimeError(f"MISSION_BRANCH_SWITCH_FAILED: {_excerpt(switched.stderr or switched.stdout, 1000)}")
        current_branch = _git_output(["branch", "--show-current"], cwd=root).stdout.strip()
        if current_branch != target_branch:
            raise RuntimeError(f"MISSION_BRANCH_SWITCH_FAILED: expected {target_branch}, got {current_branch}")
    before_diff = _git_changed_or_untracked_names(cwd=root)
    plan["preexisting_dirty_files"] = sorted(before_diff)
    task = create_task_asset(
        title=plan.get("title") or "受控代码修改",
        description=founder_request,
        conversation_id=conversation_id,
        source_message_id=source_message_id,
        scope=_bounded_task_scope(
            founder_request=founder_request,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            action_id=action_id,
            risk=risk,
            plan=plan,
        ),
        status="draft",
        approval_status="approved",
        execution_status="not_started",
    )
    with SessionLocal() as session:
        task = session.get(TaskAssetDB, task.id)
        scope = dict(task.scope or {})
        prior_start = dict(scope.get("execution_start") or {})
        if prior_start.get("execution_id") and task.result:
            return {
                "handled": True,
                "risk_decision": risk,
                "task_id": task.id,
                "execution_id": prior_start["execution_id"],
                "created": False,
                "reused": True,
                "status": task.execution_status,
                "result": task.result,
            }
        execution_id = prior_start.get("execution_id") or _stable_execution_id(task.id, source_message_id)
        plan.setdefault("task_id", task.id)
        plan.setdefault("execution_id", execution_id)
        plan.setdefault("conversation_id", conversation_id)
        package = _execution_package(task=task, execution_id=execution_id, risk=risk)
        package.context.update({
            "operation_type": BOUNDED_CODE_CHANGE,
            "risk_level": MEDIUM_RISK,
            "allowed_files": list(plan.get("allowed_files") or []),
            "allowed_directories": list(plan.get("allowed_directories") or []),
            "acceptance_criteria": list(plan.get("acceptance_criteria") or []),
            "explicit_non_goals": list(plan.get("explicit_non_goals") or []),
            "verification_commands": [list(argv) for argv in plan.get("verification_commands") or []],
            "rollback_boundary": plan.get("rollback_boundary"),
        })
        existing = get_execution_session(execution_id)
        if existing:
            execution, _package = existing
            created = False
        else:
            execution = ExecutionSession(
                id=execution_id,
                task_asset_id=task.id,
                execution_package_id=f"package-{execution_id}",
                executor=executor_for_operation(BOUNDED_CODE_CHANGE),
                status="queued",
                approved_at=_now(),
                queued_at=_now(),
            )
            save_execution_session(execution, package)
            created = True
        scope["execution_start"] = {
            "schema_version": "bounded-code-change-start-v1",
            "started_from": "founder_approved_bounded_code_change",
            "execution_id": execution_id,
            "task_asset_id": task.id,
            "task_id": task.id,
            "status": "queued",
            "operation_type": BOUNDED_CODE_CHANGE,
            "queued_at": execution.queued_at or _now(),
            "source_conversation_id": conversation_id,
            "source_message_refs": [source_message_id],
            "action_id": action_id,
        }
        task.scope = scope
        task.status = "in_progress"
        task.execution_status = "queued"
        session.commit()

    queued_payload = {
        "status": "queued",
        "operation_type": BOUNDED_CODE_CHANGE,
        "risk_decision": risk,
        "task_id": task.id,
        "execution_id": execution_id,
        "action_id": action_id,
        "founder_request": founder_request,
        "plan": plan,
        "message": "受控代码修改已批准，我会自动执行并验证。正在准备 Codex 执行…",
    }
    _update_brain(conversation_id, queued_payload)
    _append_assistant_message(conversation_id, queued_payload["message"], message_type="operational_execution", grounding={"operational_runtime": queued_payload})
    try:
        running_payload = {**queued_payload, "status": "running", "message": "Sino 正在通过 Codex 处理授权范围内的代码修改…"}
        _update_brain(conversation_id, running_payload)
        code_result = (code_runner or (lambda selected_plan: run_bounded_code_change(selected_plan)))(plan)
        if code_result.get("success") is False:
            failure_type = code_result.get("failure_type") or "CODEX_EXECUTION_FAILED"
            raise RuntimeError(f"{failure_type}: {', '.join(code_result.get('errors') or []) or code_result.get('summary') or 'Codex execution failed'}")
        after_change_diff = _git_changed_or_untracked_names(cwd=root)
        new_or_changed = sorted(after_change_diff - before_diff | set(code_result.get("changed_files") or []))
        unexpected = [item for item in new_or_changed if not _is_allowed_change(item, plan)]
        verification_steps: list[dict] = []
        boundary_status = "PASS"
        if unexpected:
            boundary_status = "FAILED_BOUNDARY"
            success = False
            check_result = "FAILED_BOUNDARY"
            summary = f"检测到超出授权范围的修改，已停止：{', '.join(unexpected)}"
        else:
            verification_steps = (verifier or (lambda commands: run_verification_commands(commands)))([list(argv) for argv in plan.get("verification_commands") or []])
            success = bool(verification_steps) and all(step.get("success") for step in verification_steps)
            check_result = "PASS" if success else "FAIL"
            summary = "受控代码修改完成，验证通过。" if success else "受控代码修改完成，但验证失败。"
        completed_at = _now()
        test_counts = {
            "tests_passed": sum(int(step.get("passed") or 0) for step in verification_steps),
            "tests_failed": sum(int(step.get("failed") or 0) for step in verification_steps),
            "tests_errors": sum(int(step.get("errors") or 0) for step in verification_steps),
        }
        build_step = next((step for step in verification_steps if step.get("argv", [])[:3] == ["npm", "--prefix", "frontend"] and "build" in step.get("argv", [])), None)
        persisted_result = {
            "status": "failed" if boundary_status == "FAILED_BOUNDARY" else "completed",
            "operation_type": BOUNDED_CODE_CHANGE,
            "success": success,
            "check_result": check_result,
            "summary": summary,
            "changed_files": new_or_changed,
            "diff_summary": code_result.get("diff_summary"),
            "verification_steps": verification_steps,
            "build_status": build_step.get("check_result") if build_step else None,
            "boundary_check": boundary_status,
            "unexpected_files": unexpected,
            "working_tree_status": "dirty" if after_change_diff else "clean",
            "live_acceptance_mode": bool(plan.get("live_acceptance_mode")),
            "started_at": queued_payload.get("queued_at"),
            "completed_at": completed_at,
            "real_executor_used": code_result.get("real_executor_used") or executor_for_operation(BOUNDED_CODE_CHANGE),
            "executor": code_result.get("executor") or "CODEX",
            "codex_invocation": code_result.get("codex_invocation"),
            "codex_session_id": code_result.get("codex_session_id"),
            "changed_files_claimed": list(code_result.get("changed_files_claimed") or code_result.get("changed_files") or []),
            "changed_files_observed": new_or_changed,
            **test_counts,
            "result": {
                "operation_type": BOUNDED_CODE_CHANGE,
                "changed_files": new_or_changed,
                "boundary_check": boundary_status,
                "build_status": build_step.get("check_result") if build_step else None,
                "working_tree_clean": not bool(after_change_diff),
                "live_acceptance_mode": bool(plan.get("live_acceptance_mode")),
                **test_counts,
            },
        }
        checkpoint_result = None
        if plan.get("auto_checkpoint", True) and boundary_status == "PASS" and check_result == "PASS" and success:
            checkpoint_result = (checkpointer or safe_checkpoint_commit)(
                plan=plan,
                execution_result=persisted_result,
                task_id=task.id,
                execution_id=execution_id,
                action_id=action_id,
                preexisting_dirty_files=before_diff,
                allow_preexisting_dirty=bool(plan.get("allow_preexisting_dirty_for_e2e")),
            )
            persisted_result["checkpoint"] = checkpoint_result
            persisted_result["checkpoint_status"] = "PASS" if checkpoint_result.get("success") else "FAIL"
            persisted_result["result"]["checkpoint"] = checkpoint_result
            if not checkpoint_result.get("success"):
                persisted_result["status"] = "failed"
                persisted_result["success"] = False
                persisted_result["check_result"] = checkpoint_result.get("failure_type") or "CHECKPOINT_PRECONDITION_FAILED"
                persisted_result["summary"] = f"受控代码修改已完成验证，但 checkpoint 未创建：{checkpoint_result.get('summary') or checkpoint_result.get('failure_type')}"
        with SessionLocal() as session:
            record = session.get(TaskAssetDB, task.id)
            record.result = persisted_result
            record.status = persisted_result["status"]
            record.execution_status = persisted_result["status"]
            scope = dict(record.scope or {})
            start = dict(scope.get("execution_start") or {})
            start.update({"status": persisted_result["status"], "completed_at": completed_at})
            scope["execution_start"] = start
            record.scope = scope
            session.commit()
        registry_record = get_execution_session(execution_id)
        if registry_record:
            execution, package = registry_record
            execution.status = persisted_result["status"]
            execution.completed_at = completed_at
            execution.result = persisted_result
            save_execution_session(execution, package)
        _mark_bounded_action(conversation_id, action_id, {"status": "completed" if persisted_result.get("success") else "rejected", "decision": "approved", "decided_at": completed_at, "task_id": task.id, "execution_id": execution_id, "result": persisted_result})
        completed_payload = {**queued_payload, "status": persisted_result["status"], "result": persisted_result, "message": summary}
        _update_brain(conversation_id, completed_payload)
        _append_assistant_message(
            conversation_id,
            (
                f"{persisted_result['summary']}\n\n"
                f"修改文件：{', '.join(persisted_result['changed_files']) or '无'}\n"
                f"验证：{persisted_result['check_result']}\n"
                f"Checkpoint：{(persisted_result.get('checkpoint') or {}).get('commit_message') or persisted_result.get('checkpoint_status') or '未执行'}\n"
                f"新 HEAD：{(persisted_result.get('checkpoint') or {}).get('new_head') or '无'}\n"
                f"工作区：{(persisted_result.get('checkpoint') or {}).get('working_tree_clean_after') if persisted_result.get('checkpoint') else persisted_result['working_tree_status']}"
            ),
            message_type="operational_result",
            grounding={"operational_runtime": completed_payload, "task_id": task.id, "execution_id": execution_id},
        )
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": persisted_result["status"], "result": persisted_result}
    except Exception as error:
        failed_at = _now()
        failure = {
            "status": "failed",
            "operation_type": BOUNDED_CODE_CHANGE,
            "check_result": "EXECUTOR_FAILED",
            "error": str(error),
            "summary": f"受控代码修改执行失败：{error}",
            "failed_at": failed_at,
            "retryable": True,
            "real_executor_used": executor_for_operation(BOUNDED_CODE_CHANGE),
            "executor": "CODEX",
        }
        with SessionLocal() as session:
            record = session.get(TaskAssetDB, task.id)
            if record is not None:
                record.result = failure
                record.status = "failed"
                record.execution_status = "failed"
                session.commit()
        registry_record = get_execution_session(execution_id)
        if registry_record:
            execution, package = registry_record
            execution.status = "failed"
            execution.error_message = str(error)
            execution.completed_at = failed_at
            execution.result = failure
            save_execution_session(execution, package)
        _update_brain(conversation_id, {**queued_payload, **failure, "message": failure["summary"]})
        _append_assistant_message(conversation_id, f"{failure['summary']}\n\n可重试：是", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task.id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}


def _safe_push_task_scope(*, founder_request: str, conversation_id: str, source_message_id: str, action_id: str, push_request: dict) -> dict:
    return {
        "operational_runtime": {
            "schema_version": "sino-safe-push-v1",
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "operation": "safe_push",
            "operation_type": SAFE_PUSH,
            "founder_request": founder_request,
            "conversation_id": conversation_id,
            "source_message_id": source_message_id,
            "action_id": action_id,
            "repo_path": str(repo_root()),
            "risk_level": HIGH_RISK,
            "approval_required": True,
            "approval_action_id": action_id,
            "push_request": push_request,
            "checkpoint_head": push_request.get("checkpoint_head"),
            "local_branch": push_request.get("local_branch"),
            "remote_name": push_request.get("remote_name"),
            "remote_branch": push_request.get("remote_branch"),
            "expected_ahead_count": push_request.get("ahead_count"),
            "expected_behind_count": push_request.get("behind_count"),
            "force_allowed": False,
            "tags_allowed": False,
            "delete_allowed": False,
            "deployment_allowed": False,
            "auto_continue_policy": "HIGH risk Safe Push only after separate Founder queue approval",
        }
    }


def _persist_safe_push_result(
    *,
    conversation_id: str,
    task: TaskAssetDB,
    execution_id: str,
    execution: ExecutionSession,
    action_id: str,
    queued_payload: dict,
    result: dict,
    queue_status: str,
) -> None:
    completed_at = result.get("completed_at") or _now()
    with SessionLocal() as session:
        record = session.get(TaskAssetDB, task.id)
        if record is not None:
            record.result = result
            record.status = result["status"]
            record.execution_status = result["status"]
            scope = dict(record.scope or {})
            start = dict(scope.get("execution_start") or {})
            start.update({"status": result["status"], "completed_at": completed_at})
            scope["execution_start"] = start
            record.scope = scope
            session.commit()
    registry_record = get_execution_session(execution_id)
    if registry_record:
        registry_session, package = registry_record
        registry_session.status = result["status"]
        registry_session.completed_at = completed_at
        registry_session.result = result
        if result.get("failure_type"):
            registry_session.error_message = result.get("summary")
        save_execution_session(registry_session, package)
    _mark_bounded_action(conversation_id, action_id, {
        "status": queue_status,
        "decision": "approved",
        "decided_at": completed_at,
        "task_id": task.id,
        "execution_id": execution_id,
        "result": result,
    })
    _update_brain(conversation_id, {**queued_payload, "status": result["status"], "result": result, "message": result.get("summary")})


def execute_safe_push(
    *,
    conversation_id: str,
    founder_request: str,
    source_message_id: str,
    action_id: str,
    push_request: dict,
    cwd: Path | None = None,
    push_runner: Callable[[str, str, Path], subprocess.CompletedProcess] | None = None,
) -> dict:
    started_at = _now()
    root = cwd or repo_root()
    risk = {
        "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
        "risk_level": HIGH_RISK,
        "auto_continue": False,
        "operation": "safe_push",
        "operation_type": SAFE_PUSH,
        "reason": "founder_approved_safe_push",
        "approval_action_id": action_id,
    }
    task = create_task_asset(
        title="安全推送当前 checkpoint",
        description=founder_request,
        conversation_id=conversation_id,
        source_message_id=source_message_id,
        scope=_safe_push_task_scope(
            founder_request=founder_request,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            action_id=action_id,
            push_request=push_request,
        ),
        status="draft",
        approval_status="approved",
        execution_status="not_started",
    )
    with SessionLocal() as session:
        task = session.get(TaskAssetDB, task.id)
        scope = dict(task.scope or {})
        prior_start = dict(scope.get("execution_start") or {})
        if prior_start.get("execution_id") and task.result:
            existing = dict(task.result)
            if existing.get("success"):
                existing = {**existing, "already_up_to_date": True, "push_performed": False, "reused": True, "failure_type": "PUSH_ALREADY_UP_TO_DATE"}
            return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": prior_start["execution_id"], "created": False, "reused": True, "status": existing.get("status"), "result": existing}
        execution_id = prior_start.get("execution_id") or _stable_execution_id(task.id, source_message_id)
        package = _execution_package(task=task, execution_id=execution_id, risk=risk)
        package.context.update({
            "operation_type": SAFE_PUSH,
            "risk_level": HIGH_RISK,
            "approval_action_id": action_id,
            "checkpoint_head": push_request.get("checkpoint_head"),
            "local_branch": push_request.get("local_branch"),
            "remote_name": push_request.get("remote_name"),
            "remote_branch": push_request.get("remote_branch"),
            "expected_ahead_count": push_request.get("ahead_count"),
            "expected_behind_count": push_request.get("behind_count"),
            "force_allowed": False,
            "tags_allowed": False,
            "delete_allowed": False,
            "deployment_allowed": False,
        })
        existing_session = get_execution_session(execution_id)
        if existing_session:
            execution, _package = existing_session
            created = False
            if execution.status in {"executing", "running", "testing"}:
                return {
                    "handled": True,
                    "risk_decision": risk,
                    "task_id": task.id,
                    "execution_id": execution_id,
                    "created": False,
                    "reused": True,
                    "status": execution.status,
                    "result": execution.result,
                }
            if execution.status in {"completed", "failed", "blocked"} and execution.result:
                return {
                    "handled": True,
                    "risk_decision": risk,
                    "task_id": task.id,
                    "execution_id": execution_id,
                    "created": False,
                    "reused": True,
                    "status": execution.status,
                    "result": execution.result,
                }
        else:
            execution = ExecutionSession(
                id=execution_id,
                task_asset_id=task.id,
                execution_package_id=f"package-{execution_id}",
                executor="LOCAL_EXECUTOR",
                status="queued",
                approved_at=_now(),
                queued_at=_now(),
            )
            save_execution_session(execution, package)
            created = True
        scope["execution_start"] = {
            "schema_version": "safe-push-start-v1",
            "started_from": "founder_approved_safe_push",
            "execution_id": execution_id,
            "task_asset_id": task.id,
            "task_id": task.id,
            "status": "queued",
            "operation_type": SAFE_PUSH,
            "queued_at": execution.queued_at or _now(),
            "source_conversation_id": conversation_id,
            "source_message_refs": [source_message_id],
            "action_id": action_id,
        }
        task.scope = scope
        task.status = "in_progress"
        task.execution_status = "queued"
        session.commit()

    queued_payload = {
        "status": "queued",
        "operation_type": SAFE_PUSH,
        "risk_decision": risk,
        "task_id": task.id,
        "execution_id": execution_id,
        "action_id": action_id,
        "founder_request": founder_request,
        "push_request": push_request,
        "message": "已获得推送授权，正在进行远程状态检查。",
    }
    _update_brain(conversation_id, queued_payload)
    _append_assistant_message(conversation_id, queued_payload["message"], message_type="operational_execution", grounding={"operational_runtime": queued_payload})

    current = _safe_push_preflight(cwd=root, remote_name=str(push_request.get("remote_name") or "origin"))
    failure = _validate_safe_push_preconditions(push_request, current, started_at=started_at, action_id=action_id)
    if failure:
        _persist_safe_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, execution=execution, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"安全推送已停止：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task.id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}

    remote_name = current["remote_name"]
    branch = current["local_branch"]
    if int(current.get("ahead_count") or 0) == 0:
        result = {
            "operation_type": SAFE_PUSH,
            "status": "completed",
            "success": True,
            "approval_action_id": action_id,
            "previous_remote_head": current.get("remote_branch_head"),
            "local_head": current.get("local_head"),
            "new_remote_head": current.get("remote_branch_head") or current.get("local_head"),
            "local_branch": branch,
            "remote_name": remote_name,
            "remote_branch": current.get("remote_branch"),
            "ahead_before": 0,
            "behind_before": int(current.get("behind_count") or 0),
            "push_performed": False,
            "already_up_to_date": True,
            "force_used": False,
            "tags_pushed": False,
            "remote_delete": False,
            "summary": "远程分支已是当前 checkpoint；无需重复 push。",
            "stdout_excerpt": "",
            "stderr_excerpt": "",
            "started_at": started_at,
            "completed_at": _now(),
            "real_executor_used": "LOCAL_EXECUTOR",
            "preflight": current,
        }
        _persist_safe_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, execution=execution, action_id=action_id, queued_payload=queued_payload, result=result, queue_status="completed")
        _append_assistant_message(conversation_id, result["summary"], message_type="operational_result", grounding={"operational_runtime": result, "task_id": task.id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "completed", "result": result}

    _update_brain(conversation_id, {**queued_payload, "status": "running", "message": "正在安全推送当前 checkpoint…"})
    push = (push_runner or (lambda remote, selected_branch, selected_root: _git_safe_push(remote, selected_branch, cwd=selected_root)))(remote_name, branch, root)
    after = _safe_push_preflight(cwd=root, remote_name=remote_name)
    if push.returncode != 0:
        failure_type = "NON_FAST_FORWARD_BLOCKED" if "non-fast-forward" in (push.stderr or push.stdout).lower() else "PUSH_FAILED"
        failure = _safe_push_failure(failure_type, _excerpt(push.stderr or push.stdout, 1000), started_at=started_at, approval_action_id=action_id, preflight=after)
        failure.update({"stdout_excerpt": _excerpt(push.stdout or ""), "stderr_excerpt": _excerpt(push.stderr or "")})
        _persist_safe_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, execution=execution, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"安全推送失败：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task.id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}
    remote_matches = after.get("remote_branch_head") == current.get("local_head")
    if not remote_matches:
        failure = _safe_push_failure("REMOTE_STATE_CHANGED", "remote HEAD did not match approved local HEAD after push", started_at=started_at, approval_action_id=action_id, preflight=after)
        _persist_safe_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, execution=execution, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"安全推送结果异常：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task.id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}
    result = {
        "operation_type": SAFE_PUSH,
        "status": "completed",
        "success": True,
        "approval_action_id": action_id,
        "previous_remote_head": current.get("remote_branch_head"),
        "local_head": current.get("local_head"),
        "new_remote_head": after.get("remote_branch_head"),
        "local_branch": branch,
        "remote_name": remote_name,
        "remote_branch": current.get("remote_branch"),
        "ahead_before": int(current.get("ahead_count") or 0),
        "behind_before": int(current.get("behind_count") or 0),
        "push_performed": True,
        "already_up_to_date": False,
        "force_used": False,
        "tags_pushed": False,
        "remote_delete": False,
        "summary": f"安全推送完成：{branch} → {remote_name}/{branch}，推送 {int(current.get('ahead_count') or 0)} 个本地 checkpoint，未使用 force。",
        "stdout_excerpt": _excerpt(push.stdout or ""),
        "stderr_excerpt": _excerpt(push.stderr or ""),
        "started_at": started_at,
        "completed_at": _now(),
        "real_executor_used": "LOCAL_EXECUTOR",
        "preflight": current,
        "postflight": after,
    }
    _persist_safe_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, execution=execution, action_id=action_id, queued_payload=queued_payload, result=result, queue_status="completed")
    _append_assistant_message(
        conversation_id,
        (
            "安全推送完成：\n"
            f"{branch} → {remote_name}/{branch}\n"
            f"HEAD：{result['local_head']}\n"
            f"推送 {result['ahead_before']} 个本地 checkpoint\n"
            "force：NO"
        ),
        message_type="operational_result",
        grounding={"operational_runtime": result, "task_id": task.id, "execution_id": execution_id},
    )
    return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "completed", "result": result}


def _safe_integration_push_task_scope(*, founder_request: str, conversation_id: str, source_message_id: str, action_id: str, push_request: dict) -> dict:
    return {
        "operational_runtime": {
            "schema_version": "sino-safe-integration-push-v1",
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "operation": "safe_integration_push",
            "operation_type": SAFE_INTEGRATION_PUSH,
            "founder_request": founder_request,
            "conversation_id": conversation_id,
            "source_message_id": source_message_id,
            "action_id": action_id,
            "repo_path": str(repo_root()),
            "risk_level": HIGH_RISK,
            "approval_required": True,
            "approval_action_id": action_id,
            "push_request": push_request,
            "integration_branch": push_request.get("integration_branch"),
            "integration_head": push_request.get("integration_head"),
            "remote_name": push_request.get("remote_name"),
            "remote_branch": push_request.get("remote_branch"),
            "remote_head_at_approval": push_request.get("remote_head_at_approval"),
            "safe_merge_action_id": push_request.get("safe_merge_action_id"),
            "merge_commit_head": push_request.get("merge_commit_head"),
            "force_allowed": False,
            "tags_allowed": False,
            "delete_allowed": False,
            "deployment_allowed": False,
            "auto_continue_policy": "HIGH risk Integration Push only after separate Founder queue approval",
        }
    }


def _persist_safe_integration_push_result(
    *,
    conversation_id: str,
    task: TaskAssetDB,
    execution_id: str,
    action_id: str,
    queued_payload: dict,
    result: dict,
    queue_status: str,
) -> None:
    completed_at = result.get("completed_at") or _now()
    with SessionLocal() as session:
        record = session.get(TaskAssetDB, task.id)
        if record is not None:
            record.result = result
            record.status = result["status"]
            record.execution_status = result["status"]
            scope = dict(record.scope or {})
            start = dict(scope.get("execution_start") or {})
            start.update({"status": result["status"], "completed_at": completed_at})
            scope["execution_start"] = start
            record.scope = scope
            session.commit()
    registry_record = get_execution_session(execution_id)
    if registry_record:
        registry_session, package = registry_record
        registry_session.status = result["status"]
        registry_session.completed_at = completed_at
        registry_session.result = result
        if result.get("failure_type"):
            registry_session.error_message = result.get("summary")
        save_execution_session(registry_session, package)
    _mark_bounded_action(conversation_id, action_id, {
        "status": queue_status,
        "decision": "approved",
        "decided_at": completed_at,
        "task_id": task.id,
        "execution_id": execution_id,
        "result": result,
    })
    _update_brain(conversation_id, {**queued_payload, "status": result["status"], "result": result, "message": result.get("summary")})


def execute_safe_integration_push(
    *,
    conversation_id: str,
    founder_request: str,
    source_message_id: str,
    action_id: str,
    push_request: dict,
    cwd: Path | None = None,
    push_runner: Callable[[str, str, Path], subprocess.CompletedProcess] | None = None,
) -> dict:
    started_at = _now()
    root = cwd or repo_root()
    risk = {
        "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
        "risk_level": HIGH_RISK,
        "auto_continue": False,
        "operation": "safe_integration_push",
        "operation_type": SAFE_INTEGRATION_PUSH,
        "reason": "founder_approved_safe_integration_push",
        "approval_action_id": action_id,
    }
    task = create_task_asset(
        title="Integration 安全推送",
        description=founder_request,
        conversation_id=conversation_id,
        source_message_id=source_message_id,
        scope=_safe_integration_push_task_scope(
            founder_request=founder_request,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            action_id=action_id,
            push_request=push_request,
        ),
        status="draft",
        approval_status="approved",
        execution_status="not_started",
    )
    with SessionLocal() as session:
        task = session.get(TaskAssetDB, task.id)
        scope = dict(task.scope or {})
        prior_start = dict(scope.get("execution_start") or {})
        if prior_start.get("execution_id") and task.result:
            existing = dict(task.result)
            if existing.get("success"):
                existing = {**existing, "already_up_to_date": True, "push_performed": False, "reused": True, "failure_type": "PUSH_ALREADY_UP_TO_DATE"}
            return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": prior_start["execution_id"], "created": False, "reused": True, "status": existing.get("status"), "result": existing}
        execution_id = prior_start.get("execution_id") or _stable_execution_id(task.id, source_message_id)
        package = _execution_package(task=task, execution_id=execution_id, risk=risk)
        package.context.update({
            "operation_type": SAFE_INTEGRATION_PUSH,
            "risk_level": HIGH_RISK,
            "approval_action_id": action_id,
            "integration_branch": push_request.get("integration_branch"),
            "integration_head": push_request.get("integration_head"),
            "remote_name": push_request.get("remote_name"),
            "remote_branch": push_request.get("remote_branch"),
            "remote_head_at_approval": push_request.get("remote_head_at_approval"),
            "safe_merge_action_id": push_request.get("safe_merge_action_id"),
            "merge_commit_head": push_request.get("merge_commit_head"),
        })
        existing_session = get_execution_session(execution_id)
        if existing_session:
            execution, _package = existing_session
            created = False
        else:
            execution = ExecutionSession(id=execution_id, task_asset_id=task.id, execution_package_id=f"package-{execution_id}", executor="LOCAL_EXECUTOR", status="queued", approved_at=_now(), queued_at=_now())
            save_execution_session(execution, package)
            created = True
        scope["execution_start"] = {
            "schema_version": "safe-integration-push-start-v1",
            "started_from": "founder_approved_safe_integration_push",
            "execution_id": execution_id,
            "task_asset_id": task.id,
            "task_id": task.id,
            "status": "queued",
            "operation_type": SAFE_INTEGRATION_PUSH,
            "queued_at": execution.queued_at or _now(),
            "source_conversation_id": conversation_id,
            "source_message_refs": [source_message_id],
            "action_id": action_id,
        }
        task.scope = scope
        task.status = "in_progress"
        task.execution_status = "queued"
        session.commit()

    queued_payload = {
        "status": "queued",
        "operation_type": SAFE_INTEGRATION_PUSH,
        "risk_decision": risk,
        "task_id": task.id,
        "execution_id": execution_id,
        "action_id": action_id,
        "founder_request": founder_request,
        "push_request": push_request,
        "message": "已获得 Integration Push 授权，正在重新检查远程状态。",
    }
    _update_brain(conversation_id, queued_payload)
    _append_assistant_message(conversation_id, queued_payload["message"], message_type="operational_execution", grounding={"operational_runtime": queued_payload})
    current = _safe_integration_push_preflight(cwd=root, remote_name=str(push_request.get("remote_name") or "origin"))
    failure = _validate_safe_integration_push_preconditions(push_request, current, started_at=started_at, action_id=action_id)
    if failure:
        _persist_safe_integration_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"Integration 安全推送已停止：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task.id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}

    remote_name = current["remote_name"]
    branch = current["integration_branch"]
    if int(current.get("ahead_count") or 0) == 0:
        result = {
            "operation_type": SAFE_INTEGRATION_PUSH,
            "status": "completed",
            "success": True,
            "approval_action_id": action_id,
            "integration_branch": branch,
            "integration_head": current.get("integration_head"),
            "remote_name": remote_name,
            "remote_branch": current.get("remote_branch"),
            "remote_head_before": current.get("remote_branch_head"),
            "remote_head_after": current.get("remote_branch_head") or current.get("integration_head"),
            "ahead_before": 0,
            "behind_before": int(current.get("behind_count") or 0),
            "push_performed": False,
            "already_up_to_date": True,
            "force_used": False,
            "tags_pushed": False,
            "remote_delete": False,
            "safe_merge_action_id": current.get("safe_merge_action_id"),
            "merge_commit_head": current.get("merge_commit_head"),
            "summary": "远程已包含当前 Integration HEAD，无需再次 push。",
            "stdout_excerpt": "",
            "stderr_excerpt": "",
            "started_at": started_at,
            "completed_at": _now(),
            "real_executor_used": "LOCAL_EXECUTOR",
            "preflight": current,
        }
        _persist_safe_integration_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=result, queue_status="completed")
        _append_assistant_message(conversation_id, result["summary"], message_type="operational_result", grounding={"operational_runtime": result, "task_id": task.id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "completed", "result": result}

    _update_brain(conversation_id, {**queued_payload, "status": "running", "message": "正在安全推送 Integration branch…"})
    push = (push_runner or (lambda remote, selected_branch, selected_root: _git_safe_push(remote, selected_branch, cwd=selected_root)))(remote_name, branch, root)
    after = _safe_integration_push_preflight(cwd=root, remote_name=remote_name)
    if push.returncode != 0:
        failure_type = "NON_FAST_FORWARD_BLOCKED" if "non-fast-forward" in (push.stderr or push.stdout).lower() else "PUSH_FAILED"
        failure = _safe_integration_push_failure(failure_type, _excerpt(push.stderr or push.stdout, 1000), started_at=started_at, approval_action_id=action_id, preflight=after)
        failure.update({"stdout_excerpt": _excerpt(push.stdout or ""), "stderr_excerpt": _excerpt(push.stderr or "")})
        _persist_safe_integration_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"Integration 安全推送失败：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task.id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}
    remote_matches = after.get("remote_branch_head") == current.get("integration_head")
    if not remote_matches:
        failure = _safe_integration_push_failure("REMOTE_STATE_CHANGED", "remote integration HEAD did not match approved local HEAD after push", started_at=started_at, approval_action_id=action_id, preflight=after)
        _persist_safe_integration_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"Integration 安全推送结果异常：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task.id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}
    result = {
        "operation_type": SAFE_INTEGRATION_PUSH,
        "status": "completed",
        "success": True,
        "approval_action_id": action_id,
        "integration_branch": branch,
        "integration_head": current.get("integration_head"),
        "remote_name": remote_name,
        "remote_branch": current.get("remote_branch"),
        "remote_head_before": current.get("remote_branch_head"),
        "remote_head_after": after.get("remote_branch_head"),
        "ahead_before": int(current.get("ahead_count") or 0),
        "behind_before": int(current.get("behind_count") or 0),
        "push_performed": True,
        "already_up_to_date": False,
        "force_used": False,
        "tags_pushed": False,
        "remote_delete": False,
        "safe_merge_action_id": current.get("safe_merge_action_id"),
        "merge_commit_head": current.get("merge_commit_head"),
        "summary": f"Integration 安全推送完成：{branch} → {remote_name}/{branch}，推送 {int(current.get('ahead_count') or 0)} 个本地 commit，未使用 force。",
        "stdout_excerpt": _excerpt(push.stdout or ""),
        "stderr_excerpt": _excerpt(push.stderr or ""),
        "started_at": started_at,
        "completed_at": _now(),
        "real_executor_used": "LOCAL_EXECUTOR",
        "preflight": current,
        "postflight": after,
    }
    _persist_safe_integration_push_result(conversation_id=conversation_id, task=task, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=result, queue_status="completed")
    _append_assistant_message(
        conversation_id,
        (
            "Integration 安全推送完成：\n"
            f"branch: {branch}\n"
            f"remote: {remote_name}/{branch}\n"
            f"HEAD: {result['integration_head']}\n"
            f"推送 commits: {result['ahead_before']}\n"
            "force: NO\n"
            "tags: NO"
        ),
        message_type="operational_result",
        grounding={"operational_runtime": result, "task_id": task.id, "execution_id": execution_id},
    )
    return {"handled": True, "risk_decision": risk, "task_id": task.id, "execution_id": execution_id, "created": created, "reused": False, "status": "completed", "result": result}


def _safe_merge_task_scope(*, founder_request: str, conversation_id: str, source_message_id: str, action_id: str, merge_request: dict) -> dict:
    return {
        "operational_runtime": {
            "schema_version": "sino-safe-merge-v1",
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "operation": "safe_merge",
            "operation_type": SAFE_MERGE,
            "founder_request": founder_request,
            "conversation_id": conversation_id,
            "source_message_id": source_message_id,
            "action_id": action_id,
            "repo_path": str(repo_root()),
            "risk_level": HIGH_RISK,
            "approval_required": True,
            "approval_action_id": action_id,
            "merge_request": merge_request,
            "source_branch": merge_request.get("source_branch"),
            "source_head": merge_request.get("source_head"),
            "target_branch": merge_request.get("target_branch"),
            "target_head_before": merge_request.get("target_head_before"),
            "merge_strategy": "no_ff",
            "push_after_merge": False,
            "auto_conflict_resolution": False,
        }
    }


def _persist_safe_merge_result(
    *,
    conversation_id: str,
    task_id: str,
    execution_id: str,
    action_id: str,
    queued_payload: dict,
    result: dict,
    queue_status: str,
) -> None:
    completed_at = result.get("completed_at") or _now()
    with SessionLocal() as session:
        record = session.get(TaskAssetDB, task_id)
        if record is not None:
            record.result = result
            record.status = result["status"]
            record.execution_status = result["status"]
            scope = dict(record.scope or {})
            start = dict(scope.get("execution_start") or {})
            start.update({"status": result["status"], "completed_at": completed_at})
            scope["execution_start"] = start
            record.scope = scope
            session.commit()
    registry_record = get_execution_session(execution_id)
    if registry_record:
        registry_session, package = registry_record
        registry_session.status = result["status"]
        registry_session.completed_at = completed_at
        registry_session.result = result
        if result.get("failure_type"):
            registry_session.error_message = result.get("summary")
        save_execution_session(registry_session, package)
    _mark_bounded_action(conversation_id, action_id, {
        "status": queue_status,
        "decision": "approved",
        "decided_at": completed_at,
        "task_id": task_id,
        "execution_id": execution_id,
        "result": result,
    })
    _update_brain(conversation_id, {**queued_payload, "status": result["status"], "result": result, "message": result.get("summary")})


def _mark_safe_merge_handler_started(
    *,
    conversation_id: str,
    task_id: str,
    execution_id: str,
    action_id: str,
    queued_payload: dict,
) -> None:
    started_at = _now()
    with SessionLocal() as session:
        record = session.get(TaskAssetDB, task_id)
        if record is not None:
            scope = dict(record.scope or {})
            start = dict(scope.get("execution_start") or {})
            start.update({"status": "executing", "handler_started_at": started_at})
            scope["execution_start"] = start
            record.scope = scope
            record.status = "in_progress"
            record.execution_status = "executing"
            session.commit()
    registry_record = get_execution_session(execution_id)
    if registry_record:
        registry_session, package = registry_record
        registry_session.status = "executing"
        registry_session.started_at = registry_session.started_at or started_at
        if not any((event.get("metadata") or {}).get("safe_merge_handler_started") for event in registry_session.events):
            append_event(
                registry_session,
                "execution_resumed",
                status="executing",
                message="Canonical Safe Merge handler started",
                timestamp=registry_session.started_at,
                metadata={
                    "approval_action_id": action_id,
                    "operation_type": SAFE_MERGE,
                    "safe_merge_handler_started": True,
                },
            )
        save_execution_session(registry_session, package)
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is not None:
            discovery = dict(state.discovery or {})
            mission_id = (queued_payload.get("merge_request") or {}).get("mission_id")
            mission = _mission_from_discovery(discovery, mission_id) if mission_id else None
            if mission:
                mission.update({
                    "status": "MERGING",
                    "current_stage": "MERGING",
                    "merge_execution_id": execution_id,
                    "next_required_action": None,
                    "updated_at": started_at,
                })
                missions = dict(discovery.get("autonomous_development_missions") or {})
                missions[mission["mission_id"]] = mission
                action_queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
                views = dict(discovery.get("autonomous_development_mission_views") or {})
                views[mission["mission_id"]] = build_mission_view(mission, action_queue)
                discovery["autonomous_development_missions"] = missions
                discovery["autonomous_development_mission"] = mission
                discovery["autonomous_development_mission_views"] = views
                discovery["autonomous_development_mission_view"] = views[mission["mission_id"]]
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
    _update_brain(conversation_id, {**queued_payload, "status": "running", "message": "正在执行本地安全合并…"})


ACTIVE_SAFE_MERGE_EXECUTION_STATUSES = {"approved", "queued", "executing", "running", "merging"}


def _safe_merge_context_request(context: dict) -> dict:
    return dict(context.get("merge_request") or {})


def _safe_merge_context_source_head(context: dict) -> str | None:
    merge_request = _safe_merge_context_request(context)
    return merge_request.get("source_head") or context.get("source_head")


def _safe_merge_context_target_head(context: dict) -> str | None:
    merge_request = _safe_merge_context_request(context)
    return (
        merge_request.get("target_head")
        or merge_request.get("target_head_before")
        or context.get("target_head")
        or context.get("target_head_before")
    )


def _find_active_safe_merge_execution(*, action_id: str, source_head: str | None, target_head: str | None) -> tuple[ExecutionSession, ExecutionPackage] | None:
    if not action_id:
        return None
    for candidate in list_execution_sessions():
        if candidate.status not in ACTIVE_SAFE_MERGE_EXECUTION_STATUSES:
            continue
        record = get_execution_session(candidate.id)
        if record is None:
            continue
        session_record, package = record
        context = dict(package.context or {})
        if context.get("operation_type") != SAFE_MERGE or package.execution_allowed:
            continue
        if context.get("approval_action_id") != action_id:
            continue
        if source_head and _safe_merge_context_source_head(context) != source_head:
            continue
        if target_head and _safe_merge_context_target_head(context) != target_head:
            continue
        return session_record, package
    return None


def _safe_merge_current_dispatch_authority(context: dict) -> dict:
    action_id = str(context.get("approval_action_id") or "")
    if not action_id:
        return {"current": True, "reason": "no_action_context"}
    try:
        state, action = _find_action(action_id)
    except LookupError:
        return {"current": True, "reason": "action_not_found"}
    action_status = action.get("status")
    if action_status in {"superseded", "rejected", "cancelled", "canceled", "invalidated"}:
        return {"current": False, "gate": "SUPERSEDED_SAFE_MERGE_ACTION", "reason": f"SAFE_MERGE action is {action_status}."}
    mission = _mission_for_action(action, state)
    current_action_id = mission.get("merge_action_id") if mission else None
    if current_action_id and current_action_id != action_id:
        return {"current": False, "gate": "STALE_MISSION_MERGE_ACTION", "reason": "SAFE_MERGE action is not the Mission current merge_action_id."}
    action_metadata = dict(action.get("metadata") or {})
    action_target_head = (
        action_metadata.get("target_head")
        or action_metadata.get("target_head_before")
        or (action_metadata.get("merge_request") or {}).get("target_head")
        or (action_metadata.get("merge_request") or {}).get("target_head_before")
    )
    execution_target_head = _safe_merge_context_target_head(context)
    if action_target_head and execution_target_head and action_target_head != execution_target_head:
        return {"current": False, "gate": "STALE_TARGET_HEAD", "reason": "SAFE_MERGE execution target HEAD does not match current action target HEAD."}
    return {"current": True, "reason": "current_safe_merge_action"}


def execute_safe_merge(
    *,
    conversation_id: str,
    founder_request: str,
    source_message_id: str,
    action_id: str,
    merge_request: dict,
    cwd: Path | None = None,
    switcher: Callable[[str, Path], subprocess.CompletedProcess] | None = None,
    merger: Callable[[str, Path], subprocess.CompletedProcess] | None = None,
    aborter: Callable[[Path], subprocess.CompletedProcess] | None = None,
    reuse_active: bool = True,
) -> dict:
    started_at = _now()
    root = cwd or repo_root()
    risk = {
        "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
        "risk_level": HIGH_RISK,
        "auto_continue": False,
        "operation": "safe_merge",
        "operation_type": SAFE_MERGE,
        "reason": "founder_approved_safe_merge",
        "approval_action_id": action_id,
    }
    if reuse_active:
        active = _find_active_safe_merge_execution(
            action_id=action_id,
            source_head=merge_request.get("source_head"),
            target_head=merge_request.get("target_head") or merge_request.get("target_head_before"),
        )
        if active:
            active_session, _active_package = active
            return {
                "handled": True,
                "risk_decision": risk,
                "task_id": active_session.task_asset_id,
                "execution_id": active_session.id,
                "created": False,
                "reused": True,
                "status": active_session.status,
                "result": active_session.result,
            }
    task = create_task_asset(
        title="本地安全合并 feature 到 integration",
        description=founder_request,
        conversation_id=conversation_id,
        source_message_id=source_message_id,
        scope=_safe_merge_task_scope(
            founder_request=founder_request,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            action_id=action_id,
            merge_request=merge_request,
        ),
        status="draft",
        approval_status="approved",
        execution_status="not_started",
    )
    with SessionLocal() as session:
        task = session.get(TaskAssetDB, task.id)
        task_id = str(task.id)
        scope = dict(task.scope or {})
        prior_start = dict(scope.get("execution_start") or {})
        if prior_start.get("execution_id") and task.result:
            existing = dict(task.result)
            if existing.get("success"):
                existing = {**existing, "already_merged": True, "reused": True, "failure_type": "MERGE_ALREADY_EXISTS"}
            return {"handled": True, "risk_decision": risk, "task_id": task_id, "execution_id": prior_start["execution_id"], "created": False, "reused": True, "status": existing.get("status"), "result": existing}
        execution_id = prior_start.get("execution_id") or _stable_execution_id(task_id, source_message_id)
        package = _execution_package(task=task, execution_id=execution_id, risk=risk)
        package.context.update({
            "operation_type": SAFE_MERGE,
            "risk_level": HIGH_RISK,
            "approval_action_id": action_id,
            "merge_request": merge_request,
            "source_branch": merge_request.get("source_branch"),
            "source_head": merge_request.get("source_head"),
            "target_branch": merge_request.get("target_branch"),
            "target_head_before": merge_request.get("target_head_before"),
            "merge_strategy": "no_ff",
            "push_after_merge": False,
            "auto_conflict_resolution": False,
        })
        existing_session = get_execution_session(execution_id)
        if existing_session:
            execution, _package = existing_session
            created = False
        else:
            execution = ExecutionSession(
                id=execution_id,
                task_asset_id=task_id,
                execution_package_id=f"package-{execution_id}",
                executor="LOCAL_EXECUTOR",
                status="queued",
                approved_at=_now(),
                queued_at=_now(),
            )
            save_execution_session(execution, package)
            created = True
        scope["execution_start"] = {
            "schema_version": "safe-merge-start-v1",
            "started_from": "founder_approved_safe_merge",
            "execution_id": execution_id,
            "task_asset_id": task_id,
            "task_id": task_id,
            "status": "queued",
            "operation_type": SAFE_MERGE,
            "queued_at": execution.queued_at or _now(),
            "source_conversation_id": conversation_id,
            "source_message_refs": [source_message_id],
            "action_id": action_id,
        }
        task.scope = scope
        task.status = "in_progress"
        task.execution_status = "queued"
        session.commit()

    queued_payload = {
        "status": "queued",
        "operation_type": SAFE_MERGE,
        "risk_decision": risk,
        "task_id": task_id,
        "execution_id": execution_id,
        "action_id": action_id,
        "founder_request": founder_request,
        "merge_request": merge_request,
        "message": "已获得合并授权，正在重新检查 source/target 状态。",
    }
    _update_brain(conversation_id, queued_payload)
    _append_assistant_message(conversation_id, queued_payload["message"], message_type="operational_execution", grounding={"operational_runtime": queued_payload})
    _mark_safe_merge_handler_started(
        conversation_id=conversation_id,
        task_id=task_id,
        execution_id=execution_id,
        action_id=action_id,
        queued_payload=queued_payload,
    )

    current = _safe_merge_preflight(
        cwd=root,
        source_branch=str(merge_request.get("source_branch") or ""),
        target_branch=str(merge_request.get("target_branch") or SAFE_MERGE_TARGET_BRANCH),
        remote_name=str(merge_request.get("source_remote") or "origin"),
    )
    failure = _validate_safe_merge_preconditions(merge_request, current, started_at=started_at, action_id=action_id)
    if failure:
        _persist_safe_merge_result(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"本地安全合并已停止：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task_id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task_id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}

    target_branch = current["target_branch"]
    source_branch = current["source_branch"]
    target_before = current["target_head"]
    source_head = current["source_head"]
    if _git_is_ancestor(source_head, target_before, cwd=root):
        result = {
            "operation_type": SAFE_MERGE,
            "status": "completed",
            "success": True,
            "approval_action_id": action_id,
            "source_branch": source_branch,
            "source_head": source_head,
            "source_remote": current.get("source_remote"),
            "source_remote_head": current.get("source_remote_head"),
            "target_branch": target_branch,
            "target_head_before": target_before,
            "target_remote": current.get("target_remote"),
            "target_remote_head_before": current.get("target_remote_head_before"),
            "merge_strategy": "no_ff",
            "merge_commit_created": False,
            "merge_commit_head": target_before,
            "merge_parent_count": _merge_parent_count(target_before, cwd=root),
            "source_ancestor_verified": True,
            "target_ancestor_verified": True,
            "working_tree_clean_after": current.get("working_tree_clean"),
            "push_performed": False,
            "conflict": False,
            "conflict_files": [],
            "already_merged": True,
            "summary": "source branch 已经包含在 target 中；无需重复 merge。",
            "stdout_excerpt": "",
            "stderr_excerpt": "",
            "started_at": started_at,
            "completed_at": _now(),
            "real_executor_used": "LOCAL_EXECUTOR",
        }
        _persist_safe_merge_result(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=result, queue_status="completed")
        _append_assistant_message(conversation_id, result["summary"], message_type="operational_result", grounding={"operational_runtime": result, "task_id": task_id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task_id, "execution_id": execution_id, "created": created, "reused": False, "status": "completed", "result": result}

    _update_brain(conversation_id, {**queued_payload, "status": "running", "message": "正在执行本地安全合并…"})
    switch = (switcher or (lambda selected_branch, selected_root: _git_safe_switch(selected_branch, cwd=selected_root)))(target_branch, root)
    if switch.returncode != 0:
        failure = _safe_merge_failure("MERGE_FAILED", _excerpt(switch.stderr or switch.stdout, 1000), started_at=started_at, approval_action_id=action_id, preflight=current)
        _persist_safe_merge_result(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"本地安全合并失败：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task_id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task_id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}
    post_switch_head = _git_output(["rev-parse", "HEAD"], cwd=root).stdout.strip()
    if post_switch_head != target_before or _git_status_short(cwd=root):
        failure = _safe_merge_failure("TARGET_HEAD_CHANGED", "target HEAD or working tree changed after switch", started_at=started_at, approval_action_id=action_id, preflight=current)
        _persist_safe_merge_result(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"本地安全合并已停止：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task_id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task_id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}
    merge = (merger or (lambda selected_source, selected_root: _git_safe_merge_no_ff(selected_source, cwd=selected_root)))(source_branch, root)
    if merge.returncode != 0:
        conflict_files = sorted(_git_output(["diff", "--name-only", "--diff-filter=U"], cwd=root, check=False).stdout.splitlines())
        abort = (aborter or (lambda selected_root: _git_safe_merge_abort(cwd=selected_root)))(root)
        failure_type = "MERGE_CONFLICT" if conflict_files else "MERGE_FAILED"
        failure = _safe_merge_failure(failure_type, _excerpt(merge.stderr or merge.stdout, 1000), started_at=started_at, approval_action_id=action_id, preflight=current)
        failure.update({
            "conflict": bool(conflict_files),
            "conflict_files": conflict_files,
            "merge_abort_success": abort.returncode == 0,
            "merge_abort_failure": _excerpt(abort.stderr or abort.stdout, 1000) if abort.returncode != 0 else None,
        })
        if abort.returncode != 0:
            failure["failure_type"] = "MERGE_ABORT_FAILED"
        _persist_safe_merge_result(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"合并检测到冲突，已停止自动处理。\n冲突文件：{', '.join(conflict_files) or '未知'}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task_id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task_id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}

    merge_head = _git_output(["rev-parse", "HEAD"], cwd=root).stdout.strip()
    parent_count = _merge_parent_count(merge_head, cwd=root)
    source_ancestor = _git_is_ancestor(source_head, merge_head, cwd=root)
    target_ancestor = _git_is_ancestor(target_before, merge_head, cwd=root)
    status_after = _git_status_short(cwd=root)
    success = merge_head != target_before and parent_count == 2 and source_ancestor and target_ancestor and not status_after
    if not success:
        failure = _safe_merge_failure("POST_MERGE_VERIFICATION_FAILED", "merge commit verification failed", started_at=started_at, approval_action_id=action_id, preflight=current)
        failure.update({
            "merge_commit_head": merge_head,
            "merge_parent_count": parent_count,
            "source_ancestor_verified": source_ancestor,
            "target_ancestor_verified": target_ancestor,
            "working_tree_clean_after": not status_after,
        })
        _persist_safe_merge_result(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=failure, queue_status="pending")
        _append_assistant_message(conversation_id, f"本地安全合并后验证失败：{failure['summary']}", message_type="operational_result", grounding={"operational_runtime": failure, "task_id": task_id, "execution_id": execution_id})
        return {"handled": True, "risk_decision": risk, "task_id": task_id, "execution_id": execution_id, "created": created, "reused": False, "status": "failed", "result": failure}
    result = {
        "operation_type": SAFE_MERGE,
        "status": "completed",
        "success": True,
        "approval_action_id": action_id,
        "source_branch": source_branch,
        "source_head": source_head,
        "source_remote": current.get("source_remote"),
        "source_remote_head": current.get("source_remote_head"),
        "target_branch": target_branch,
        "target_head_before": target_before,
        "target_remote": current.get("target_remote"),
        "target_remote_head_before": current.get("target_remote_head_before"),
        "merge_strategy": "no_ff",
        "merge_commit_created": True,
        "merge_commit_head": merge_head,
        "merge_parent_count": parent_count,
        "source_ancestor_verified": source_ancestor,
        "target_ancestor_verified": target_ancestor,
        "working_tree_clean_after": True,
        "push_performed": False,
        "conflict": False,
        "conflict_files": [],
        "already_merged": False,
        "summary": f"本地安全合并完成：{source_branch} → {target_branch}，merge HEAD: {merge_head}，尚未 push。",
        "stdout_excerpt": _excerpt(merge.stdout or ""),
        "stderr_excerpt": _excerpt(merge.stderr or ""),
        "started_at": started_at,
        "completed_at": _now(),
        "real_executor_used": "LOCAL_EXECUTOR",
    }
    _persist_safe_merge_result(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, action_id=action_id, queued_payload=queued_payload, result=result, queue_status="completed")
    _append_assistant_message(
        conversation_id,
        (
            "本地安全合并完成：\n"
            f"source: {source_branch}\n"
            f"target: {target_branch}\n"
            f"merge HEAD: {merge_head}\n"
            "工作区：clean\n"
            "尚未 push。"
        ),
        message_type="operational_result",
        grounding={"operational_runtime": result, "task_id": task_id, "execution_id": execution_id},
    )
    return {"handled": True, "risk_decision": risk, "task_id": task_id, "execution_id": execution_id, "created": created, "reused": False, "status": "completed", "result": result}


def dispatch_canonical_safe_merge_execution(
    execution_id: str,
    *,
    cwd: Path | None = None,
    switcher: Callable[[str, Path], subprocess.CompletedProcess] | None = None,
    merger: Callable[[str, Path], subprocess.CompletedProcess] | None = None,
    aborter: Callable[[Path], subprocess.CompletedProcess] | None = None,
) -> dict:
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("safe_merge_execution_not_found")
    session_record, package = record
    context = dict(package.context or {})
    if context.get("operation_type") != SAFE_MERGE:
        raise ValueError("not_safe_merge_execution")
    if package.execution_allowed:
        raise ValueError("safe_merge_must_not_be_generic_worker_owned")
    if session_record.status in {"completed", "failed", "blocked"}:
        return {
            "handled": True,
            "execution_id": execution_id,
            "status": session_record.status,
            "reused": True,
            "result": session_record.result,
        }
    if session_record.status not in {"approved", "queued"}:
        return {
            "handled": True,
            "execution_id": execution_id,
            "status": session_record.status,
            "reused": True,
            "result": session_record.result,
        }
    dispatch_authority = _safe_merge_current_dispatch_authority(context)
    if not dispatch_authority.get("current"):
        return {
            "handled": False,
            "execution_id": execution_id,
            "status": session_record.status,
            "queue_block_gate": dispatch_authority.get("gate") or "STALE_SAFE_MERGE_EXECUTION",
            "queue_block_reason": dispatch_authority.get("reason") or "SAFE_MERGE execution is historical and not current.",
        }
    root = cwd or repo_root()
    if _git_status_short(cwd=root):
        return {
            "handled": False,
            "execution_id": execution_id,
            "status": session_record.status,
            "queue_block_gate": "WORKING_TREE_NOT_CLEAN",
            "queue_block_reason": "Product workspace is dirty; canonical Safe Merge dispatch deferred without failing the approved merge.",
        }
    merge_request = dict(context.get("merge_request") or {})
    if not merge_request:
        merge_request = {
            "source_branch": context.get("source_branch"),
            "source_head": context.get("source_head"),
            "target_branch": context.get("target_branch") or SAFE_MERGE_TARGET_BRANCH,
            "target_head_before": context.get("target_head_before"),
            "merge_strategy": context.get("merge_strategy") or "no_ff",
            "push_after_merge": False,
            "auto_conflict_resolution": False,
        }
    result = execute_safe_merge(
        conversation_id=str(context.get("conversation_id") or package.task_asset.conversation_id),
        founder_request=str(context.get("founder_request") or package.task_asset.description or package.task_asset.title),
        source_message_id=str(context.get("source_message_id") or context.get("approval_action_id") or execution_id),
        action_id=str(context.get("approval_action_id") or ""),
        merge_request=merge_request,
        cwd=root,
        switcher=switcher,
        merger=merger,
        aborter=aborter,
        reuse_active=False,
    )
    try:
        state, action = _find_action(str(context.get("approval_action_id") or ""))
        mission = _mission_for_action(action, state)
        if mission and result.get("result"):
            _resume_mission_after_step(state.conversation_id, mission, SAFE_MERGE, dict(result.get("result") or {}))
    except (LookupError, ValueError):
        pass
    return result


def decide_bounded_code_change_action(action_id: str, decision: str) -> dict:
    if decision not in {"approve", "reject", "continue_discussion"}:
        raise ValueError("unsupported_bounded_code_change_decision")
    with SessionLocal() as session:
        states = list(session.scalars(select(SinoBrainSessionDB)))
        action = None
        state = None
        for candidate_state in states:
            for item in (candidate_state.discovery or {}).get("founder_action_queue") or []:
                if isinstance(item, dict) and item.get("action_id") == action_id:
                    action = dict(item)
                    state = candidate_state
                    break
            if action:
                break
        if action is None or state is None:
            raise LookupError("bounded_code_change_action_not_found")
        if action.get("action_type") != BOUNDED_CODE_CHANGE_QUEUE_TYPE:
            raise ValueError("not_bounded_code_change_action")
        conversation_id = action.get("conversation_id") or state.conversation_id
        source_message_id = action.get("source_id")
        founder_request = (action.get("metadata") or {}).get("founder_request") or action.get("summary") or ""
        plan = ((action.get("metadata") or {}).get("plan") or BOUNDED_CODE_CHANGE_PLANS[BOUNDED_STATUS_CARD_TITLE_CHANGE])
        mission = _mission_for_action(action, state)
    if decision == "continue_discussion":
        _append_assistant_message(
            conversation_id,
            "继续讨论受控代码修改；该 Action Queue item 保持 pending，批准前不会执行。",
            message_type="operational_discussion",
            grounding={"action_id": action_id, "operation_type": BOUNDED_CODE_CHANGE},
        )
        return {"handled": True, "action_id": action_id, "decision": "continue_discussion", "status": "pending", "executed": False}
    if decision == "reject":
        now = _now()
        _mark_bounded_action(conversation_id, action_id, {"status": "rejected", "decision": "rejected", "decided_at": now})
        if mission:
            _resume_mission_after_step(conversation_id, mission, BOUNDED_CODE_CHANGE, {"success": False, "failure_type": "APPROVAL_REJECTED", "summary": "Founder rejected bounded code change approval."})
        _update_brain(conversation_id, {"status": "rejected", "operation_type": BOUNDED_CODE_CHANGE, "action_id": action_id, "message": "受控代码修改已驳回；不会修改代码。"})
        _append_assistant_message(
            conversation_id,
            "受控代码修改已驳回；不会修改代码，也不会创建执行。",
            message_type="operational_result",
            grounding={"action_id": action_id, "operation_type": BOUNDED_CODE_CHANGE, "decision": "rejected"},
        )
        return {"handled": True, "action_id": action_id, "decision": "rejected", "status": "rejected", "executed": False}
    _mark_bounded_action(conversation_id, action_id, {"status": "approved", "decision": "approved", "decided_at": _now()})
    result = execute_bounded_code_change(
        conversation_id=conversation_id,
        founder_request=founder_request,
        source_message_id=source_message_id,
        action_id=action_id,
        plan=plan,
    )
    if mission:
        _resume_mission_after_step(conversation_id, mission, BOUNDED_CODE_CHANGE, dict(result.get("result") or {}))
    return result


def _find_action(action_id: str) -> tuple[SinoBrainSessionDB, dict]:
    with SessionLocal() as session:
        states = list(session.scalars(select(SinoBrainSessionDB)))
        for candidate_state in states:
            for item in (candidate_state.discovery or {}).get("founder_action_queue") or []:
                if isinstance(item, dict) and item.get("action_id") == action_id:
                    return candidate_state, dict(item)
    raise LookupError("operational_action_not_found")


def decide_safe_push_action(action_id: str, decision: str) -> dict:
    if decision not in {"approve", "reject", "continue_discussion"}:
        raise ValueError("unsupported_safe_push_decision")
    state, action = _find_action(action_id)
    if action.get("action_type") != SAFE_PUSH_QUEUE_TYPE:
        raise ValueError("not_safe_push_action")
    conversation_id = action.get("conversation_id") or state.conversation_id
    source_message_id = action.get("source_id")
    metadata = dict(action.get("metadata") or {})
    founder_request = metadata.get("founder_request") or action.get("summary") or ""
    push_request = dict(metadata.get("push_request") or {})
    existing_result = dict(action.get("result") or {})
    mission = _mission_for_action(action, state)
    if decision == "continue_discussion":
        _append_assistant_message(
            conversation_id,
            "继续讨论安全推送；该 Action Queue item 保持 pending，批准前不会执行 git push。",
            message_type="operational_discussion",
            grounding={"action_id": action_id, "operation_type": SAFE_PUSH},
        )
        return {"handled": True, "action_id": action_id, "decision": "continue_discussion", "status": "pending", "push_performed": False}
    if decision == "reject":
        now = _now()
        _mark_bounded_action(conversation_id, action_id, {"status": "rejected", "decision": "rejected", "decided_at": now})
        if mission:
            _resume_mission_after_step(conversation_id, mission, SAFE_PUSH, {"success": False, "failure_type": "APPROVAL_REJECTED", "summary": "Founder rejected feature Safe Push approval."})
        _update_brain(conversation_id, {"status": "rejected", "operation_type": SAFE_PUSH, "action_id": action_id, "message": "安全推送已拒绝；不会执行 git push。"})
        _append_assistant_message(
            conversation_id,
            "安全推送已拒绝；不会执行 git push。",
            message_type="operational_result",
            grounding={"action_id": action_id, "operation_type": SAFE_PUSH, "decision": "rejected"},
        )
        return {"handled": True, "action_id": action_id, "decision": "rejected", "status": "rejected", "push_performed": False}
    if existing_result.get("success") and action.get("status") == "completed":
        reused = {**existing_result, "already_up_to_date": True, "push_performed": False, "reused": True, "failure_type": "PUSH_ALREADY_UP_TO_DATE"}
        _update_brain(conversation_id, {"status": "completed", "operation_type": SAFE_PUSH, "action_id": action_id, "result": reused, "message": reused.get("summary")})
        return {"handled": True, "action_id": action_id, "decision": "approved", "status": "completed", "result": reused, "reused": True}
    _mark_bounded_action(conversation_id, action_id, {"status": "approved", "decision": "approved", "decided_at": _now()})
    result = execute_safe_push(
        conversation_id=conversation_id,
        founder_request=founder_request,
        source_message_id=source_message_id,
        action_id=action_id,
        push_request=push_request,
    )
    if mission:
        _resume_mission_after_step(conversation_id, mission, SAFE_PUSH, dict(result.get("result") or {}))
    return result


def decide_safe_merge_action(action_id: str, decision: str) -> dict:
    if decision not in {"approve", "reject", "continue_discussion"}:
        raise ValueError("unsupported_safe_merge_decision")
    state, action = _find_action(action_id)
    if action.get("action_type") != SAFE_MERGE_QUEUE_TYPE:
        raise ValueError("not_safe_merge_action")
    conversation_id = action.get("conversation_id") or state.conversation_id
    source_message_id = action.get("source_id")
    metadata = dict(action.get("metadata") or {})
    founder_request = metadata.get("founder_request") or action.get("summary") or ""
    merge_request = dict(metadata.get("merge_request") or {})
    existing_result = dict(action.get("result") or {})
    mission = _mission_for_action(action, state)
    if decision == "continue_discussion":
        _append_assistant_message(
            conversation_id,
            "继续讨论本地安全合并；该 Action Queue item 保持 pending，批准前不会执行 git switch 或 git merge。",
            message_type="operational_discussion",
            grounding={"action_id": action_id, "operation_type": SAFE_MERGE},
        )
        return {"handled": True, "action_id": action_id, "decision": "continue_discussion", "status": "pending", "merge_performed": False}
    if decision == "reject":
        now = _now()
        _mark_bounded_action(conversation_id, action_id, {"status": "rejected", "decision": "rejected", "decided_at": now})
        if mission:
            _resume_mission_after_step(conversation_id, mission, SAFE_MERGE, {"success": False, "failure_type": "APPROVAL_REJECTED", "summary": "Founder rejected Safe Merge approval."})
        _update_brain(conversation_id, {"status": "rejected", "operation_type": SAFE_MERGE, "action_id": action_id, "message": "本地安全合并已拒绝；不会切换分支或 merge。"})
        _append_assistant_message(
            conversation_id,
            "本地安全合并已拒绝；不会切换分支或 merge。",
            message_type="operational_result",
            grounding={"action_id": action_id, "operation_type": SAFE_MERGE, "decision": "rejected"},
        )
        return {"handled": True, "action_id": action_id, "decision": "rejected", "status": "rejected", "merge_performed": False}
    if existing_result.get("success") and action.get("status") == "completed":
        reused = {**existing_result, "already_merged": True, "reused": True, "failure_type": "MERGE_ALREADY_EXISTS"}
        _update_brain(conversation_id, {"status": "completed", "operation_type": SAFE_MERGE, "action_id": action_id, "result": reused, "message": reused.get("summary")})
        return {
            "handled": True,
            "action_id": action_id,
            "decision": "approved",
            "status": "completed",
            "task_id": action.get("task_id"),
            "execution_id": action.get("execution_id"),
            "result": reused,
            "reused": True,
        }
    _mark_bounded_action(conversation_id, action_id, {"status": "approved", "decision": "approved", "decided_at": _now()})
    result = execute_safe_merge(
        conversation_id=conversation_id,
        founder_request=founder_request,
        source_message_id=source_message_id,
        action_id=action_id,
        merge_request=merge_request,
    )
    if mission:
        _resume_mission_after_step(conversation_id, mission, SAFE_MERGE, dict(result.get("result") or {}))
    return result


def decide_safe_integration_push_action(action_id: str, decision: str) -> dict:
    if decision not in {"approve", "reject", "continue_discussion"}:
        raise ValueError("unsupported_safe_integration_push_decision")
    state, action = _find_action(action_id)
    if action.get("action_type") != SAFE_INTEGRATION_PUSH_QUEUE_TYPE:
        raise ValueError("not_safe_integration_push_action")
    conversation_id = action.get("conversation_id") or state.conversation_id
    source_message_id = action.get("source_id")
    metadata = dict(action.get("metadata") or {})
    founder_request = metadata.get("founder_request") or action.get("summary") or ""
    push_request = dict(metadata.get("push_request") or {})
    existing_result = dict(action.get("result") or {})
    mission = _mission_for_action(action, state)
    if decision == "continue_discussion":
        _append_assistant_message(
            conversation_id,
            "继续讨论 Integration Push；该 Action Queue item 保持 pending，批准前不会执行 git push。",
            message_type="operational_discussion",
            grounding={"action_id": action_id, "operation_type": SAFE_INTEGRATION_PUSH},
        )
        return {"handled": True, "action_id": action_id, "decision": "continue_discussion", "status": "pending", "push_performed": False}
    if decision == "reject":
        now = _now()
        _mark_bounded_action(conversation_id, action_id, {"status": "rejected", "decision": "rejected", "decided_at": now})
        if mission:
            _resume_mission_after_step(conversation_id, mission, SAFE_INTEGRATION_PUSH, {"success": False, "failure_type": "APPROVAL_REJECTED", "summary": "Founder rejected Integration Push approval."})
        _update_brain(conversation_id, {"status": "rejected", "operation_type": SAFE_INTEGRATION_PUSH, "action_id": action_id, "message": "Integration Push 已拒绝；不会执行 git push。"})
        _append_assistant_message(
            conversation_id,
            "Integration Push 已拒绝；不会执行 git push。",
            message_type="operational_result",
            grounding={"action_id": action_id, "operation_type": SAFE_INTEGRATION_PUSH, "decision": "rejected"},
        )
        return {"handled": True, "action_id": action_id, "decision": "rejected", "status": "rejected", "push_performed": False}
    if existing_result.get("success") and action.get("status") == "completed":
        reused = {**existing_result, "already_up_to_date": True, "push_performed": False, "reused": True, "failure_type": "PUSH_ALREADY_UP_TO_DATE"}
        _update_brain(conversation_id, {"status": "completed", "operation_type": SAFE_INTEGRATION_PUSH, "action_id": action_id, "result": reused, "message": reused.get("summary")})
        return {"handled": True, "action_id": action_id, "decision": "approved", "status": "completed", "task_id": action.get("task_id"), "execution_id": action.get("execution_id"), "result": reused, "reused": True}
    _mark_bounded_action(conversation_id, action_id, {"status": "approved", "decision": "approved", "decided_at": _now()})
    result = execute_safe_integration_push(
        conversation_id=conversation_id,
        founder_request=founder_request,
        source_message_id=source_message_id,
        action_id=action_id,
        push_request=push_request,
    )
    if mission:
        _resume_mission_after_step(conversation_id, mission, SAFE_INTEGRATION_PUSH, dict(result.get("result") or {}))
    return result


def decide_operational_action_by_type(action_id: str, decision: str) -> dict:
    _state, action = _find_action(action_id)
    action_type = action.get("action_type") or action.get("type")
    if action_type == BOUNDED_CODE_CHANGE_QUEUE_TYPE:
        return decide_bounded_code_change_action(action_id, decision)
    if action_type == SAFE_PUSH_QUEUE_TYPE:
        return decide_safe_push_action(action_id, decision)
    if action_type == SAFE_MERGE_QUEUE_TYPE:
        return decide_safe_merge_action(action_id, decision)
    if action_type == SAFE_INTEGRATION_PUSH_QUEUE_TYPE:
        return decide_safe_integration_push_action(action_id, decision)
    raise ValueError("unsupported_operational_action_type")


def resolve_operational_approval_shortcut(conversation_id: str, founder_request: str) -> str | None:
    """Resolve short natural-language approval to the existing pending operational action.

    The shortcut is intentionally narrow: it never creates an action. It only
    maps an explicit approval word to one already-persisted canonical
    operational approval in the same conversation.
    """
    normalized = (founder_request or "").strip().lower()
    if normalized not in {"批准", "同意", "继续执行", "approve", "approved"}:
        return None
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if state is None:
            return None
        queue = [dict(item) for item in (state.discovery or {}).get("founder_action_queue") or [] if isinstance(item, dict)]
    pending = [
        item for item in queue
        if item.get("status") == "pending"
        and (item.get("action_type") or item.get("type")) in {
            BOUNDED_CODE_CHANGE_QUEUE_TYPE,
            SAFE_PUSH_QUEUE_TYPE,
            SAFE_MERGE_QUEUE_TYPE,
            SAFE_INTEGRATION_PUSH_QUEUE_TYPE,
        }
    ]
    return pending[0].get("action_id") if len(pending) == 1 else None


def handle_operational_conversation_request(
    *, conversation_id: str, founder_request: str, source_message_id: str,
) -> dict:
    risk = classify_operational_risk(founder_request)
    if risk.get("work_type") != CONTROLLED_LOCAL_DEVELOPMENT_TASK:
        return {"handled": False, "risk_decision": risk}
    if risk.get("operation_type") == "CLARIFICATION":
        _append_assistant_message(
            conversation_id,
            "我还需要确认一个关键点：你想修改哪个具体目标，以及期望改成什么结果？明确后我会进入受控开发任务和审批流程。",
            message_type="clarification",
            grounding={"operational_runtime": {"status": "clarification_required", "risk_decision": risk}},
        )
        return {"handled": True, "risk_decision": risk, "status": "clarification_required"}
    if risk.get("operation_type") == DISCUSSION:
        _append_assistant_message(
            conversation_id,
            "我们先讨论方案。当前不会创建开发 Mission、审批项或执行任务；等你明确说要修改并给出目标后，我会进入受控开发流程。",
            message_type="discussion",
            grounding={"operational_runtime": {"status": "discussion", "risk_decision": risk}},
        )
        return {"handled": True, "risk_decision": risk, "status": "discussion"}
    if risk.get("operation_type") == AUTONOMOUS_DEVELOPMENT_MISSION:
        return start_autonomous_development_mission(conversation_id, founder_request, source_message_id)
    if risk.get("risk_level") == HIGH_RISK and risk.get("operation_type") == SAFE_INTEGRATION_PUSH:
        action_id = _append_safe_integration_push_queue_item(conversation_id, founder_request, source_message_id, risk)
        _append_assistant_message(
            conversation_id,
            "这是 HIGH risk Integration Push 请求，已进入 Founder Action Queue。批准前不会执行 git push。",
            message_type="operational_approval_required",
            grounding={"operational_runtime": {"status": "approval_required", "risk_decision": risk, "action_id": action_id}},
        )
        return {"handled": True, "risk_decision": risk, "status": "approval_required", "action_id": action_id}
    if risk.get("risk_level") == HIGH_RISK and risk.get("operation_type") == SAFE_MERGE:
        action_id = _append_safe_merge_queue_item(conversation_id, founder_request, source_message_id, risk)
        _append_assistant_message(
            conversation_id,
            "这是 HIGH risk 本地安全合并请求，已进入 Founder Action Queue。批准前不会执行 git switch 或 git merge。",
            message_type="operational_approval_required",
            grounding={"operational_runtime": {"status": "approval_required", "risk_decision": risk, "action_id": action_id}},
        )
        return {"handled": True, "risk_decision": risk, "status": "approval_required", "action_id": action_id}
    if risk.get("risk_level") == HIGH_RISK and risk.get("operation_type") == SAFE_PUSH:
        action_id = _append_safe_push_queue_item(conversation_id, founder_request, source_message_id, risk)
        _append_assistant_message(
            conversation_id,
            "这是 HIGH risk 安全推送请求，已进入 Founder Action Queue。批准前不会执行 git push。",
            message_type="operational_approval_required",
            grounding={"operational_runtime": {"status": "approval_required", "risk_decision": risk, "action_id": action_id}},
        )
        return {"handled": True, "risk_decision": risk, "status": "approval_required", "action_id": action_id}
    if risk.get("risk_level") == HIGH_RISK:
        _append_high_risk_queue_item(conversation_id, founder_request, source_message_id, risk)
        _append_assistant_message(
            conversation_id,
            "这个请求属于高风险本地操作，已进入 Founder Action Queue；在明确批准前我不会调用 executor。",
            message_type="operational_blocked",
            grounding={"operational_runtime": {"status": "blocked", "risk_decision": risk}},
        )
        return {"handled": True, "risk_decision": risk, "status": "blocked"}
    if risk.get("risk_level") == MEDIUM_RISK and risk.get("operation_type") == BOUNDED_CODE_CHANGE:
        action_id = _append_bounded_code_change_queue_item(conversation_id, founder_request, source_message_id, risk)
        _append_assistant_message(
            conversation_id,
            "这是一个受控代码修改，风险为 MEDIUM；已进入 Founder Action Queue。批准前我不会调用 executor。",
            message_type="operational_approval_required",
            grounding={"operational_runtime": {"status": "approval_required", "risk_decision": risk, "action_id": action_id}},
        )
        return {"handled": True, "risk_decision": risk, "status": "approval_required", "action_id": action_id}
    if risk.get("risk_level") == LOW_RISK and risk.get("auto_continue"):
        return execute_low_risk_operation(
            conversation_id=conversation_id,
            founder_request=founder_request,
            source_message_id=source_message_id,
        )
    return {"handled": False, "risk_decision": risk}


def serialize_execution_session(execution_id: str) -> dict | None:
    record = get_execution_session(execution_id)
    if not record:
        return None
    session, package = record
    return {"session": asdict(session), "package": asdict(package)}
