from sqlalchemy import BigInteger, Column, DateTime, String, Text
from sqlalchemy.sql import func

from app.database.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    nim = Column(String(32), unique=True, nullable=True)
    password_hash = Column(Text, nullable=False)
    role = Column(String(30), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
