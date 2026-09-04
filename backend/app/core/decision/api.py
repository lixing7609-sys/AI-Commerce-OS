from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.decision.service import DecisionBoundaryError, create_decision, get_founder_decision, list_founder_decisions


class DecisionCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    decision: str = Field(min_length=1)
    reason: str | None = None
    impact: str | None = None
    status: str = Field(default="active", min_length=1, max_length=30)
    conversation_id: str | None = None
    context_id: str | None = None


class DecisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    system_id: str
    conversation_id: str | None
    context_id: str | None
    title: str
    decision: str
    reason: str | None
    impact: str | None
    status: str
    created_at: datetime
    updated_at: datetime


router = APIRouter(prefix="/decisions", tags=["Decision Assets"])


@router.post("", response_model=DecisionOut, status_code=201)
def create_founder_decision(request: DecisionCreateIn):
    try:
        return create_decision(**request.model_dump())
    except DecisionBoundaryError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("", response_model=list[DecisionOut])
def list_decisions():
    return list_founder_decisions()


@router.get("/{decision_id}", response_model=DecisionOut)
def get_decision(decision_id: str):
    decision = get_founder_decision(decision_id)
    if decision is None:
        raise HTTPException(status_code=404, detail="Decision not found")
    return decision
