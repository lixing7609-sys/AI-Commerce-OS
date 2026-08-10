from types import SimpleNamespace

from app.founder_ai import api


def test_approval_api_updates_execution_session(monkeypatch):
    monkeypatch.setattr(api, "get_conversation", lambda _: SimpleNamespace(system_id="founder_ai"))
    monkeypatch.setattr(api, "get_founder_context", lambda _: None)
    monkeypatch.setattr(api, "enqueue_execution", lambda execution_id: SimpleNamespace(status="queued", to_dict=lambda: {"execution_id": execution_id, "status": "queued"}))
    analyzed = api.analyze_founder_conversation("conversation-1", api.FounderAnalyzeIn(message="开发 Agent"))
    created = api.create_founder_execution(api.ExecutionCreateIn(
        task_asset_id=analyzed.task_asset_draft.title,
        execution_package=analyzed.execution_package,
    ))
    approved = api.approve_founder_execution(created.id)
    assert created.status == "draft"
    assert approved.status == "queued"
    assert approved.execution_allowed is True
