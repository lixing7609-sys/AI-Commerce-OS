from app.database.db import SessionLocal
from app.models.supplier import Supplier
from app.models.supplier_create import SupplierCreate
from app.models.supplier_update import SupplierUpdate
from app.models.supplier_db import SupplierDB


class SupplierService:

    @staticmethod
    def get_all_suppliers():

        db = SessionLocal()

        try:

            suppliers = db.query(SupplierDB).all()

            result = []

            for supplier in suppliers:

                result.append(
                    Supplier(
                        id=supplier.supplier_code,
                        name=supplier.name,
                        contact=supplier.contact,
                        phone=supplier.phone,
                        status=supplier.status,
                    )
                )

            return result

        finally:

            db.close()

    @staticmethod
    def create_supplier(supplier: SupplierCreate):

        db = SessionLocal()

        try:

            db_supplier = SupplierDB(
                supplier_code=supplier.supplier_code,
                name=supplier.name,
                contact=supplier.contact,
                phone=supplier.phone,
            )

            db.add(db_supplier)
            db.commit()
            db.refresh(db_supplier)

            return Supplier(
                id=db_supplier.supplier_code,
                name=db_supplier.name,
                contact=db_supplier.contact,
                phone=db_supplier.phone,
                status=db_supplier.status,
            )

        finally:

            db.close()

    @staticmethod
    def update_supplier(
        supplier_code: str,
        supplier: SupplierUpdate,
    ):

        db = SessionLocal()

        try:

            db_supplier = (
                db.query(SupplierDB)
                .filter(
                    SupplierDB.supplier_code == supplier_code
                )
                .first()
            )

            if db_supplier is None:
                return None

            db_supplier.name = supplier.name
            db_supplier.contact = supplier.contact
            db_supplier.phone = supplier.phone
            db_supplier.status = supplier.status

            db.commit()
            db.refresh(db_supplier)

            return Supplier(
                id=db_supplier.supplier_code,
                name=db_supplier.name,
                contact=db_supplier.contact,
                phone=db_supplier.phone,
                status=db_supplier.status,
            )

        finally:

            db.close()

    @staticmethod
    def delete_supplier(supplier_code: str):

        db = SessionLocal()

        try:

            db_supplier = (
                db.query(SupplierDB)
                .filter(
                    SupplierDB.supplier_code == supplier_code
                )
                .first()
            )

            if db_supplier is None:
                return False

            db.delete(db_supplier)
            db.commit()

            return True

        finally:

            db.close()