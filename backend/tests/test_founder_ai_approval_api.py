from types import SimpleNamespace

from app.founder_ai import api


def test_approval_api_updates_execution_session(monkeypatch):
    monkeypatch.setattr(api, "get_conversation", lambda _: SimpleNamespace(system_id="founder_ai"))
    monkeypatch.setattr(api, "get_founder_context", lambda _: None)
    def fake_enqueue(execution_id):
        session, _ = api.get_execution_session(execution_id)
        session.status = "queued"
        session.queued_at = "2026-08-10T01:00:01+00:00"
        return SimpleNamespace(status="queued", to_dict=lambda: {"execution_id": execution_id, "status": "queued"})
    monkeypatch.setattr(api, "enqueue_execution", fake_enqueue)
    analyzed = api.analyze_founder_conversation("conversation-1", api.FounderAnalyzeIn(message="开发 Agent"))
    created = api.create_founder_execution(api.ExecutionCreateIn(
        task_asset_id=analyzed.task_asset_draft.title,
        execution_package=analyzed.execution_package,
    ))
    approved = api.approve_founder_execution(created.id)
    assert created.status == "draft"
    assert approved.status == "queued"
    assert approved.execution_allowed is True
    assert approved.approved_at is not None
    assert approved.queued_at is not None
