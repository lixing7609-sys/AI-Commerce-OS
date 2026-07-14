from sqlalchemy import Column, Integer, Numeric, String

from app.database.base import Base


class ProductDB(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    product_code = Column(String(50), unique=True, nullable=False)
    title = Column(String(255), nullable=False)
    platform = Column(String(50))
    price = Column(Numeric(10, 2))
    status = Column(String(30))