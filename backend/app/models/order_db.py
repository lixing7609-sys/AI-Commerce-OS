from sqlalchemy import Column
from sqlalchemy import Float
from sqlalchemy import Integer
from sqlalchemy import String

from app.database.base import Base


class OrderDB(Base):

    __tablename__ = "orders"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    order_code = Column(
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
        nullable=False,
    )

    amount = Column(
        Float,
        nullable=False,
    )

    customer = Column(
        String(255),
        nullable=False,
    )

    status = Column(
        String(30),
        default="created",
    )