from app.database.db import SessionLocal
from app.models.inventory import Inventory
from app.models.inventory_create import InventoryCreate
from app.models.inventory_update import InventoryUpdate
from app.models.inventory_db import InventoryDB


class InventoryService:

    @staticmethod
    def get_all_inventory():

        db = SessionLocal()

        try:

            inventories = db.query(InventoryDB).all()

            result = []

            for inventory in inventories:

                result.append(
                    Inventory(
                        id=inventory.inventory_code,
                        listing_code=inventory.listing_code,
                        quantity=inventory.quantity,
                        reserved=inventory.reserved,
                        available=inventory.available,
                        warehouse=inventory.warehouse,
                        status=inventory.status,
                    )
                )

            return result

        finally:

            db.close()

    @staticmethod
    def create_inventory(inventory: InventoryCreate):

        db = SessionLocal()

        try:

            db_inventory = InventoryDB(
                inventory_code=f"INV-{inventory.listing_code}",
                listing_code=inventory.listing_code,
                quantity=inventory.quantity,
                reserved=0,
                available=inventory.quantity,
                warehouse=inventory.warehouse,
                status="active",
            )

            db.add(db_inventory)
            db.commit()
            db.refresh(db_inventory)

            return Inventory(
                id=db_inventory.inventory_code,
                listing_code=db_inventory.listing_code,
                quantity=db_inventory.quantity,
                reserved=db_inventory.reserved,
                available=db_inventory.available,
                warehouse=db_inventory.warehouse,
                status=db_inventory.status,
            )

        finally:

            db.close()

    @staticmethod
    def update_inventory(
        inventory_code: str,
        inventory: InventoryUpdate,
    ):

        db = SessionLocal()

        try:

            db_inventory = (
                db.query(InventoryDB)
                .filter(InventoryDB.inventory_code == inventory_code)
                .first()
            )

            if db_inventory is None:
                return None

            db_inventory.quantity = inventory.quantity
            db_inventory.reserved = inventory.reserved
            db_inventory.available = inventory.available
            db_inventory.status = inventory.status

            db.commit()
            db.refresh(db_inventory)

            return Inventory(
                id=db_inventory.inventory_code,
                listing_code=db_inventory.listing_code,
                quantity=db_inventory.quantity,
                reserved=db_inventory.reserved,
                available=db_inventory.available,
                warehouse=db_inventory.warehouse,
                status=db_inventory.status,
            )

        finally:

            db.close()

    @staticmethod
    def delete_inventory(inventory_code: str):

        db = SessionLocal()

        try:

            db_inventory = (
                db.query(InventoryDB)
                .filter(InventoryDB.inventory_code == inventory_code)
                .first()
            )

            if db_inventory is None:
                return False

            db.delete(db_inventory)
            db.commit()

            return True

        finally:

            db.close()