"""
TokenPricingService 测试（Phase 1A）：快照发布不可变、重复 version
的重试幂等返回原记录、冲突 payload 复用同一 version 时报错，以及
必须产生 OperationLog。不实现、不测试任何"用量 -> 计价快照"的
解析逻辑（那是 Phase 1C 的工作）。测试里使用的规则都是明确的
测试夹具，不代表任何真实商业决策。
"""

import uuid
from datetime import datetime, timezone

import pytest

from app.database.db import SessionLocal
from app.models.operation_log_db import OperationLogDB
from app.services.token_ledger_service import IdempotencyConflictError
from app.services.token_pricing_service import TokenPricingService
from tests.token_test_support import cleanup_snapshot_versions


def _new_version() -> str:
    return f"test-token-pricing-{uuid.uuid4().hex}"


def test_publish_snapshot_is_immutable_and_logged():
    version = _new_version()

    try:
        snapshot = TokenPricingService.publish_snapshot(
            version=version,
            usage_unit_mapping={"unit": "per_1000_input_tokens"},
            token_charge_rule={"tokens_per_unit": 1},
            effective_from=datetime.now(timezone.utc),
            published_by="tester",
            actor_type="developer_internal",
            provider="deepseek",
            model_or_service="deepseek-chat",
        )

        assert snapshot.version == version

        db = SessionLocal()
        try:
            log = (
                db.query(OperationLogDB)
                .filter(OperationLogDB.id == snapshot.operation_log_id)
                .first()
            )
            assert log is not None
            assert log.domain == "token"
            assert log.action == "token_pricing_snapshot_published"
            assert log.entity_id == version
        finally:
            db.close()
    finally:
        cleanup_snapshot_versions([version])


def test_duplicate_snapshot_version_retry_returns_original():
    version = _new_version()

    kwargs = dict(
        version=version,
        usage_unit_mapping={"unit": "per_1000_input_tokens"},
        token_charge_rule={"tokens_per_unit": 1},
        effective_from=datetime.now(timezone.utc),
        published_by="tester",
        actor_type="developer_internal",
    )

    try:
        first = TokenPricingService.publish_snapshot(**kwargs)
        second = TokenPricingService.publish_snapshot(**kwargs)

        assert first.id == second.id
    finally:
        cleanup_snapshot_versions([version])


def test_conflicting_snapshot_version_reuse_raises():
    version = _new_version()

    try:
        TokenPricingService.publish_snapshot(
            version=version,
            usage_unit_mapping={"unit": "per_1000_input_tokens"},
            token_charge_rule={"tokens_per_unit": 1},
            effective_from=datetime.now(timezone.utc),
            published_by="tester",
            actor_type="developer_internal",
        )

        with pytest.raises(IdempotencyConflictError):
            TokenPricingService.publish_snapshot(
                version=version,
                usage_unit_mapping={"unit": "per_1000_input_tokens"},
                token_charge_rule={"tokens_per_unit": 2},  # 不同规则 = 冲突
                effective_from=datetime.now(timezone.utc),
                published_by="tester",
                actor_type="developer_internal",
            )
    finally:
        cleanup_snapshot_versions([version])
