from sqlalchemy.orm import declarative_base


# The domain layer may depend on this database primitive, but never on app.*.
Base = declarative_base()
