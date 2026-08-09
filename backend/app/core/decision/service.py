from sqlalchemy import select

from app.core.context.model import ConversationContextDB
from app.core.conversation.model import ConversationDB
from app.core.decision.model import DecisionAssetDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


class DecisionBoundaryError(ValueError):
    """Raised when a decision crosses the Founder application boundary."""


def _validate_reference(session, model, identifier: str | None, label: str) -> None:
    if identifier is None:
        return
    record = session.get(model, identifier)
    if record is None or record.system_id != FOUNDER_SYSTEM_KEY:
        raise DecisionBoundaryError(f"{label} is outside the Founder AI boundary")


def create_decision(
    *,
    title: str,
    decision: str,
    reason: str | None = None,
    impact: str | None = None,
    status: str = "active",
    conversation_id: str | None = None,
    context_id: str | None = None,
) -> DecisionAssetDB:
    with SessionLocal() as session:
        _validate_reference(session, ConversationDB, conversation_id, "conversation")
        _validate_reference(session, ConversationContextDB, context_id, "context")
        record = DecisionAssetDB(
            system_id=FOUNDER_SYSTEM_KEY,
            conversation_id=conversation_id,
            context_id=context_id,
            title=title,
            decision=decision,
            reason=reason,
            impact=impact,
            status=status,
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        return record


def list_founder_decisions() -> list[DecisionAssetDB]:
    with SessionLocal() as session:
        return list(
            session.scalars(
                select(DecisionAssetDB)
                .where(DecisionAssetDB.system_id == FOUNDER_SYSTEM_KEY)
                .order_by(DecisionAssetDB.updated_at.desc())
            )
        )


def get_founder_decision(decision_id: str) -> DecisionAssetDB | None:
    with SessionLocal() as session:
        return session.scalar(
            select(DecisionAssetDB).where(
                DecisionAssetDB.id == decision_id,
                DecisionAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            )
        )
