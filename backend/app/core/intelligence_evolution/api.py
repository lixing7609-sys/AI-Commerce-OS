from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database.db import SessionLocal

from .auth import require_roles
from .evaluation import apply_evaluation, evaluate_upgrade
from .evolution_engine import create_upgrade_request
from .feedback_pipeline import build_learning_signal, receive_feedback
from .model import UpgradeRequestDB
from .version_repository import list_versions


router = APIRouter(tags=["Intelligence Evolution"])


def get_db():
    with SessionLocal() as session:
        yield session


class FeedbackIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    capability_id: str
    capability_version: str
    source_system: str
    metrics: dict[str, float]
    context: dict = Field(default_factory=dict)


class UpgradeRequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    thresholds: dict[str, float] = Field(default_factory=dict)


class FounderDecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: str = Field(pattern="^(approved|rejected)$")
    rationale: str = ""


def serialize_upgrade(record: UpgradeRequestDB) -> dict:
    return {"upgrade_request_id": record.id, "capability_id": record.capability_id, "source_version": record.source_version, "status": record.status, "proposal": record.proposal, "evaluation_report": record.evaluation_report, "founder_decision": record.founder_decision}


@router.post("/v1/feedback", status_code=201)
def submit_feedback(request: FeedbackIn, _claims=Depends(require_roles("runtime", "system")), session: Session = Depends(get_db)):
    record = receive_feedback(session, request.model_dump())
    session.commit()
    return {"feedback_id": record.id, "status": "accepted"}


@router.get("/v1/capabilities/{capability_id}/versions")
def capability_versions(capability_id: str, _claims=Depends(require_roles("runtime", "founder", "system")), session: Session = Depends(get_db)):
    return [{"version_id": item.id, "version": item.version, "status": item.status, "change_log": item.change_log, "compatibility": item.compatibility, "dependencies": item.dependencies} for item in list_versions(session, capability_id)]


@router.post("/v1/capabilities/{capability_id}/upgrade-request", status_code=201)
def request_upgrade(capability_id: str, request: UpgradeRequestIn, _claims=Depends(require_roles("runtime", "system")), session: Session = Depends(get_db)):
    try:
        signal = build_learning_signal(session, capability_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    record = create_upgrade_request(session, signal=signal, thresholds=request.thresholds)
    if record is None:
        raise HTTPException(status_code=409, detail="Learning signal does not justify an upgrade")
    session.commit()
    return serialize_upgrade(record)


@router.get("/v1/upgrade-requests/{request_id}")
def upgrade_status(request_id: str, _claims=Depends(require_roles("runtime", "founder", "system")), session: Session = Depends(get_db)):
    record = session.get(UpgradeRequestDB, request_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Upgrade request not found")
    return serialize_upgrade(record)


@router.post("/v1/upgrade-requests/{request_id}/decision")
def decide_upgrade(request_id: str, request: FounderDecisionIn, claims=Depends(require_roles("founder")), session: Session = Depends(get_db)):
    record = session.get(UpgradeRequestDB, request_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Upgrade request not found")
    report = record.evaluation_report or evaluate_upgrade(metrics={"stability": 1, "compatibility": 1}, risk_level="high")
    apply_evaluation(record, report, founder_decision=request.decision, actor=claims.get("sub"))
    record.founder_decision = {**record.founder_decision, "rationale": request.rationale}
    session.commit()
    return serialize_upgrade(record)
