from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.project.service import create_project, get_project_intelligence, list_projects


class ProjectCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime


router = APIRouter(prefix="/founder-ai/projects", tags=["Founder Projects"])


@router.get("", response_model=list[ProjectOut])
def list_founder_projects():
    return list_projects()


@router.post("", response_model=ProjectOut, status_code=201)
def create_founder_project(request: ProjectCreateIn):
    return create_project(name=request.name, description=request.description)


@router.get("/{project_id}/intelligence", response_model=dict)
def read_project_intelligence(project_id: str):
    try:
        return get_project_intelligence(project_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
