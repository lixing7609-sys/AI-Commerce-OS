"""Durable dispatcher and bounded worker for approved image-model probes."""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import json
import re
from pathlib import Path
from threading import Event, Thread
import time
from uuid import uuid4

import httpx
from PIL import Image
from io import BytesIO
from sqlalchemy import select

from app.core.asset_lifecycle.service import upsert_catalog_record
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.model_center.model import AICapabilityConfigDB
from app.core.model_center.service import resolve_runtime_config
from app.database.db import SessionLocal

WORKER_ID = f"image-model-probe-worker-{uuid4().hex[:12]}"
ASSET_ROOT = Path(__file__).resolve().parents[3] / ".runtime" / "studio-assets"
RAW_RESPONSE_ROOT = Path(__file__).resolve().parents[3] / ".runtime" / "model-probe-responses"
SAFE_PROMPT = "Generate one square e-commerce hero image of a generic unbranded desk lamp on a clean neutral white background. No logos, no text, capability verification only."
URL_PATTERN = re.compile(r"https?://[^\s\])}>\"']+")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _job_id(conversation_id: str, decision_id: str) -> str:
    return f"model-probe-job-{hashlib.sha256(f'{conversation_id}:{decision_id}'.encode()).hexdigest()[:20]}"


def _image_reference(body: dict) -> str | None:
    data = body.get("data") or []
    if data and isinstance(data[0], dict):
        return data[0].get("url") or (f"data:image/png;base64,{data[0]['b64_json']}" if data[0].get("b64_json") else None)
    try:
        message = body["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        return None
    images = message.get("images") or []
    if images:
        first = images[0]
        if isinstance(first, dict):
            value = first.get("image_url") or first.get("url")
            return value.get("url") if isinstance(value, dict) else value
    content = message.get("content")
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            value = item.get("image_url") or item.get("url")
            if value:
                return value.get("url") if isinstance(value, dict) else value
    if isinstance(content, str):
        data_match = re.search(r"data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+", content)
        if data_match:
            return data_match.group(0)
        url_match = URL_PATTERN.search(content)
        if url_match:
            return url_match.group(0)
    return None


def _response_structure(value, *, depth: int = 0):
    if depth > 8:
        return "max_depth"
    if isinstance(value, dict):
        return {str(key): _response_structure(item, depth=depth + 1) for key, item in value.items()}
    if isinstance(value, list):
        return {"type": "array", "length": len(value), "items": [_response_structure(item, depth=depth + 1) for item in value[:2]]}
    if isinstance(value, str):
        return {"type": "string", "length": len(value), "data_url": value.startswith("data:image/")}
    return type(value).__name__


def _find_provider_image(value, path: tuple[str, ...] = ()) -> tuple[str, str | None, str] | None:
    """Return reference, mime type, and response path without Provider coupling."""
    if isinstance(value, list):
        for index, item in enumerate(value):
            found = _find_provider_image(item, (*path, str(index)))
            if found:
                return found
        return None
    if not isinstance(value, dict):
        if isinstance(value, str) and value.startswith("data:image/"):
            return value, value.split(";", 1)[0].split(":", 1)[1], ".".join(path)
        return None
    normalized = {str(key).casefold().replace("_", ""): key for key in value}
    mime_key = normalized.get("mimetype") or normalized.get("mediatype")
    mime_type = str(value.get(mime_key) or "") if mime_key else None
    data_key = normalized.get("data") or normalized.get("b64json") or normalized.get("base64")
    if data_key and isinstance(value.get(data_key), str) and (str(mime_type or "").startswith("image/") or "b64json" in normalized or any(part.casefold() in {"inlinedata", "inline_data", "image", "images"} for part in path)):
        resolved_mime = mime_type if str(mime_type or "").startswith("image/") else "image/png"
        return f"data:{resolved_mime};base64,{value[data_key]}", resolved_mime, ".".join((*path, str(data_key)))
    for key in ("url", "image_url", "imageUrl", "uri", "file_uri", "fileUri"):
        reference = value.get(key)
        if isinstance(reference, dict):
            reference = reference.get("url") or reference.get("uri")
        if isinstance(reference, str) and (reference.startswith("data:image/") or reference.startswith("http://") or reference.startswith("https://")):
            semantic_path = " ".join((*path, key)).casefold()
            if any(term in semantic_path for term in ("image", "inline", "asset", "attachment", "output", "part")):
                return reference, mime_type, ".".join((*path, key))
    for key, item in value.items():
        found = _find_provider_image(item, (*path, str(key)))
        if found:
            return found
    return None


def normalize_image_generation_response(body: dict, *, provider: str, model_id: str, raw_response_reference: str) -> dict:
    found = _find_provider_image(body)
    if not found:
        legacy = _image_reference(body)
        found = (legacy, None, "legacy_openai_compatible") if legacy else None
    return {
        "provider": provider,
        "model_id": model_id,
        "status": "PASS" if found else "FAIL",
        "asset_kind": "binary_or_url_reference" if found else None,
        "mime_type": found[1] if found else None,
        "binary_reference": found[0] if found and found[0].startswith("data:image/") else None,
        "url_reference": found[0] if found and not found[0].startswith("data:image/") else None,
        "width": None,
        "height": None,
        "evidence": {"response_path": found[2] if found else None, "response_structure": _response_structure(body)},
        "raw_response_reference": raw_response_reference,
        "sensitive": False,
    }


def _persist_raw_response(body: dict, job_id: str, model_id: str) -> str:
    RAW_RESPONSE_ROOT.mkdir(parents=True, exist_ok=True)
    name = hashlib.sha256(f"{job_id}:{model_id}".encode()).hexdigest()[:20]
    target = RAW_RESPONSE_ROOT / f"{name}.json"
    target.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
    return str(target.relative_to(Path(__file__).resolve().parents[3]))


def _save_image(reference: str, job_id: str) -> dict:
    if reference.startswith("data:image/"):
        header, encoded = reference.split(",", 1)
        content = base64.b64decode(encoded, validate=True)
        mime_type = header.split(";", 1)[0].split(":", 1)[1]
    else:
        response = httpx.get(reference, timeout=60, follow_redirects=True)
        response.raise_for_status()
        content = response.content
        mime_type = response.headers.get("content-type", "image/png").split(";", 1)[0]
    with Image.open(BytesIO(content)) as image:
        image.verify()
        width, height = image.size
        image_format = (image.format or "PNG").lower()
    suffix = ".jpg" if image_format in {"jpg", "jpeg"} else ".webp" if image_format == "webp" else ".png"
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    target = ASSET_ROOT / f"{job_id}{suffix}"
    target.write_bytes(content)
    return {"generation_reference": str(target.relative_to(Path(__file__).resolve().parents[3])), "width": width, "height": height, "mime_type": mime_type, "size": len(content)}


def real_image_probe(candidate: dict, job_id: str) -> dict:
    provider_id, model_id = candidate.get("provider_id"), candidate.get("model_id")
    runtime = resolve_runtime_config(provider_key=provider_id, model=model_id)
    if runtime is None:
        return {"status": "BLOCKED", "reason": "configured_model_or_credential_reference_unavailable"}
    headers = {"Authorization": f"Bearer {runtime.api_key}"}
    chat_payload = {"model": model_id, "messages": [{"role": "user", "content": SAFE_PROMPT}], "modalities": ["text", "image"], "max_tokens": 512}
    try:
        response = httpx.post(f"{runtime.base_url.rstrip('/')}/chat/completions", json=chat_payload, headers=headers, timeout=120)
        if response.status_code in {404, 405} and runtime.provider_type == "openai":
            response = httpx.post(f"{runtime.base_url.rstrip('/')}/images/generations", json={"model": model_id, "prompt": SAFE_PROMPT, "size": "1024x1024", "n": 1}, headers=headers, timeout=120)
        if response.status_code in {401, 403}:
            return {"status": "BLOCKED", "reason": "credential_reference_rejected", "http_status": response.status_code}
        if response.status_code == 429:
            return {"status": "BLOCKED", "reason": "provider_rate_or_quota_boundary", "http_status": 429}
        if response.status_code != 200:
            return {"status": "FAIL", "reason": "provider_probe_rejected", "http_status": response.status_code}
        body = response.json()
        raw_reference = _persist_raw_response(body, job_id, model_id)
        normalized = normalize_image_generation_response(body, provider=provider_id, model_id=model_id, raw_response_reference=raw_reference)
        reference = normalized.get("binary_reference") or normalized.get("url_reference")
        if not reference:
            return {"status": "FAIL", "reason": "provider_returned_no_image_asset", "http_status": 200, "normalized_result": normalized}
        asset = _save_image(reference, job_id)
        normalized.update({"status": "PASS", "asset_kind": "local_binary_reference", "binary_reference": asset["generation_reference"], "url_reference": None, "width": asset["width"], "height": asset["height"], "mime_type": asset["mime_type"]})
        return {"status": "PASS", "reason": None, "http_status": 200, "asset": asset, "normalized_result": normalized}
    except httpx.TimeoutException:
        return {"status": "BLOCKED", "reason": "provider_probe_timeout"}
    except (httpx.HTTPError, ValueError, OSError):
        return {"status": "FAIL", "reason": "provider_probe_transport_or_asset_validation_failed"}


def _update_job(conversation_id: str, mutate) -> dict:
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        loop = dict(discovery.get("autonomous_main_loop") or {})
        job = dict(loop.get("model_probe_job") or {})
        mutate(job, loop)
        loop["model_probe_job"] = job
        discovery["autonomous_main_loop"] = loop
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
        return job


def _record_success(conversation_id: str, job: dict, candidate: dict, result: dict) -> None:
    now = _now()
    capability_id = f"capability-image-generation-{hashlib.sha256(job['task_id'].encode()).hexdigest()[:16]}"
    studio_task_id = f"studio-task-{uuid4().hex[:20]}"
    studio_asset_id = f"studio-asset-{uuid4().hex[:20]}"
    with SessionLocal() as session:
        config = session.get(AICapabilityConfigDB, "image_generation_model_routing")
        if config is None:
            config = AICapabilityConfigDB(capability_key="image_generation_model_routing", configuration={})
            session.add(config)
        configuration = dict(config.configuration or {})
        probes = dict(configuration.get("model_probes") or {})
        probes[f"{candidate['provider_id']}:{candidate['model_id']}"] = {"supports_image_generation": True, "status": "passed", "source": job["probe_job_id"], "observed_at": now}
        config.configuration = {**configuration, "model_probes": probes}
        upsert_catalog_record(session, asset_id=capability_id, asset_type="capability", native_type="image_generation_capability", native_id=capability_id, name="Image Generation Capability V1", purpose="Generate and persist one Studio image asset from a text prompt.", content={"capability_type": "image_generation", "input_modality": ["text", "optional_image_reference"], "output_modality": "image", "required_output": "generated_image_asset", "consumer": "studio_ai", "produces_image_asset": True, "model_binding": {"provider_id": candidate["provider_id"], "model_id": candidate["model_id"]}, "validation_probe_job_id": job["probe_job_id"]}, status="ready", version=1, source_conversation_id=conversation_id, source_package_id=None, project_id=None, domain_id="commerce")
        studio_conversation = ConversationDB(system_id="studio_ai", title="商品主图 Capability Verification", conversation_kind="studio_production")
        session.add(studio_conversation); session.flush()
        task = {"task_id": studio_task_id, "task_type": "image_generation", "goal": "生成一张商品主图", "capability_lookup": {"status": "available", "capability": {"asset_id": capability_id, "status": "ready"}}, "model_lookup": {"status": "available", "model": {"provider_id": candidate["provider_id"], "model_id": candidate["model_id"]}}, "execution_status": "completed", "verification": "PASS", "status": "completed", "asset": {"asset_id": studio_asset_id, "capability_id": capability_id, "model_id": candidate["model_id"], "prompt": SAFE_PROMPT, **result["asset"], "verification_status": "PASS", "created_at": now}}
        session.add(ConversationMessageDB(conversation_id=studio_conversation.id, role="assistant", content="Image Generation Capability 验证完成，商品主图资产已生成。", message_type="studio_task", grounding={"studio_task": task}))
        session.commit()

    def finish(job_state, loop):
        job_state.update({"status": "completed", "completed_at": now, "heartbeat_at": now, "callback_status": "completed"})
        loop.update({"status": "completed", "verified_model": {"provider_id": candidate["provider_id"], "model_id": candidate["model_id"], "probe_job_id": job["probe_job_id"]}, "capability_id": capability_id, "capability_status": "ready", "studio_task_id": studio_task_id, "studio_asset_id": studio_asset_id, "execution_status": "completed", "verification_status": "PASS", "completed_at": now, "founder_gate_required": False})
        loop["progress"] = [*(loop.get("progress") or []), {"stage": "model_probe", "status": "completed"}, {"stage": "capability_build", "status": "completed"}, {"stage": "validate", "status": "completed"}, {"stage": "studio_binding", "status": "completed"}, {"stage": "complete", "status": "completed"}]
    _update_job(conversation_id, finish)


class ModelProbeWorker:
    def __init__(self, probe=real_image_probe):
        self.probe = probe
        self.worker_id = WORKER_ID
        self._stop = Event()
        self._wake = Event()
        self._thread: Thread | None = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._recover_legacy_queue()
        self._recover_unavailable_candidate_failure()
        self._thread = Thread(target=self._consume, name="sino-image-model-probe-worker", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set(); self._wake.set()
        if self._thread:
            self._thread.join(timeout=5)

    def wake(self):
        self._wake.set()

    def _queued_conversations(self) -> list[str]:
        with SessionLocal() as session:
            rows = list(session.scalars(select(SinoBrainSessionDB)))
            result = []
            for state in rows:
                loop = dict((state.discovery or {}).get("autonomous_main_loop") or {})
                job = dict(loop.get("model_probe_job") or {})
                if job.get("status") in {"queued", "dispatching"} and loop.get("founder_probe_decision", {}).get("approval_status") == "approved":
                    result.append(state.conversation_id)
            return result

    def _recover_legacy_queue(self):
        """Materialize the pre-worker queued projection as one stable durable job."""
        with SessionLocal() as session:
            rows = list(session.scalars(select(SinoBrainSessionDB)))
            targets = []
            for state in rows:
                loop = dict((state.discovery or {}).get("autonomous_main_loop") or {})
                decision = dict(loop.get("founder_probe_decision") or {})
                dispatch = dict(loop.get("probe_dispatch") or {})
                if loop.get("status") == "model_probe_queued" and not loop.get("model_probe_job") and decision.get("approval_status") == "approved":
                    targets.append((state.conversation_id, decision, dispatch))
        for conversation_id, decision, dispatch in targets:
            def materialize(job, loop):
                queued_at = dispatch.get("created_at") or decision.get("approved_at") or _now()
                job.update({"probe_job_id": _job_id(conversation_id, decision["decision_id"]), "conversation_id": conversation_id, "task_id": loop["task_id"], "decision_id": decision["decision_id"], "approved_scope": decision["approved_scope"], "candidate_models": list(dispatch.get("candidates") or []), "max_candidates": int(decision["max_probe_candidate_count"]), "status": "queued", "queued_at": queued_at, "started_at": None, "completed_at": None, "worker_id": None, "heartbeat_at": None, "attempt_count": 0, "retry_count": 0, "probe_results": [], "callback_status": "pending", "last_error": None})
            _update_job(conversation_id, materialize)

    def _recover_unavailable_candidate_failure(self):
        """Retry once when the old scheduler selected zero executable bindings."""
        with SessionLocal() as session:
            rows = list(session.scalars(select(SinoBrainSessionDB)))
            targets = []
            for state in rows:
                loop = dict((state.discovery or {}).get("autonomous_main_loop") or {})
                job = dict(loop.get("model_probe_job") or {})
                results = list(job.get("probe_results") or [])
                unavailable_only = bool(results) and all((item.get("evidence") or {}).get("reason") == "configured_model_or_credential_reference_unavailable" for item in results)
                if loop.get("status") == "model_probe_failed" and job.get("retry_count", 0) == 0 and unavailable_only and loop.get("founder_probe_decision", {}).get("approval_status") == "approved":
                    candidates = []
                    for item in loop.get("model_candidates") or []:
                        if resolve_runtime_config(provider_key=item.get("provider_id"), model=item.get("model_id")) is not None:
                            candidates.append(dict(item))
                    targets.append((state.conversation_id, candidates[: int(job.get("max_candidates") or 1)]))
        for conversation_id, candidates in targets:
            def requeue(job, loop):
                job.update({"candidate_models": candidates, "status": "queued", "queued_at": _now(), "started_at": None, "completed_at": None, "worker_id": None, "heartbeat_at": None, "retry_count": 1, "callback_status": "pending", "last_error": None, "current_candidate_index": None})
                loop.update({"status": "model_probe_queued", "technical_blocker": None})
            _update_job(conversation_id, requeue)

    def _consume(self):
        while not self._stop.is_set():
            for conversation_id in self._queued_conversations():
                if self._stop.is_set(): break
                self.run(conversation_id)
            self._wake.wait(1); self._wake.clear()

    def run(self, conversation_id: str):
        started = _now()
        def claim(job, loop):
            job.update({"status": "running", "worker_id": self.worker_id, "started_at": job.get("started_at") or started, "heartbeat_at": started, "attempt_count": int(job.get("attempt_count") or 0) + 1})
            loop["status"] = "model_probe_running"
        job = _update_job(conversation_id, claim)
        passed = None
        for index, candidate in enumerate(job.get("candidate_models") or []):
            heartbeat = _now()
            _update_job(conversation_id, lambda current, loop: (current.update({"heartbeat_at": heartbeat, "status": "running", "current_candidate_index": index + 1}), loop.update({"status": "model_probe_running"})))
            result = self.probe(candidate, job["probe_job_id"])
            result_record = {"provider_id": candidate.get("provider_id"), "model_id": candidate.get("model_id"), "probe_status": result["status"], "evidence": {"reason": result.get("reason"), "http_status": result.get("http_status"), "asset": result.get("asset"), "normalized_result": result.get("normalized_result")}, "external_effect": "none" if result.get("reason") == "configured_model_or_credential_reference_unavailable" else "single_provider_inference_call", "timestamp": _now()}
            job = _update_job(conversation_id, lambda current, loop: current.update({"probe_results": [*(current.get("probe_results") or []), result_record], "heartbeat_at": _now(), "external_call_count": int(current.get("external_call_count") or 0) + (0 if result.get("reason") == "configured_model_or_credential_reference_unavailable" else 1)}))
            if result["status"] == "PASS":
                passed = (candidate, result); break
        if passed:
            _record_success(conversation_id, job, *passed)
            return
        completed = _now()
        def fail(current, loop):
            current.update({"status": "failed", "completed_at": completed, "heartbeat_at": completed, "callback_status": "completed", "last_error": "no_candidate_passed"})
            loop.update({"status": "model_probe_failed", "technical_blocker": {"blocker_type": "model_probe_failed", "reason": "Approved bounded candidates produced no verified image asset.", "next_resolution": "Review probe evidence or configure a compatible image-generation model."}, "founder_gate_required": False})
        _update_job(conversation_id, fail)


model_probe_worker = ModelProbeWorker()


def requeue_single_approved_gemini_probe(conversation_id: str) -> dict:
    """One bounded parser/adapter retry for the already-approved Gemini candidate."""
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if state is None:
            raise LookupError("Sino Brain state not found")
        loop = dict((state.discovery or {}).get("autonomous_main_loop") or {})
        decision = dict(loop.get("founder_probe_decision") or {})
        job = dict(loop.get("model_probe_job") or {})
        if decision.get("approval_status") != "approved" or loop.get("status") != "model_probe_failed":
            raise ValueError("Approved failed probe job required")
        if int(job.get("adapter_retry_count") or 0) >= 1:
            raise ValueError("Gemini adapter retry already consumed")
        candidate = next((dict(item) for item in loop.get("model_candidates") or [] if item.get("model_id") == "google/gemini-3.1-flash-image" and resolve_runtime_config(provider_key=item.get("provider_id"), model=item.get("model_id")) is not None), None)
        if candidate is None:
            raise ValueError("Approved Gemini candidate binding unavailable")
    def requeue(job_state, loop_state):
        job_state.update({"candidate_models": [candidate], "max_candidates": 1, "status": "queued", "queued_at": _now(), "started_at": None, "completed_at": None, "worker_id": None, "heartbeat_at": None, "adapter_retry_count": 1, "callback_status": "pending", "last_error": None, "current_candidate_index": None})
        loop_state.update({"status": "model_probe_queued", "technical_blocker": None, "founder_gate_required": False})
    job = _update_job(conversation_id, requeue)
    model_probe_worker.wake()
    return job
