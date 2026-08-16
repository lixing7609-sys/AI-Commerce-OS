from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class FounderProductVisibilityDB(Base):
    __tablename__ = "founder_product_visibility"
    __table_args__ = (
        UniqueConstraint("surface", "entity_type", "entity_id", name="uq_founder_product_visibility_entity"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    surface: Mapped[str] = mapped_column(String(40), nullable=False, default="founder", server_default="founder")
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
