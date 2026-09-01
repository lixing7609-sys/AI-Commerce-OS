from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.model_center.service import delete_provider, discover_models, get_model_center, install_provider, record_health, resolve_runtime_config, save_application_assignments, save_capability_assignment, save_execution_engine, save_multi_model_assignment, save_provider, save_roles, select_models, set_provider_enabled, update_provider_credentials
from app.llm.exceptions import AuthenticationError, ConfigurationError, LLMGatewayError
from app.llm.gateway import LLMGateway
from app.llm.models import LLMRequest
from app.core.model_center.capability_registry import save_routing_preferred
from app.core.model_center.runtime_chain import eligible_models, invocation_economics, reconcile_model_registry, save_pricing_rule, sino_assigned_models


router = APIRouter(prefix="/founder-ai/model-center", tags=["Founder Model Center"])


class ProviderUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    base_url: str = Field(min_length=1, max_length=500)
    model: str = Field(min_length=1, max_length=160)
    api_key: str | None = Field(default=None, max_length=1000)
    enabled: bool = True


class RolesUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assignments: dict[str, str | None]


class ProviderInstallIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider_type: str
    api_key: str = Field(min_length=1, max_length=1000)
    base_url: str | None = Field(default=None, max_length=500)
    display_name: str | None = Field(default=None, max_length=80)


class ProviderCredentialsIn(BaseModel):
    api_key: str | None = Field(default=None, max_length=1000)
    base_url: str | None = Field(default=None, max_length=500)
    display_name: str | None = Field(default=None, max_length=80)


class ModelSelectionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    models: list[str]


class ProviderEnabledIn(BaseModel):
    enabled: bool


class ModelHealthProbeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_id: str = Field(min_length=1, max_length=160)


class ApplicationAssignmentsIn(BaseModel):
    assignments: dict[str, dict | None]


class ModelReferenceIn(BaseModel):
    provider_key: str
    model: str


class DiscussionSlotIn(BaseModel):
    primary: ModelReferenceIn | None = None
    fallback: ModelReferenceIn | None = None


class MultiModelAssignmentIn(BaseModel):
    slots: list[DiscussionSlotIn] | None = Field(default=None, max_length=5)
    models: list[dict[str, str]] | None = None


class CapabilityAssignmentIn(BaseModel):
    provider_key: str | None = None
    model: str | None = None
    fallbacks: list[ModelReferenceIn] = Field(default_factory=list, max_length=2)


class ExecutionEngineAssignmentIn(BaseModel):
    engine_id: str


class RoutingPreferredIn(BaseModel):
    preferred_primary: dict | None = None
    preferred_fallback: dict | None = None


class PricingRuleIn(BaseModel):
    provider_id: str = Field(min_length=1, max_length=80)
    model_id: str = Field(min_length=1, max_length=160)
    effective_from: datetime
    input_price_per_1m_tokens: float = Field(ge=0)
    output_price_per_1m_tokens: float = Field(ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=12)
    pricing_source: str = Field(min_length=1, max_length=120)
    pricing_status: str = Field(default="active", pattern="^(active|inactive)$")


@router.get("")
def read_model_center():
    return get_model_center()


@router.get("/eligible-models")
def read_eligible_models(role: str | None = None, capability: str | None = None):
    return {"role": role, "capability": capability, "models": eligible_models(role=role, capability=capability)}


@router.get("/sino-assigned-models")
def read_sino_assigned_models(conversation_id: str | None = None):
    return {"models": sino_assigned_models(conversation_id=conversation_id)}


@router.get("/economics")
def read_model_economics():
    return invocation_economics()


@router.post("/pricing-rules", status_code=201)
def create_pricing_rule(request: PricingRuleIn):
    try:
        return save_pricing_rule(**request.model_dump())
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/registry/reconcile")
def reconcile_registry():
    return {"providers_reconciled": reconcile_model_registry()}


@router.put("/providers/{provider_key}")
def update_provider(provider_key: str, request: ProviderUpdateIn):
    try:
        return save_provider(provider_key, **request.model_dump())
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/providers", status_code=201)
def add_provider(request: ProviderInstallIn):
    try:
        return install_provider(**request.model_dump())
    except PermissionError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ConnectionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/providers/{provider_key}/discover")
def refresh_provider_models(provider_key: str):
    try:
        return discover_models(provider_key)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except PermissionError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ConnectionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.put("/providers/{provider_key}/credentials")
def edit_provider_credentials(provider_key: str, request: ProviderCredentialsIn):
    try:
        return update_provider_credentials(provider_key, **request.model_dump())
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except PermissionError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ConnectionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.put("/providers/{provider_key}/models")
def update_selected_models(provider_key: str, request: ModelSelectionIn):
    try:
        return select_models(provider_key, request.models)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.patch("/providers/{provider_key}/enabled")
def update_provider_enabled(provider_key: str, request: ProviderEnabledIn):
    try:
        return set_provider_enabled(provider_key, request.enabled)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/providers/{provider_key}", status_code=204)
def remove_provider(provider_key: str):
    try:
        delete_provider(provider_key)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/providers/{provider_key}/health")
def probe_provider(provider_key: str):
    if resolve_runtime_config(provider_key=provider_key) is None:
        center = get_model_center()
        configuration = next((item for item in center["providers"] if item["provider_key"] == provider_key), None)
        if configuration is None:
            raise HTTPException(status_code=404, detail="provider_not_supported")
        return {"status": configuration["health_status"], "provider": provider_key, "model": None, "configuration": configuration}
    try:
        response = LLMGateway().generate_for(provider_key, LLMRequest(
            system_prompt="You are a provider health probe.", user_prompt="Reply with OK.", temperature=0, max_tokens=8,
            metadata={"runtime_role": "model_health", "invocation_source": "model_health_probe", "runtime_mode": "probe"},
        ))
        provider = record_health(provider_key, "healthy")
        return {"status": "healthy", "provider": response.provider, "model": response.model, "configuration": provider}
    except ConfigurationError as error:
        detail = error.error_type
    except AuthenticationError:
        detail = "invalid_credentials"
    except LLMGatewayError as error:
        detail = error.error_type
    except LookupError as error:
        detail = str(error)
    try:
        configuration = record_health(provider_key, "unhealthy", detail)
    except LookupError:
        raise HTTPException(status_code=404, detail="provider_not_configured")
    return {"status": "unhealthy", "provider": provider_key, "model": configuration.get("model"), "configuration": configuration}


@router.post("/providers/{provider_key}/models/health")
def probe_model_resource(provider_key: str, request: ModelHealthProbeIn):
    """Probe one exact model resource without changing Provider health."""
    probe = LLMRequest(
        system_prompt="You are a model resource health probe.", user_prompt="Reply with OK.",
        temperature=0, max_tokens=8,
        metadata={"runtime_role": "model_health", "invocation_source": "model_health_probe", "runtime_mode": "probe",
                  "force_model_health_probe": True},
    )
    try:
        LLMGateway().generate_for_model(provider_key, request.model_id, probe)
        return {"status": "healthy", "provider": provider_key, "model": request.model_id,
                "invocation_id": probe.metadata.get("model_invocation_id")}
    except ConfigurationError as error:
        detail = error.error_type
    except AuthenticationError:
        detail = "authentication_failed"
    except LLMGatewayError as error:
        detail = error.error_type
    return {"status": "unhealthy", "provider": provider_key, "model": request.model_id, "error_code": detail}


@router.put("/roles")
def update_roles(request: RolesUpdateIn):
    try:
        return save_roles(request.assignments)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/capabilities/multi-model-discussion")
def update_multi_model_discussion(request: MultiModelAssignmentIn):
    try:
        slots = [item.model_dump() for item in request.slots] if request.slots is not None else None
        return save_multi_model_assignment(slots=slots, legacy_models=request.models)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/capabilities/{capability_key}")
def update_capability(capability_key: str, request: CapabilityAssignmentIn):
    try:
        return save_capability_assignment(capability_key, request.provider_key, request.model, [item.model_dump() for item in request.fallbacks])
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/execution-engine")
def update_execution_engine(request: ExecutionEngineAssignmentIn):
    try:
        return save_execution_engine(request.engine_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/routing-policies/{capability}")
def update_routing_preferred(capability: str, request: RoutingPreferredIn):
    try:
        return save_routing_preferred(capability, request.preferred_primary, request.preferred_fallback)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/applications/{application_key}/assignments")
def update_application_assignments(application_key: str, request: ApplicationAssignmentsIn):
    try:
        return save_application_assignments(application_key, request.assignments)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
