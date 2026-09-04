"""Build the bounded task document transported to the Codex CLI."""

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Iterable, Mapping
from uuid import uuid4

from .orchestrator import ExecutionPackage


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _items(value: Any) -> list[Any]:
    return list(value) if isinstance(value, (list, tuple)) else []


def _unique_dicts(items: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    unique = []
    seen = set()
    for item in items:
        normalized = {key: value for key, value in item.items() if value not in (None, "", [], {})}
        marker = json.dumps(normalized, ensure_ascii=False, sort_keys=True, default=str)
        if marker not in seen:
            seen.add(marker)
            unique.append(normalized)
    return unique


@dataclass(frozen=True, slots=True)
class TaskPackage:
    goal: str
    task_mode: str
    evidence: list[dict[str, Any]]
    relevant_files: list[dict[str, Any]]
    constraints: list[str]
    acceptance_criteria: list[str]
    expected_mutations: list[dict[str, Any]]
    commit_requirement: str
    approval_required: bool

    def render(self) -> str:
        return (
            "# Sino Founder AI Task Package\n\n"
            f"## Goal\n{self.goal}\n\n"
            f"## Execution Mode\n{self.task_mode}\n\n"
            f"## Evidence\n{json.dumps(self.evidence, ensure_ascii=False, indent=2, default=str)}\n\n"
            f"## Relevant Files\n{json.dumps(self.relevant_files, ensure_ascii=False, indent=2, default=str)}\n\n"
            f"## Constraints\n{json.dumps(self.constraints, ensure_ascii=False, indent=2)}\n\n"
            f"## Expected Mutations\n{json.dumps(self.expected_mutations, ensure_ascii=False, indent=2, default=str)}\n\n"
            f"## Acceptance Criteria\n{json.dumps(self.acceptance_criteria, ensure_ascii=False, indent=2)}\n\n"
            "## Scope Verification\n"
            "Before running tests or build, compare the task-owned changed files and hunks with the Goal, semantic module boundary, Relevant Files and Constraints. "
            "If a change belongs to another capability or previous task, stop and return SCOPE_MISMATCH; do not treat passing tests as task completion.\n\n"
            "## Authorization\n"
            + ("Founder approval is granted. " if self.approval_required else "This bounded technical lane does not require a Founder decision. ")
            + "Execute only the frozen scope and run the acceptance criteria. Local reads, scoped patches, tests, builds, localhost verification and a verified local checkpoint are authorized by Sino. External APIs, credentials, cost, production writes, destructive Git, system security changes and unrelated paths are forbidden unless an exact Founder authorization is attached.\n\n"
            f"## Commit Requirement\n{self.commit_requirement}\n"
        )


class TaskPackageBuilder:
    """Extract execution evidence without transporting the full Founder context."""

    def build(self, package: ExecutionPackage) -> TaskPackage:
        context = _mapping(package.context)
        standard_contract = _mapping(context.get("standard_task_contract"))
        reasoning = _mapping(context.get("reasoning"))
        evidence_source = reasoning.get("evidence", context.get("evidence", []))
        evidence = []
        relevant_files = []

        if standard_contract:
            evidence.append({
                "source": "standard_task_contract",
                "fact": standard_contract,
                "relevance": "Canonical target, scope and visible-artifact acceptance contract for this execution",
            })

        reuse_context = _mapping(standard_contract.get("reuse_context") or context.get("reuse_context"))
        if reuse_context:
            evidence.append({
                "source": f"reusable_asset:{reuse_context.get('reuse_asset_id', '')}",
                "fact": reuse_context,
                "relevance": "Advisory implementation and verification guidance; never scope, risk, or completion authority",
            })

        decision_context = _mapping(standard_contract.get("decision_context") or context.get("decision_context"))
        if decision_context:
            evidence.append({
                "source": f"decision_strategy:{decision_context.get('decision_asset_id', '')}",
                "fact": decision_context,
                "relevance": "Advisory interaction-surface recommendation; never scope, risk, approval, or completion authority",
            })

        playbook_context = _mapping(standard_contract.get("playbook_context") or context.get("playbook_context"))
        if playbook_context:
            evidence.append({
                "source": f"execution_playbook:{playbook_context.get('playbook_id', '')}",
                "fact": playbook_context,
                "relevance": (
                    "Task-specific advisory composition of Decision, Pattern, current constraints and verification; "
                    "never scope, risk, approval, completion, or verification-override authority"
                ),
            })

        for reference in _items(context.get("intelligence_references")):
            item = _mapping(reference)
            evidence.append({
                "source": f"{item.get('source_type', 'library')}:{item.get('source_id', '')}",
                "fact": item.get("summary") or item.get("content") or item.get("content_ref") or item.get("title"),
                "relevance": item.get("note") or f"Referenced by {item.get('target_type', 'context')}",
            })

        for raw_item in _items(evidence_source):
            item = _mapping(raw_item)
            evidence.append(
                {
                    key: item[key]
                    for key in ("source", "fact", "relevance")
                    if item.get(key) not in (None, "")
                }
            )
            metadata = _mapping(item.get("metadata"))
            relevant_files.extend(self._normalize_files(metadata.get("relevant_files")))

        for owner in (context, reasoning, _mapping(context.get("repository_context")), _mapping(context.get("code_context"))):
            relevant_files.extend(self._normalize_files(owner.get("relevant_files")))

        if context.get("operation_type") == "BOUNDED_CODE_CHANGE":
            evidence.append({
                "source": "sino_bounded_code_change_package",
                "fact": {
                    "mission_id": context.get("mission_id"),
                    "conversation_id": context.get("conversation_id"),
                    "task_id": context.get("task_id"),
                    "execution_id": context.get("execution_id"),
                    "repo_path": context.get("repo_path"),
                    "working_branch": context.get("working_branch"),
                    "baseline_head": context.get("baseline_head"),
                    "allowed_files": list(context.get("allowed_files") or []),
                    "allowed_directories": list(context.get("allowed_directories") or []),
                    "acceptance_criteria": list(context.get("acceptance_criteria") or []),
                    "verification_plan": list(context.get("verification_plan") or []),
                    "explicit_non_goals": list(context.get("explicit_non_goals") or []),
                    "codex_executor_policy": _mapping(context.get("codex_executor_policy")),
                },
                "relevance": "Canonical Sino package for the approved bounded code change. The allowed boundary and prohibitions are mandatory.",
            })
            relevant_files.extend(self._normalize_files(context.get("allowed_files")))

        return TaskPackage(
            goal=package.goal,
            task_mode=str(context.get("task_mode") or "TECHNICAL_EXECUTION"),
            evidence=_unique_dicts(item for item in evidence if item),
            relevant_files=_unique_dicts(relevant_files),
            constraints=[str(item) for item in package.constraints],
            acceptance_criteria=[str(item) for item in package.verification],
            expected_mutations=[dict(item) for item in _items(context.get("expected_mutations")) if isinstance(item, Mapping)],
            commit_requirement=package.commit_requirement,
            approval_required=package.approval_required,
        )

    @staticmethod
    def _normalize_files(value: Any) -> list[dict[str, Any]]:
        files = []
        for raw_item in _items(value):
            if isinstance(raw_item, str):
                files.append({"path": raw_item})
                continue
            item = _mapping(raw_item)
            normalized = {
                key: item[key]
                for key in ("path", "reason", "match_context")
                if item.get(key) not in (None, "")
            }
            if normalized:
                files.append(normalized)
        return files

    def write(self, package: ExecutionPackage, workspace: Path) -> Path:
        workspace.mkdir(parents=True, exist_ok=True)
        task_path = workspace / f"task-package-{uuid4().hex}.md"
        task_path.write_text(self.build(package).render(), encoding="utf-8")
        return task_path
