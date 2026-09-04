import pytest
from sqlalchemy import text

from app.database.config import (
    PRODUCTION_DATABASE_NAME,
    TEST_DATABASE_NAME,
    UnsafeTestDatabaseError,
    resolve_database_runtime_config,
)
from app.database.db import DATABASE_RUNTIME_CONFIG, SessionLocal


def test_pytest_global_session_uses_exact_isolated_postgres_database():
    assert DATABASE_RUNTIME_CONFIG.testing is True
    assert DATABASE_RUNTIME_CONFIG.database_name == TEST_DATABASE_NAME
    with SessionLocal() as session:
        assert session.execute(text("select current_database()" )).scalar_one() == TEST_DATABASE_NAME


def test_testing_mode_rejects_production_database_before_engine_creation():
    with pytest.raises(UnsafeTestDatabaseError, match=f"postgresql:{PRODUCTION_DATABASE_NAME}"):
        resolve_database_runtime_config({
            "AI_COMMERCE_TESTING": "1",
            "DATABASE_URL": "postgresql+psycopg://user:secret@localhost:5432/ai_commerce_os",
        })


def test_testing_mode_rejects_similarly_named_or_non_postgres_database():
    for url in (
        "postgresql+psycopg://user:secret@localhost:5432/ai_commerce_os_test_copy",
        "sqlite:///ai_commerce_os_test",
    ):
        with pytest.raises(UnsafeTestDatabaseError):
            resolve_database_runtime_config({"AI_COMMERCE_TESTING": "1", "DATABASE_URL": url})


def test_production_runtime_default_remains_production_database():
    config = resolve_database_runtime_config({})
    assert config.testing is False
    assert config.database_name == PRODUCTION_DATABASE_NAME
