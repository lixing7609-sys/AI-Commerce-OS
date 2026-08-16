from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.project.service import create_project, delete_project, get_project_intelligence, list_projects, project_counts, update_project


class ProjectCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str | None
    parent_project_id: str | None = None
    project_type: str = "project"
    architecture_role: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    conversation_count: int = 0
    candidate_count: int = 0
    ready_count: int = 0


class ProjectUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=160)
    status: str | None = Field(default=None, pattern="^(active|archived)$")


router = APIRouter(prefix="/founder-ai/projects", tags=["Founder Projects"])


@router.get("", response_model=list[ProjectOut])
def list_founder_projects():
    projects = list_projects(); counts = project_counts([item.id for item in projects])
    return [{"id": item.id, "name": item.name, "description": item.description, "parent_project_id": item.parent_project_id, "project_type": item.project_type, "architecture_role": item.architecture_role, "status": item.status, "created_at": item.created_at, "updated_at": item.updated_at, **counts[item.id]} for item in projects]


@router.post("", response_model=ProjectOut, status_code=201)
def create_founder_project(request: ProjectCreateIn):
    return create_project(name=request.name, description=request.description)


@router.patch("/{project_id}", response_model=ProjectOut)
def patch_founder_project(project_id: str, request: ProjectUpdateIn):
    try: return update_project(project_id, name=request.name, status=request.status)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/{project_id}", response_model=dict[str, object])
def remove_founder_project(project_id: str):
    try: return delete_project(project_id)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/{project_id}/intelligence", response_model=dict)
def read_project_intelligence(project_id: str):
    try:
        return get_project_intelligence(project_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
