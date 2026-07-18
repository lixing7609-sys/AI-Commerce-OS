from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.base import Base
from app.models.inventory_db import InventoryDB
from app.models.listing_db import ListingDB
from app.models.order_db import OrderDB
from app.models.product_db import ProductDB
from app.models.runtime_state_db import RuntimeStateDB
from app.models.store_db import StoreDB
from app.models.supplier_db import SupplierDB
from app.models.task_db import TaskDB


DATABASE_URL = (
    "postgresql+psycopg://"
    "n8n:password123@localhost:5432/ai_commerce_os"
)


engine = create_engine(
    DATABASE_URL,
    echo=True,
)


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def create_database_tables() -> None:
    """
    创建当前系统已经注册的数据库表。

    已存在的表不会重复创建。
    """

    Base.metadata.create_all(bind=engine)