from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from app.core.application_system.service import get_application_system, list_application_systems


class ApplicationSystemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    system_key: str
    name: str
    system_type: str
    status: str
    config: dict
    created_at: object
    updated_at: object


router = APIRouter(prefix="/application-systems", tags=["Application Systems"])


@router.get("", response_model=list[ApplicationSystemOut])
def list_systems():
    return list_application_systems()


@router.get("/{system_id}", response_model=ApplicationSystemOut)
def get_system(system_id: str):
    system = get_application_system(system_id)
    if system is None:
        raise HTTPException(status_code=404, detail="Application System not found")
    return system
