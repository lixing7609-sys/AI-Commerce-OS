from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

from app.database.base import Base

# 导入所有 ORM Model（Alembic 自动发现表必须导入）。这里的清单应该
# 与 app.database.db 保持一致，否则 --autogenerate 会把这里遗漏的
# 既有表误判为"需要删除"（本文件曾经因为遗漏这些导入，险些生成一次
# 删除 shops/deliverables/token_*/operation_logs 的破坏性 migration，
# 已手工修正）。
from app.models.deliverable_db import DeliverableDB, DeliverableVersionDB
from app.models.inventory_db import InventoryDB
from app.models.listing_db import ListingDB
from app.models.operation_log_db import OperationLogDB
from app.models.order_db import OrderDB
from app.models.product_db import ProductDB
from app.models.provider_cost_snapshot_db import ProviderCostSnapshotDB
from app.models.runtime_state_db import RuntimeStateDB
from app.models.shop_db import ShopCredentialDB, ShopDB
from app.models.store_db import StoreDB
from app.models.supplier_db import SupplierDB
from app.models.task_db import TaskDB
from app.models.token_account_db import TokenAccountDB
from app.models.token_account_projection_db import TokenAccountProjectionDB
from app.models.token_adjustment_db import TokenAdjustmentDB
from app.models.token_ledger_entry_db import TokenLedgerEntryDB
from app.models.token_lot_db import TokenGrantDB, TokenLotDB
from app.models.token_pricing_snapshot_db import TokenPricingSnapshotDB
from app.core.application_system.model import ApplicationSystemDB
from app.core.conversation.model import ConversationDB
from app.core.project.model import FounderProjectDB, ProjectIntelligenceDB
from app.core.context.model import ConversationContextDB
from app.core.decision.model import DecisionAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.core.artifact.model import ArtifactAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.asset_lifecycle.model import AssetCatalogDB, AssetLearningDB
from app.core.product_visibility.model import FounderProductVisibilityDB
from app.core.draft.model import FounderDraftDB
from app.core.reference.model import IntelligenceReferenceDB
from app.core.council.model import CouncilModelRunDB, CouncilRunDB
from app.core.model_center.model import AICapabilityConfigDB, ApplicationCapabilityAssignmentDB, ModelProviderConfigDB, ModelRegistryDB, ModelRoleAssignmentDB
from core.founder_object.model import ConversationObjectContextDB, FounderObjectDB, FounderObjectRevisionDB
from core.founder_intent.model import ConversationCandidateContextDB, FounderIntentRunDB, FounderObjectCandidateDB
from app.core.conversation_first.model import CandidateGoalDB, ConversationMessageDB, ExecutionDeltaDB, GoalAssetDB, PendingQuestionDB, SecretaryDigestDB

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in offline mode."""

    url = config.get_main_option("sqlalchemy.url")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in online mode."""

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
