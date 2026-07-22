from datetime import datetime
from decimal import Decimal

from sqlalchemy.exc import IntegrityError

from app.database.db import SessionLocal
from app.models.provider_cost_snapshot_db import (
    PROVIDER_COST_ESTIMATION_STATUSES,
    ProviderCostSnapshotDB,
)
from app.services.operation_log_service import OperationLogService
from app.services.token_ledger_service import IdempotencyConflictError

TOKEN_DOMAIN = "token"


class InvalidProviderCostSnapshotError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class ProviderCostService:
    """
    ProviderCostSnapshot 的发布/读取服务：记录外部 Provider 的成本
    测量，与 TokenPricingService（内部计价规则）彻底分离（见
    ADR-0003 Token Domain Model §"Split provider cost from Token
    pricing"）。每个 version 独立、不可变——发布后没有任何 update
    路径，回滚是发布新版本，不是修改旧版本。

    这一阶段不写入任何权威商业数值；测试使用的数值必须是明确标注
    的测试夹具。
    """

    @staticmethod
    def publish_snapshot(
        *,
        version: str,
        provider: str,
        model_or_service: str,
        unit_type: str,
        provider_currency: str,
        provider_unit_cost: Decimal,
        effective_from: datetime,
        source_reference: str,
        estimation_status: str,
        published_by: str,
        actor_type: str,
        effective_until: datetime | None = None,
    ) -> ProviderCostSnapshotDB:
        if estimation_status not in PROVIDER_COST_ESTIMATION_STATUSES:
            raise InvalidProviderCostSnapshotError(
                f"estimation_status {estimation_status!r} is not supported"
            )

        if not version:
            raise InvalidProviderCostSnapshotError("version must not be empty")

        db = SessionLocal()

        try:
            existing = (
                db.query(ProviderCostSnapshotDB)
                .filter(ProviderCostSnapshotDB.version == version)
                .first()
            )

            if existing is not None:
                ProviderCostService._assert_matches(
                    existing,
                    provider=provider,
                    model_or_service=model_or_service,
                    provider_unit_cost=provider_unit_cost,
                )
                return existing

            log = OperationLogService.record_within_session(
                db,
                domain=TOKEN_DOMAIN,
                entity_type="provider_cost_snapshot",
                entity_id=version,
                action="provider_cost_snapshot_published",
                owner_scope_type=None,
                owner_scope_id=None,
                actor_type=actor_type,
                actor_id=published_by,
                reason_code=None,
                reason_text=None,
                reference_ids={"version": version},
            )

            snapshot = ProviderCostSnapshotDB(
                version=version,
                provider=provider,
                model_or_service=model_or_service,
                unit_type=unit_type,
                provider_currency=provider_currency,
                provider_unit_cost=provider_unit_cost,
                effective_from=effective_from,
                effective_until=effective_until,
                source_reference=source_reference,
                estimation_status=estimation_status,
                published_by=published_by,
                operation_log_id=log.id,
            )

            db.add(snapshot)

            try:
                db.commit()
            except IntegrityError:
                db.rollback()

                existing = (
                    db.query(ProviderCostSnapshotDB)
                    .filter(ProviderCostSnapshotDB.version == version)
                    .first()
                )

                if existing is None:
                    raise

                ProviderCostService._assert_matches(
                    existing,
                    provider=provider,
                    model_or_service=model_or_service,
                    provider_unit_cost=provider_unit_cost,
                )
                return existing

            db.refresh(snapshot)

            return snapshot

        finally:
            db.close()

    @staticmethod
    def _assert_matches(
        existing: ProviderCostSnapshotDB,
        *,
        provider: str,
        model_or_service: str,
        provider_unit_cost: Decimal,
    ) -> None:
        if (
            existing.provider != provider
            or existing.model_or_service != model_or_service
            or existing.provider_unit_cost != provider_unit_cost
        ):
            raise IdempotencyConflictError(
                f"version {existing.version!r} was already published with "
                "different content"
            )

    @staticmethod
    def get_snapshot_by_version(version: str) -> ProviderCostSnapshotDB | None:
        db = SessionLocal()

        try:
            return (
                db.query(ProviderCostSnapshotDB)
                .filter(ProviderCostSnapshotDB.version == version)
                .first()
            )

        finally:
            db.close()
