from uuid import uuid4

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import SinoBrainSessionDB
from app.database.db import SessionLocal
from app.founder_ai.model_probe_worker import ModelProbeWorker, _image_reference
from app.founder_ai.brain_runtime import SinoBrainRuntime


def test_extracts_image_from_openai_compatible_chat_response():
    body = {"choices": [{"message": {"content": "generated", "images": [{"image_url": {"url": "https://example.test/result.png"}}]}}]}
    assert _image_reference(body) == "https://example.test/result.png"


def test_stale_queue_and_stale_heartbeat_are_visible_technical_states():
    queued = SinoBrainRuntime._current_action({"discovery": {"autonomous_main_loop": {"status": "model_probe_queued", "model_probe_job": {"queued_at": "2020-01-01T00:00:00+00:00", "worker_id": None}}}})
    running = SinoBrainRuntime._current_action({"discovery": {"autonomous_main_loop": {"status": "model_probe_running", "model_probe_job": {"heartbeat_at": "2020-01-01T00:00:00+00:00", "started_at": "2020-01-01T00:00:00+00:00", "max_candidates": 3}}}})
    assert queued["status_label"] == "Waiting for executor · stalled"
    assert running["status_label"] == "Worker stalled"


def test_dispatcher_claims_bounded_job_records_ownership_and_callback():
    conversation_id = f"conv-worker-{uuid4().hex[:12]}"
    candidates = [{"provider_id": "provider", "model_id": f"image-{index}", "probe_status": "NOT_RUN"} for index in range(3)]
    loop = {"task_id": "task-worker", "status": "model_probe_queued", "founder_probe_decision": {"approval_status": "approved"}, "model_probe_job": {"probe_job_id": "job-worker", "conversation_id": conversation_id, "task_id": "task-worker", "decision_id": "decision-worker", "approved_scope": "current_configured_image_generation_candidates_only", "candidate_models": candidates, "max_candidates": 3, "status": "queued", "queued_at": "2026-08-18T00:00:00+00:00", "started_at": None, "completed_at": None, "worker_id": None, "heartbeat_at": None, "attempt_count": 0, "retry_count": 0, "probe_results": [], "callback_status": "pending", "last_error": None}}
    calls = []
    worker = ModelProbeWorker(probe=lambda candidate, job_id: calls.append((candidate["model_id"], job_id)) or {"status": "FAIL", "reason": "test_failure", "http_status": 400})
    try:
        with SessionLocal() as session:
            session.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Worker test"))
            session.add(SinoBrainSessionDB(conversation_id=conversation_id, stage="autonomous_execution", discovery={"autonomous_main_loop": loop}))
            session.commit()
        worker.run(conversation_id)
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            current = state.discovery["autonomous_main_loop"]
            job = current["model_probe_job"]
            assert len(calls) == 3
            assert job["worker_id"] == worker.worker_id
            assert job["started_at"] and job["heartbeat_at"] and job["completed_at"]
            assert job["attempt_count"] == 1 and len(job["probe_results"]) == 3
            assert job["callback_status"] == "completed"
            assert current["status"] == "model_probe_failed"
    finally:
        with SessionLocal() as session:
            session.query(SinoBrainSessionDB).filter(SinoBrainSessionDB.conversation_id == conversation_id).delete()
            session.query(ConversationDB).filter(ConversationDB.id == conversation_id).delete()
            session.commit()


def test_recovery_materializes_legacy_approved_queue_once():
    conversation_id = f"conv-recover-{uuid4().hex[:12]}"
    decision = {"decision_id": "decision-recover", "approval_status": "approved", "approved_scope": "current_configured_image_generation_candidates_only", "max_probe_candidate_count": 2, "approved_at": "2026-08-18T00:00:00+00:00"}
    loop = {"task_id": "task-recover", "status": "model_probe_queued", "founder_probe_decision": decision, "probe_dispatch": {"created_at": decision["approved_at"], "candidates": [{"provider_id": "p", "model_id": "image-1"}]}}
    worker = ModelProbeWorker(probe=lambda *_: {"status": "FAIL", "reason": "unused"})
    try:
        with SessionLocal() as session:
            session.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Recover test"))
            session.add(SinoBrainSessionDB(conversation_id=conversation_id, stage="autonomous_execution", discovery={"autonomous_main_loop": loop}))
            session.commit()
        worker._recover_legacy_queue(); worker._recover_legacy_queue()
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            job = state.discovery["autonomous_main_loop"]["model_probe_job"]
            assert job["status"] == "queued" and job["queued_at"] == decision["approved_at"]
            assert job["max_candidates"] == 2 and len(job["candidate_models"]) == 1
    finally:
        with SessionLocal() as session:
            session.query(SinoBrainSessionDB).filter(SinoBrainSessionDB.conversation_id == conversation_id).delete()
            session.query(ConversationDB).filter(ConversationDB.id == conversation_id).delete()
            session.commit()
