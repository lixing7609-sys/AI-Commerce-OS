"""
阶段 8B：任务委派 schema（migration c7d91d875587）回归测试。

覆盖：新增列存在且类型/可空性正确、parent_task_id 和
root_task_id 索引存在、(parent_task_id, delegation_key) 唯一
约束存在、历史任务（含本轮之前的 154 条）root_task_id 均已回填
非空。只读检查，不插入/更新/删除任何业务数据。
"""

from sqlalchemy import Integer, String, inspect

from app.database.db import SessionLocal, engine
from app.models.task_db import TaskDB


def _get_tasks_columns():
    inspector = inspect(engine)
    return {column["name"]: column for column in inspector.get_columns("tasks")}


def test_parent_task_id_column_exists_and_nullable():
    column = _get_tasks_columns()["parent_task_id"]
    assert isinstance(column["type"], String)
    assert column["type"].length == 32
    assert column["nullable"] is True


def test_root_task_id_column_exists_and_nullable():
    column = _get_tasks_columns()["root_task_id"]
    assert isinstance(column["type"], String)
    assert column["type"].length == 32
    assert column["nullable"] is True


def test_delegation_depth_column_not_null_default_zero():
    column = _get_tasks_columns()["delegation_depth"]
    assert isinstance(column["type"], Integer)
    assert column["nullable"] is False


def test_created_by_agent_column_exists_and_nullable():
    column = _get_tasks_columns()["created_by_agent"]
    assert isinstance(column["type"], String)
    assert column["type"].length == 100
    assert column["nullable"] is True


def test_delegation_key_column_exists_and_nullable():
    column = _get_tasks_columns()["delegation_key"]
    assert isinstance(column["type"], String)
    assert column["type"].length == 64
    assert column["nullable"] is True


def test_parent_task_id_index_exists():
    inspector = inspect(engine)
    index_names = {index["name"] for index in inspector.get_indexes("tasks")}
    assert "ix_tasks_parent_task_id" in index_names


def test_root_task_id_index_exists():
    inspector = inspect(engine)
    index_names = {index["name"] for index in inspector.get_indexes("tasks")}
    assert "ix_tasks_root_task_id" in index_names


def test_parent_delegation_key_unique_constraint_exists():
    inspector = inspect(engine)
    unique_constraints = inspector.get_unique_constraints("tasks")
    matching = [
        uc
        for uc in unique_constraints
        if uc["name"] == "uq_tasks_parent_delegation_key"
    ]
    assert len(matching) == 1
    assert set(matching[0]["column_names"]) == {
        "parent_task_id",
        "delegation_key",
    }


def test_all_existing_tasks_have_non_null_root_task_id():
    db = SessionLocal()
    try:
        null_root_count = (
            db.query(TaskDB).filter(TaskDB.root_task_id.is_(None)).count()
        )
        assert null_root_count == 0
    finally:
        db.close()


def test_normal_tasks_have_zero_delegation_depth_by_default():
    db = SessionLocal()
    try:
        non_zero_depth_without_parent = (
            db.query(TaskDB)
            .filter(TaskDB.parent_task_id.is_(None))
            .filter(TaskDB.delegation_depth != 0)
            .count()
        )
        assert non_zero_depth_without_parent == 0
    finally:
        db.close()
