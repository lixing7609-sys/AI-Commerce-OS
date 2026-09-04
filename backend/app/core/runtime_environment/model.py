from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class RuntimeEnvironmentRegistryDB(Base):
    __tablename__ = "runtime_environment_registries"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    active_environment_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    environments: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
