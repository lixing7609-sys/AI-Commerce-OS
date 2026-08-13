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
    evidence: list[dict[str, Any]]
    relevant_files: list[dict[str, Any]]
    constraints: list[str]
    acceptance_criteria: list[str]
    commit_requirement: str

    def render(self) -> str:
        return (
            "# Sino Founder AI Task Package\n\n"
            f"## Goal\n{self.goal}\n\n"
            f"## Evidence\n{json.dumps(self.evidence, ensure_ascii=False, indent=2, default=str)}\n\n"
            f"## Relevant Files\n{json.dumps(self.relevant_files, ensure_ascii=False, indent=2, default=str)}\n\n"
            f"## Constraints\n{json.dumps(self.constraints, ensure_ascii=False, indent=2)}\n\n"
            f"## Acceptance Criteria\n{json.dumps(self.acceptance_criteria, ensure_ascii=False, indent=2)}\n\n"
            "## Approval\nFounder approval is granted. Execute the bounded task and run the acceptance criteria.\n\n"
            f"## Commit Requirement\n{self.commit_requirement}\n"
        )


class TaskPackageBuilder:
    """Extract execution evidence without transporting the full Founder context."""

    def build(self, package: ExecutionPackage) -> TaskPackage:
        context = _mapping(package.context)
        reasoning = _mapping(context.get("reasoning"))
        evidence_source = reasoning.get("evidence", context.get("evidence", []))
        evidence = []
        relevant_files = []

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

        return TaskPackage(
            goal=package.goal,
            evidence=_unique_dicts(item for item in evidence if item),
            relevant_files=_unique_dicts(relevant_files),
            constraints=[str(item) for item in package.constraints],
            acceptance_criteria=[str(item) for item in package.verification],
            commit_requirement=package.commit_requirement,
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
