from fastapi import APIRouter, Depends

from app.core.edition import Edition, require_edition
from app.services.dashboard_service import DashboardService

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)


@router.get("")
def get_dashboard():
    return DashboardService.get_dashboard()


@router.get("/summary")
def get_dashboard_summary():
    return DashboardService.get_summary()