from sqlalchemy import Column, Integer, String

from app.database.base import Base


class StoreDB(Base):
    __tablename__ = "stores"

    id = Column(Integer, primary_key=True, index=True)
    store_code = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    platform = Column(String(50), nullable=False)
    owner = Column(String(100))
    status = Column(String(30), default="active")