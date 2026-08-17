"""Bounded autonomous lane for creating a Studio image-generation capability."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import re

from app.core.model_center.service import get_model_center
from app.database.db import SessionLocal
from app.founder_ai.capability_compatibility import lookup_image_generation_compatibility
from app.core.conversation_first.model import SinoBrainSessionDB
from sqlalchemy import select

IMAGE_MODEL_PATTERN = re.compile(r"image|seedream", re.I)
TEST_DEFAULTS = {
    "test_product": "generic unbranded desk lamp",
    "image_type": "e-commerce hero image",
    "background": "clean neutral white",
    "aspect_ratio": "1:1",
    "resolution": "provider_supported_safe_default",
    "purpose": "capability verification only",
}


def _id(prefix: str, seed: str) -> str:
    return f"{prefix}-{hashlib.sha256(seed.encode()).hexdigest()[:20]}"


def discover_image_model_candidates() -> list[dict]:
    candidates = []
    for model in get_model_center().get("models", []):
        if not model.get("enabled") or not model.get("supports_text") or not IMAGE_MODEL_PATTERN.search(str(model.get("model_id") or "")):
            continue
        candidates.append({
            "provider_id": model.get("provider_id"), "model_id": model.get("model_id"),
            "supports_image_generation": bool(model.get("supports_image_generation")),
            "capability_source": model.get("image_generation_capability_source"),
            "probe_status": "PASS" if model.get("supports_image_generation") else "NOT_RUN",
            "probe_reason": None if model.get("supports_image_generation") else "External image-generation probe has possible incremental provider cost and no persisted probe authorization evidence.",
        })
    return candidates


def run_capability_build_loop(*, conversation_id: str, goal: str, executor_dispatch=None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    loop_id = _id("capability-build-loop", f"{conversation_id}:{goal}")
    task_id = _id("capability-build-task", loop_id)
    compatibility = lookup_image_generation_compatibility()
    candidates = discover_image_model_candidates()
    verified = next((item for item in candidates if item["probe_status"] == "PASS"), None)
    progress = [
        {"stage": "goal_structured", "status": "completed"},
        {"stage": "capability_compatibility", "status": "completed", "result": compatibility["status"]},
        {"stage": "model_registry_lookup", "status": "completed", "candidate_count": len(candidates)},
    ]
    founder_gate = False
    blocker = None
    executor = {"status": "not_dispatched", "reason": "verified_image_generation_model_required"}
    if not verified:
        founder_gate = bool(candidates)
        blocker = {
            "blocker_type": "image_model_probe_authorization_required" if founder_gate else "model_capability_blocked",
            "reason": "Plausible models require a real external generation probe, but normal image-generation probe cost authorization is not recorded." if founder_gate else "No plausible enabled image-generation model is available.",
            "next_resolution": "Founder authorizes one bounded provider probe." if founder_gate else "Configure an image-generation provider and credential reference.",
        }
        progress.append({"stage": "model_probe", "status": "founder_gate_required" if founder_gate else "technical_blocker", "result": blocker})
    elif compatibility["status"] == "EXACT_REUSE":
        progress.append({"stage": "studio_binding", "status": "ready"})
    elif executor_dispatch:
        executor = executor_dispatch({"task_id": task_id, "goal": goal, "verified_model": verified, "test_defaults": TEST_DEFAULTS})
        progress.append({"stage": "codex_executor", "status": executor.get("status", "dispatched")})
    return {
        "loop_id": loop_id, "task_id": task_id, "task_type": "CAPABILITY_BUILD_TASK", "goal": goal,
        "goal_structured": True, "clarification_required": False, "test_defaults_applied": True,
        "test_defaults": dict(TEST_DEFAULTS), "manual_continue_count": 0, "manual_codex_instruction_count": 0,
        "capability_compatibility": compatibility, "model_candidates": candidates, "verified_model": verified,
        "executor_dispatch": executor, "founder_gate_required": founder_gate, "founder_gate_count": int(founder_gate),
        "technical_blocker": blocker if blocker and not founder_gate else None,
        "status": "founder_gate_required" if founder_gate else "technical_blocker" if blocker else "executor_dispatched" if executor.get("status") != "not_dispatched" else "ready",
        "progress": progress, "created_at": now,
    }


def resume_authorized_capability_build_loop(conversation_id: str, decision: dict) -> dict:
    """Resume the existing loop at its bounded probe step, never at a manual continue gate.

    The external probe worker consumes this durable dispatch projection. Keeping the
    dispatch separate from the HTTP decision transaction makes retries auditable.
    """
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        loop = dict(discovery.get("autonomous_main_loop") or {})
        if loop.get("task_id") != decision.get("task_id") or decision.get("approval_status") != "approved":
            raise ValueError("Founder decision does not match the current autonomous task")
        candidates = [dict(item) for item in loop.get("model_candidates") or []]
        ranked = sorted(
            (item for item in candidates if item.get("probe_status") == "NOT_RUN"),
            key=lambda item: (not bool(item.get("provider_id")), "seedream" not in str(item.get("model_id", "")).lower(), str(item.get("model_id"))),
        )[: int(decision["max_probe_candidate_count"])]
        loop["probe_dispatch"] = {
            "status": "queued",
            "decision_id": decision["decision_id"],
            "candidate_count": len(ranked),
            "candidates": ranked,
            "stop_after_first_pass": True,
            "manual_continue_required": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        loop["status"] = "model_probe_queued"
        loop["progress"] = [*(loop.get("progress") or []), {"stage": "model_probe", "status": "queued", "decision_id": decision["decision_id"]}]
        discovery["autonomous_main_loop"] = loop
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
        return loop
