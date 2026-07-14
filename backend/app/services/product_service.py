from app.database.db import SessionLocal
from app.models.product import Product
from app.models.product_create import ProductCreate
from app.models.product_update import ProductUpdate
from app.models.product_db import ProductDB


class ProductService:

    @staticmethod
    def get_demo_product():

        db = SessionLocal()

        try:

            product = db.query(ProductDB).first()

            return Product(
                id=product.product_code,
                title=product.title,
                price=float(product.price),
                platform=product.platform,
            )

        finally:

            db.close()

    @staticmethod
    def get_all_products():

        db = SessionLocal()

        try:

            products = db.query(ProductDB).all()

            result = []

            for product in products:

                result.append(
                    Product(
                        id=product.product_code,
                        title=product.title,
                        price=float(product.price),
                        platform=product.platform,
                    )
                )

            return result

        finally:

            db.close()

    @staticmethod
    def create_product(product: ProductCreate):

        db = SessionLocal()

        try:

            db_product = ProductDB(
                product_code=product.product_code,
                title=product.title,
                platform=product.platform,
                price=product.price,
            )

            db.add(db_product)
            db.commit()
            db.refresh(db_product)

            return Product(
                id=db_product.product_code,
                title=db_product.title,
                price=float(db_product.price),
                platform=db_product.platform,
            )

        finally:

            db.close()
    

    @staticmethod
    def update_product(product_code: str, product: ProductUpdate):

        db = SessionLocal()

        try:

            db_product = (
                db.query(ProductDB)
                .filter(ProductDB.product_code == product_code)
                .first()
            )

            if db_product is None:
                return None

            db_product.title = product.title
            db_product.platform = product.platform
            db_product.price = product.price

            db.commit()
            db.refresh(db_product)

            return Product(
                id=db_product.product_code,
                title=db_product.title,
                price=float(db_product.price),
                platform=db_product.platform,
            )

        finally:

            db.close()

    @staticmethod
    def delete_product(product_code: str):

        db = SessionLocal()

        try:

            db_product = (
                db.query(ProductDB)
                .filter(ProductDB.product_code == product_code)
                .first()
            )

            if db_product is None:
                return False

            db.delete(db_product)
            db.commit()

            return True

        finally:

            db.close()