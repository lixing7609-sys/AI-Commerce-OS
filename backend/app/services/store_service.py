from app.database.db import SessionLocal
from app.models.store import Store
from app.models.store_create import StoreCreate
from app.models.store_update import StoreUpdate
from app.models.store_db import StoreDB


class StoreService:

    @staticmethod
    def get_all_stores():

        db = SessionLocal()

        try:

            stores = db.query(StoreDB).all()

            result = []

            for store in stores:

                result.append(
                    Store(
                        id=store.store_code,
                        name=store.name,
                        platform=store.platform,
                        owner=store.owner,
                        status=store.status,
                    )
                )

            return result

        finally:

            db.close()

    @staticmethod
    def create_store(store: StoreCreate):

        db = SessionLocal()

        try:

            db_store = StoreDB(
                store_code=store.store_code,
                name=store.name,
                platform=store.platform,
                owner=store.owner,
                status="active",
            )

            db.add(db_store)
            db.commit()
            db.refresh(db_store)

            return Store(
                id=db_store.store_code,
                name=db_store.name,
                platform=db_store.platform,
                owner=db_store.owner,
                status=db_store.status,
            )

        finally:

            db.close()

    @staticmethod
    def update_store(store_code: str, store: StoreUpdate):

        db = SessionLocal()

        try:

            db_store = (
                db.query(StoreDB)
                .filter(StoreDB.store_code == store_code)
                .first()
            )

            if db_store is None:
                return None

            db_store.name = store.name
            db_store.platform = store.platform
            db_store.owner = store.owner
            db_store.status = store.status

            db.commit()
            db.refresh(db_store)

            return Store(
                id=db_store.store_code,
                name=db_store.name,
                platform=db_store.platform,
                owner=db_store.owner,
                status=db_store.status,
            )

        finally:

            db.close()

    @staticmethod
    def delete_store(store_code: str):

        db = SessionLocal()

        try:

            db_store = (
                db.query(StoreDB)
                .filter(StoreDB.store_code == store_code)
                .first()
            )

            if db_store is None:
                return False

            db.delete(db_store)
            db.commit()

            return True

        finally:

            db.close()