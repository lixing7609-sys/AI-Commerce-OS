from sqlalchemy import Column, Integer, String

from app.database.base import Base


class SupplierDB(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    supplier_code = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    contact = Column(String(100))
    phone = Column(String(50))
    status = Column(String(30), default="active")