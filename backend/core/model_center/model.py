from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class ModelProviderConfigDB(Base):
    __tablename__ = "model_provider_configs"

    provider_key: Mapped[str] = mapped_column(String(40), primary_key=True)
    provider_type: Mapped[str] = mapped_column(String(40), nullable=False, default="openai_compatible")
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    available_models: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    selected_models: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    encrypted_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_key_mask: Mapped[str | None] = mapped_column(String(40), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    health_status: Mapped[str] = mapped_column(String(30), nullable=False, default="unknown")
    health_error: Mapped[str | None] = mapped_column(String(80), nullable=True)
    health_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))


class ModelRegistryDB(Base):
    """Provider-independent model identity and capability metadata."""

    __tablename__ = "model_registry"
    __table_args__ = (UniqueConstraint("provider_id", "model_id", name="uq_model_registry_provider_model"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    model_id: Mapped[str] = mapped_column(String(160), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    capability: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    context_window: Mapped[int | None] = mapped_column(Integer, nullable=True)
    supports_reasoning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    supports_vision: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    supports_tools: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))


class ModelRoleAssignmentDB(Base):
    __tablename__ = "model_role_assignments"
    __table_args__ = (UniqueConstraint("role_key", name="uq_model_role_assignment_role"),)

    role_key: Mapped[str] = mapped_column(String(40), primary_key=True)
    provider_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))


class ApplicationCapabilityAssignmentDB(Base):
    __tablename__ = "application_capability_assignments"
    __table_args__ = (UniqueConstraint("application_key", "capability_key", name="uq_application_capability_assignment"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    application_key: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    capability_key: Mapped[str] = mapped_column(String(60), nullable=False)
    provider_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))


class AICapabilityConfigDB(Base):
    __tablename__ = "ai_capability_configs"

    capability_key: Mapped[str] = mapped_column(String(60), primary_key=True)
    configuration: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))


class ModelPricingRuleDB(Base):
    __tablename__ = "model_pricing_rules"
    __table_args__ = (UniqueConstraint("provider_id", "model_id", "effective_from", name="uq_model_pricing_rule_identity"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    model_id: Mapped[str] = mapped_column(String(160), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    input_price_per_1m_tokens: Mapped[float] = mapped_column(Numeric(18, 8), nullable=False)
    output_price_per_1m_tokens: Mapped[float] = mapped_column(Numeric(18, 8), nullable=False)
    currency: Mapped[str] = mapped_column(String(12), nullable=False, default="USD", server_default="USD")
    pricing_source: Mapped[str] = mapped_column(String(120), nullable=False)
    pricing_status: Mapped[str] = mapped_column(String(24), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class ModelInvocationDB(Base):
    __tablename__ = "model_invocations"

    invocation_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), index=True)
    provider_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    model_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    resource_identity: Mapped[str | None] = mapped_column(String(300), nullable=True, index=True)
    consumer_type: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    consumer_role: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    task_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    execution_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    execution_resource_identity: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    council_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    council_model_run_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    assignment_role: Mapped[str | None] = mapped_column(String(80), nullable=True)
    invocation_source: Mapped[str] = mapped_column(String(80), nullable=False, default="runtime", server_default="runtime")
    runtime_mode: Mapped[str] = mapped_column(String(24), nullable=False, default="default", server_default="default")
    fallback_from_provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    fallback_from_model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    pricing_rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_cost: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(12), nullable=True)
