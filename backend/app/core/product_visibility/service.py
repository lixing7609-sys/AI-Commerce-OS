from sqlalchemy import select

from app.core.product_visibility.model import FounderProductVisibilityDB


FOUNDER_SURFACE = "founder"


def hidden_entity_ids(session, entity_type: str) -> set[str]:
    return set(session.scalars(select(FounderProductVisibilityDB.entity_id).where(
        FounderProductVisibilityDB.surface == FOUNDER_SURFACE,
        FounderProductVisibilityDB.entity_type == entity_type,
        FounderProductVisibilityDB.hidden.is_(True),
    )))


def is_product_hidden(session, entity_type: str, entity_id: str | None) -> bool:
    if not entity_id:
        return False
    return session.scalar(select(FounderProductVisibilityDB.id).where(
        FounderProductVisibilityDB.surface == FOUNDER_SURFACE,
        FounderProductVisibilityDB.entity_type == entity_type,
        FounderProductVisibilityDB.entity_id == entity_id,
        FounderProductVisibilityDB.hidden.is_(True),
    )) is not None
