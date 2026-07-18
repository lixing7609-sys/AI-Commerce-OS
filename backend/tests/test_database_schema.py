"""
数据库结构回归测试。

覆盖：

- products.status 列存在
- 类型为 VARCHAR(30)
- nullable=True
- server_default 已被移除（为 None）

不插入、不更新、不删除任何业务数据，仅做只读结构检查。
"""

from sqlalchemy import String, inspect

from app.database.db import engine


def _get_products_status_column():
    inspector = inspect(engine)

    for column in inspector.get_columns("products"):
        if column["name"] == "status":
            return column

    return None


def test_products_status_column_exists():
    column = _get_products_status_column()

    assert column is not None


def test_products_status_column_type_is_varchar_30():
    column = _get_products_status_column()

    assert isinstance(column["type"], String)
    assert column["type"].length == 30


def test_products_status_column_is_nullable():
    column = _get_products_status_column()

    assert column["nullable"] is True


def test_products_status_column_has_no_server_default():
    column = _get_products_status_column()

    assert column["default"] is None
