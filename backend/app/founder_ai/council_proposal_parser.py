"""Defensive parsing for public Council proposals.

Provider transport success and proposal formatting are separate concerns.  This
module never sees credentials and never logs raw provider content.
"""

from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass
from typing import Any


PROPOSAL_FIELDS = (
    "core_judgment",
    "key_reasons",
    "recommendation",
    "risks",
    "objections",
    "founder_next_step",
)
LIST_FIELDS = frozenset({"key_reasons", "risks", "objections"})
READABLE_KEYS = ("content", "text", "message", "title", "description", "reason", "value", "name")


class ProposalParseError(Exception):
    error_type = "proposal_parse_failed"

    def __init__(self, reason: str = "unrecoverable_content"):
        self.reason = reason
        super().__init__(self.error_type)


@dataclass(frozen=True)
class ParsedCouncilProposal:
    proposal: dict[str, Any]
    metadata: dict[str, Any]


def _display_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, (list, tuple, set)):
        return "；".join(part for item in value if (part := _display_text(item)))
    if isinstance(value, dict):
        for key in READABLE_KEYS:
            if key in value and (text := _display_text(value[key])):
                return text
        return "；".join(f"{key}：{text}" for key, item in value.items() if (text := _display_text(item)))
    return str(value).strip()


def _text_list(value: Any) -> list[str]:
    if value is None:
        return []
    values = value if isinstance(value, (list, tuple, set)) else [value]
    return list(dict.fromkeys(text for item in values if (text := _display_text(item))))


def _strip_fences(content: str) -> tuple[str, bool]:
    text = content.strip().lstrip("\ufeff")
    fenced = re.search(r"```(?:json|JSON)?\s*([\s\S]*?)```", text)
    if fenced:
        return fenced.group(1).strip(), True
    if text.startswith("```"):
        return re.sub(r"^```(?:json|JSON)?\s*|\s*```$", "", text).strip(), True
    return text, False


def _balanced_object(text: str) -> str | None:
    """Return the first balanced JSON object while respecting quoted braces."""
    start = text.find("{")
    if start < 0:
        return None
    depth, quoted, escaped = 0, False, False
    for index in range(start, len(text)):
        char = text[index]
        if escaped:
            escaped = False
            continue
        if char == "\\" and quoted:
            escaped = True
        elif char == '"':
            quoted = not quoted
        elif not quoted and char == "{":
            depth += 1
        elif not quoted and char == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    return None


def _loads_candidate(candidate: str) -> tuple[Any | None, str | None]:
    attempts = [candidate]
    # Safe, bounded repairs for common compatible-provider output variations.
    repaired = re.sub(r",\s*([}\]])", r"\1", candidate)
    repaired = re.sub(r"\bTrue\b", "true", repaired)
    repaired = re.sub(r"\bFalse\b", "false", repaired)
    repaired = re.sub(r"\bNone\b", "null", repaired)
    if repaired != candidate:
        attempts.append(repaired)
    for index, value in enumerate(attempts):
        try:
            return json.loads(value), "json_repaired" if index else "json"
        except (json.JSONDecodeError, TypeError):
            pass
    try:
        value = ast.literal_eval(candidate)
        if isinstance(value, dict):
            return value, "python_literal_repaired"
    except (ValueError, SyntaxError):
        pass
    return None, None


def _recover_truncated_fields(text: str) -> dict[str, Any]:
    """Recover only complete field values from a truncated JSON object."""
    recovered: dict[str, Any] = {}
    for field in PROPOSAL_FIELDS:
        match = re.search(rf'["\']{field}["\']\s*:\s*', text)
        if not match:
            continue
        tail = text[match.end():]
        decoder = json.JSONDecoder()
        try:
            value, _ = decoder.raw_decode(tail.lstrip())
        except json.JSONDecodeError:
            # A complete quoted scalar can still be recovered before truncation.
            quoted = re.match(r'["\']([^"\']+)["\']', tail.lstrip())
            if not quoted:
                continue
            value = quoted.group(1)
        recovered[field] = value
    return recovered


def _normalize_proposal(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        text = _display_text(value)
        return {"core_judgment": text} if text else {}
    # Compatible models sometimes nest the requested object once.
    for wrapper in ("proposal", "result", "data", "response"):
        if isinstance(value.get(wrapper), dict):
            value = value[wrapper]
            break
    proposal: dict[str, Any] = {}
    for field in PROPOSAL_FIELDS:
        raw = value.get(field)
        if field in LIST_FIELDS:
            proposal[field] = _text_list(raw)
        else:
            proposal[field] = _display_text(raw)
    return proposal


def parse_council_proposal(raw_content: Any) -> ParsedCouncilProposal:
    if not isinstance(raw_content, str) or not raw_content.strip():
        raise ProposalParseError("empty_content")
    normalized, markdown_wrapped = _strip_fences(raw_content)
    candidate = _balanced_object(normalized)
    extracted = candidate is not None and candidate.strip() != normalized.strip()
    parsed, mode = _loads_candidate(candidate or normalized)
    truncated = False
    if parsed is None and "{" in normalized:
        recovered = _recover_truncated_fields(normalized[normalized.find("{"):])
        parsed = recovered or None
        truncated = bool(recovered)
        mode = "truncated_fields" if recovered else None
    if parsed is None:
        # A genuine natural-language response remains a valid public proposal.
        # JSON-looking but unrecoverable garbage stays a parse failure.
        if "{" in normalized or "}" in normalized:
            raise ProposalParseError("invalid_or_truncated_json")
        parsed, mode = {"core_judgment": normalized}, "text_fallback"
    proposal = _normalize_proposal(parsed)
    if not any(proposal.get(field) for field in PROPOSAL_FIELDS):
        raise ProposalParseError("empty_proposal")
    return ParsedCouncilProposal(
        proposal=proposal,
        metadata={
            "parser_version": 2,
            "parse_mode": mode,
            "markdown_wrapped": markdown_wrapped,
            "embedded_json": extracted,
            "truncated": truncated,
            "normalized_fields": [field for field in PROPOSAL_FIELDS if proposal.get(field)],
        },
    )
