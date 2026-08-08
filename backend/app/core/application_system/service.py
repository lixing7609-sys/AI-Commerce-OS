from sqlalchemy import select

from app.core.application_system.model import ApplicationSystemDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


def list_application_systems() -> list[ApplicationSystemDB]:
    with SessionLocal() as session:
        return list(session.scalars(select(ApplicationSystemDB).order_by(ApplicationSystemDB.system_key)))


def get_application_system(system_id: str) -> ApplicationSystemDB | None:
    with SessionLocal() as session:
        return session.get(ApplicationSystemDB, system_id)
