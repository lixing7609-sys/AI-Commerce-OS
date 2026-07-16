from app.database.db import SessionLocal
from app.models.order import Order
from app.models.order_create import OrderCreate
from app.models.order_update import OrderUpdate
from app.models.order_db import OrderDB


class OrderService:

    @staticmethod
    def get_all_orders():

        db = SessionLocal()

        try:

            orders = db.query(OrderDB).all()

            result = []

            for order in orders:

                result.append(
                    Order(
                        id=order.order_code,
                        order_code=order.order_code,
                        listing_code=order.listing_code,
                        quantity=order.quantity,
                        amount=float(order.amount),
                        customer=order.customer,
                        status=order.status,
                    )
                )

            return result

        finally:

            db.close()

    @staticmethod
    def create_order(order: OrderCreate):

        db = SessionLocal()

        try:

            db_order = OrderDB(
                order_code=f"ORD-{order.listing_code}",
                listing_code=order.listing_code,
                quantity=order.quantity,
                amount=order.amount,
                customer=order.customer,
                status="created",
            )

            db.add(db_order)
            db.commit()
            db.refresh(db_order)

            return Order(
                id=db_order.order_code,
                order_code=db_order.order_code,
                listing_code=db_order.listing_code,
                quantity=db_order.quantity,
                amount=float(db_order.amount),
                customer=db_order.customer,
                status=db_order.status,
            )

        finally:

            db.close()

    @staticmethod
    def update_order(
        order_code: str,
        order: OrderUpdate,
    ):

        db = SessionLocal()

        try:

            db_order = (
                db.query(OrderDB)
                .filter(OrderDB.order_code == order_code)
                .first()
            )

            if db_order is None:
                return None

            db_order.quantity = order.quantity
            db_order.amount = order.amount
            db_order.status = order.status

            db.commit()
            db.refresh(db_order)

            return Order(
                id=db_order.order_code,
                order_code=db_order.order_code,
                listing_code=db_order.listing_code,
                quantity=db_order.quantity,
                amount=float(db_order.amount),
                customer=db_order.customer,
                status=db_order.status,
            )

        finally:

            db.close()

    @staticmethod
    def delete_order(order_code: str):

        db = SessionLocal()

        try:

            db_order = (
                db.query(OrderDB)
                .filter(OrderDB.order_code == order_code)
                .first()
            )

            if db_order is None:
                return False

            db.delete(db_order)
            db.commit()

            return True

        finally:

            db.close()