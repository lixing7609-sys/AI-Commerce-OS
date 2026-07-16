from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import Numeric
from sqlalchemy import String

from app.database.base import Base


class ListingDB(Base):

    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)

    listing_code = Column(
        String(50),
        unique=True,
        nullable=False,
    )

    product_code = Column(
        String(50),
        nullable=False,
    )

    store_code = Column(
        String(50),
        nullable=False,
    )

    platform = Column(
        String(50),
        nullable=False,
    )

    title = Column(
        String(255),
        nullable=False,
    )

    price = Column(
        Numeric(10, 2),
    )

    status = Column(
        String(30),
        default="draft",
    )