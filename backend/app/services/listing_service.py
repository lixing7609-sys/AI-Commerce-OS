from app.database.db import SessionLocal
from app.models.listing import Listing
from app.models.listing_create import ListingCreate
from app.models.listing_update import ListingUpdate
from app.models.listing_db import ListingDB


class ListingService:

    @staticmethod
    def get_all_listings():

        db = SessionLocal()

        try:

            listings = db.query(ListingDB).all()

            result = []

            for listing in listings:

                result.append(
                    Listing(
                        id=listing.listing_code,
                        product_code=listing.product_code,
                        store_code=listing.store_code,
                        platform=listing.platform,
                        title=listing.title,
                        price=float(listing.price),
                        status=listing.status,
                    )
                )

            return result

        finally:

            db.close()

    @staticmethod
    def create_listing(listing: ListingCreate):

        db = SessionLocal()

        try:

            db_listing = ListingDB(
                listing_code=f"LST-{listing.product_code}-{listing.store_code}",
                product_code=listing.product_code,
                store_code=listing.store_code,
                platform=listing.platform,
                title=listing.title,
                price=listing.price,
                status="draft",
            )

            db.add(db_listing)
            db.commit()
            db.refresh(db_listing)

            return Listing(
                id=db_listing.listing_code,
                product_code=db_listing.product_code,
                store_code=db_listing.store_code,
                platform=db_listing.platform,
                title=db_listing.title,
                price=float(db_listing.price),
                status=db_listing.status,
            )

        finally:

            db.close()

    @staticmethod
    def update_listing(
        listing_code: str,
        listing: ListingUpdate,
    ):

        db = SessionLocal()

        try:

            db_listing = (
                db.query(ListingDB)
                .filter(ListingDB.listing_code == listing_code)
                .first()
            )

            if db_listing is None:
                return None

            db_listing.title = listing.title
            db_listing.price = listing.price
            db_listing.status = listing.status

            db.commit()
            db.refresh(db_listing)

            return Listing(
                id=db_listing.listing_code,
                product_code=db_listing.product_code,
                store_code=db_listing.store_code,
                platform=db_listing.platform,
                title=db_listing.title,
                price=float(db_listing.price),
                status=db_listing.status,
            )

        finally:

            db.close()

    @staticmethod
    def delete_listing(listing_code: str):

        db = SessionLocal()

        try:

            db_listing = (
                db.query(ListingDB)
                .filter(ListingDB.listing_code == listing_code)
                .first()
            )

            if db_listing is None:
                return False

            db.delete(db_listing)
            db.commit()

            return True

        finally:

            db.close()