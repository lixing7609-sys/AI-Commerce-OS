from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, JSON, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ApplicationSystemDB(Base):
    """Canonical identity for a parallel AI Commerce OS application system."""

    __tablename__ = "application_systems"

    id: Mapped[str] = mapped_column(
        String(40), primary_key=True, default=lambda: f"app-{uuid4().hex[:20]}"
    )
    system_key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    system_type: Mapped[str] = mapped_column(String(50), nullable=False, default="application_system")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active", server_default="active")
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
