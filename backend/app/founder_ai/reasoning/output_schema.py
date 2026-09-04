from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class Analysis:
    interpretation: str
    current_state: str
    desired_outcome: str
    gap: str


@dataclass(frozen=True, slots=True)
class Evidence:
    source: str
    fact: str
    relevance: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Solution:
    summary: str
    approach: list[str]
    architecture_impact: str


@dataclass(frozen=True, slots=True)
class Risk:
    level: str
    items: list[str]
    mitigation: list[str]


@dataclass(frozen=True, slots=True)
class ReasoningTask:
    title: str
    reason: str
    priority: int
    dependencies: list[str] = field(default_factory=list)
    approval_required: bool = True


@dataclass(frozen=True, slots=True)
class ExecutionRequirement:
    executor: str
    approval_required: bool
    constraints: list[str]
    verification: list[str]
    recommendation: str


@dataclass(frozen=True, slots=True)
class ReasoningOutput:
    analysis: Analysis
    evidence: list[Evidence]
    solution: Solution
    risk: Risk
    task_plan: list[ReasoningTask]
    execution_requirement: ExecutionRequirement
    provider: str
    model: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
