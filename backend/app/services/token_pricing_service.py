from datetime import datetime
from typing import Any

from sqlalchemy.exc import IntegrityError

from app.database.db import SessionLocal
from app.models.token_pricing_snapshot_db import TokenPricingSnapshotDB
from app.services.operation_log_service import OperationLogService
from app.services.token_ledger_service import IdempotencyConflictError

TOKEN_DOMAIN = "token"


class InvalidTokenPricingSnapshotError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class TokenPricingService:
    """
    TokenPricingSnapshot 的发布/读取服务：记录"某次用量应该折算成
    多少 Token"的内部规则，与 ProviderCostService 彻底分离。每个
    version 独立、不可变。

    这一阶段只搭建发布/读取机制，不实现任何"用量 -> 计价快照"的
    解析/结算逻辑（那是 Phase 1C 的工作），也不写入任何权威商业
    数值。
    """

    @staticmethod
    def publish_snapshot(
        *,
        version: str,
        usage_unit_mapping: dict[str, Any],
        token_charge_rule: dict[str, Any],
        effective_from: datetime,
        published_by: str,
        actor_type: str,
        provider: str | None = None,
        model_or_service: str | None = None,
    ) -> TokenPricingSnapshotDB:
        if not version:
            raise InvalidTokenPricingSnapshotError("version must not be empty")

        db = SessionLocal()

        try:
            existing = (
                db.query(TokenPricingSnapshotDB)
                .filter(TokenPricingSnapshotDB.version == version)
                .first()
            )

            if existing is not None:
                TokenPricingService._assert_matches(
                    existing,
                    usage_unit_mapping=usage_unit_mapping,
                    token_charge_rule=token_charge_rule,
                    provider=provider,
                    model_or_service=model_or_service,
                )
                return existing

            log = OperationLogService.record_within_session(
                db,
                domain=TOKEN_DOMAIN,
                entity_type="token_pricing_snapshot",
                entity_id=version,
                action="token_pricing_snapshot_published",
                owner_scope_type=None,
                owner_scope_id=None,
                actor_type=actor_type,
                actor_id=published_by,
                reason_code=None,
                reason_text=None,
                reference_ids={"version": version},
            )

            snapshot = TokenPricingSnapshotDB(
                version=version,
                provider=provider,
                model_or_service=model_or_service,
                usage_unit_mapping=usage_unit_mapping,
                token_charge_rule=token_charge_rule,
                effective_from=effective_from,
                published_by=published_by,
                operation_log_id=log.id,
            )

            db.add(snapshot)

            try:
                db.commit()
            except IntegrityError:
                db.rollback()

                existing = (
                    db.query(TokenPricingSnapshotDB)
                    .filter(TokenPricingSnapshotDB.version == version)
                    .first()
                )

                if existing is None:
                    raise

                TokenPricingService._assert_matches(
                    existing,
                    usage_unit_mapping=usage_unit_mapping,
                    token_charge_rule=token_charge_rule,
                    provider=provider,
                    model_or_service=model_or_service,
                )
                return existing

            db.refresh(snapshot)

            return snapshot

        finally:
            db.close()

    @staticmethod
    def _assert_matches(
        existing: TokenPricingSnapshotDB,
        *,
        usage_unit_mapping: dict[str, Any],
        token_charge_rule: dict[str, Any],
        provider: str | None,
        model_or_service: str | None,
    ) -> None:
        if (
            existing.usage_unit_mapping != usage_unit_mapping
            or existing.token_charge_rule != token_charge_rule
            or existing.provider != provider
            or existing.model_or_service != model_or_service
        ):
            raise IdempotencyConflictError(
                f"version {existing.version!r} was already published with "
                "different content"
            )

    @staticmethod
    def get_snapshot_by_version(version: str) -> TokenPricingSnapshotDB | None:
        db = SessionLocal()

        try:
            return (
                db.query(TokenPricingSnapshotDB)
                .filter(TokenPricingSnapshotDB.version == version)
                .first()
            )

        finally:
            db.close()
