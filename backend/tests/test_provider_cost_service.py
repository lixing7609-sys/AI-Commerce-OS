"""
ProviderCostService 测试（Phase 1A）：快照发布不可变、重复 version
的重试幂等返回原记录、冲突 payload 复用同一 version 时报错，以及
必须产生 OperationLog。测试里使用的数值都是明确的测试夹具，不
代表任何真实商业决策（见 Token Economy Phase 1 Revision 3
§"Split provider cost from Token pricing"）。
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.database.db import SessionLocal
from app.models.operation_log_db import OperationLogDB
from app.services.provider_cost_service import ProviderCostService
from app.services.token_ledger_service import IdempotencyConflictError
from tests.token_test_support import cleanup_snapshot_versions


def _new_version() -> str:
    return f"test-provider-cost-{uuid.uuid4().hex}"


def test_publish_snapshot_is_immutable_and_logged():
    version = _new_version()

    try:
        snapshot = ProviderCostService.publish_snapshot(
            version=version,
            provider="deepseek",
            model_or_service="deepseek-chat",
            unit_type="input_token",
            provider_currency="USD",
            provider_unit_cost=Decimal("0.00000014"),
            effective_from=datetime.now(timezone.utc),
            source_reference="test fixture, not a real price",
            estimation_status="estimated",
            published_by="tester",
            actor_type="developer_internal",
        )

        assert snapshot.version == version
        assert snapshot.estimation_status == "estimated"

        db = SessionLocal()
        try:
            log = (
                db.query(OperationLogDB)
                .filter(OperationLogDB.id == snapshot.operation_log_id)
                .first()
            )
            assert log is not None
            assert log.domain == "token"
            assert log.action == "provider_cost_snapshot_published"
            assert log.entity_id == version
        finally:
            db.close()
    finally:
        cleanup_snapshot_versions([version])


def test_duplicate_snapshot_version_retry_returns_original():
    version = _new_version()

    kwargs = dict(
        version=version,
        provider="ollama",
        model_or_service="llama3",
        unit_type="input_token",
        provider_currency="USD",
        provider_unit_cost=Decimal("0"),
        effective_from=datetime.now(timezone.utc),
        source_reference="test fixture",
        estimation_status="estimated",
        published_by="tester",
        actor_type="developer_internal",
    )

    try:
        first = ProviderCostService.publish_snapshot(**kwargs)
        second = ProviderCostService.publish_snapshot(**kwargs)

        assert first.id == second.id
    finally:
        cleanup_snapshot_versions([version])


def test_conflicting_snapshot_version_reuse_raises():
    version = _new_version()

    try:
        ProviderCostService.publish_snapshot(
            version=version,
            provider="deepseek",
            model_or_service="deepseek-chat",
            unit_type="input_token",
            provider_currency="USD",
            provider_unit_cost=Decimal("0.00000014"),
            effective_from=datetime.now(timezone.utc),
            source_reference="test fixture",
            estimation_status="estimated",
            published_by="tester",
            actor_type="developer_internal",
        )

        with pytest.raises(IdempotencyConflictError):
            ProviderCostService.publish_snapshot(
                version=version,
                provider="deepseek",
                model_or_service="deepseek-reasoner",  # 不同内容 = 冲突
                unit_type="input_token",
                provider_currency="USD",
                provider_unit_cost=Decimal("0.00000014"),
                effective_from=datetime.now(timezone.utc),
                source_reference="test fixture",
                estimation_status="estimated",
                published_by="tester",
                actor_type="developer_internal",
            )
    finally:
        cleanup_snapshot_versions([version])
