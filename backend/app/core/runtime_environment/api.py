from fastapi import APIRouter

from app.core.runtime_environment.service import ensure_runtime_environment_registry, lookup_runtime_environment

router = APIRouter(prefix="/founder-ai/runtime-environments", tags=["Founder Runtime Environment"])


@router.get("")
def read_registry():
    return ensure_runtime_environment_registry()


@router.get("/{environment_type}")
def read_environment(environment_type: str):
    return lookup_runtime_environment(environment_type.upper())
