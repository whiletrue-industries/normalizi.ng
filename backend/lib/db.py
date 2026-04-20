import os
from functools import cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


@cache
def get_engine() -> Engine:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return create_engine(url, future=True)
