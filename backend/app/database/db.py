from threading import Lock

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.config import get_sqlalchemy_echo
from app.database.base import Base
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
from app.core.reference.model import IntelligenceReferenceDB
from app.core.reusable_asset.model import ReusableAssetDB, ReuseEvidenceDB
from app.core.asset_lifecycle.model import AssetCatalogDB, AssetLearningDB
from app.core.product_visibility.model import FounderProductVisibilityDB
from app.core.draft.model import FounderDraftDB
from app.core.intelligence_evolution.model import CapabilityVersionDB, EvolutionFeedbackDB, UpgradeRequestDB
from app.core.conversation_first.model import CandidateGoalDB, ConversationAttachmentDB, ConversationMessageDB, ExecutionDeltaDB, GoalAssetDB, PendingQuestionDB, SecretaryDigestDB
from app.core.council.model import CouncilModelRunDB, CouncilRunDB
from app.core.model_center.model import AICapabilityConfigDB, ApplicationCapabilityAssignmentDB, ModelProviderConfigDB, ModelRegistryDB, ModelRoleAssignmentDB
from app.core.runtime_environment.model import RuntimeEnvironmentRegistryDB
from core.founder_object.model import ConversationObjectContextDB, FounderObjectDB, FounderObjectRevisionDB
from core.founder_intent.model import ConversationCandidateContextDB, FounderIntentRunDB, FounderObjectCandidateDB


DATABASE_URL = (
    "postgresql+psycopg://"
    "n8n:password123@localhost:5432/ai_commerce_os"
)


engine = create_engine(
    DATABASE_URL,
    echo=get_sqlalchemy_echo(),
)


_pool_metric_lock = Lock()
_pool_metrics = {
    "checkout_total": 0,
    "checkin_total": 0,
    "acquire_timeout_count": 0,
}


@event.listens_for(engine, "checkout")
def _record_pool_checkout(*_args) -> None:
    with _pool_metric_lock:
        _pool_metrics["checkout_total"] += 1


@event.listens_for(engine, "checkin")
def _record_pool_checkin(*_args) -> None:
    with _pool_metric_lock:
        _pool_metrics["checkin_total"] += 1


def record_pool_acquire_timeout() -> None:
    """Record a QueuePool acquisition timeout without changing error handling."""
    with _pool_metric_lock:
        _pool_metrics["acquire_timeout_count"] += 1


def pool_metrics_snapshot() -> dict:
    """Return bounded, non-sensitive QueuePool health evidence."""
    pool = engine.pool
    with _pool_metric_lock:
        counters = dict(_pool_metrics)
    return {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        **counters,
    }


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)
