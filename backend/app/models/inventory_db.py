from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String

from app.database.base import Base


class InventoryDB(Base):

    __tablename__ = "inventories"

    id = Column(Integer, primary_key=True, index=True)

    inventory_code = Column(
        String(50),
        unique=True,
        nullable=False,
    )

    listing_code = Column(
        String(50),
        nullable=False,
    )

    quantity = Column(
        Integer,
        default=0,
    )

    reserved = Column(
        Integer,
        default=0,
    )

    available = Column(
        Integer,
        default=0,
    )

    warehouse = Column(
        String(100),
        nullable=False,
    )

    status = Column(
        String(30),
        default="active",
    )