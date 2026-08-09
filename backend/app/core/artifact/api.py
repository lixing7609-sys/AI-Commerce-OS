from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.artifact.service import ArtifactBoundaryError, create_artifact, get_founder_artifact, list_founder_artifacts


class ArtifactCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    artifact_type: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    location: str | None = Field(default=None, max_length=500)
    content_ref: str | None = Field(default=None, max_length=500)
    version: int = Field(default=1, ge=1)
    status: str = Field(default="active", min_length=1, max_length=30)
    task_asset_id: str | None = None
    conversation_id: str | None = None
    decision_id: str | None = None


class ArtifactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    system_id: str
    task_asset_id: str | None
    conversation_id: str | None
    decision_id: str | None
    artifact_type: str
    title: str
    description: str | None
    location: str | None
    content_ref: str | None
    version: int
    status: str
    created_at: datetime
    updated_at: datetime


router = APIRouter(prefix="/artifacts", tags=["Artifact Assets"])


@router.post("", response_model=ArtifactOut, status_code=201)
def create_founder_artifact(request: ArtifactCreateIn):
    try:
        return create_artifact(**request.model_dump())
    except ArtifactBoundaryError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("", response_model=list[ArtifactOut])
def list_artifacts():
    return list_founder_artifacts()


@router.get("/{artifact_id}", response_model=ArtifactOut)
def get_artifact(artifact_id: str):
    artifact = get_founder_artifact(artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact asset not found")
    return artifact
