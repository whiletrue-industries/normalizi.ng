import json

from flask import Request, Response
from sqlalchemy.sql import text

from .db import get_engine
from .net import HEADERS

fetch_random = text(
    """
    WITH a AS (
        SELECT id, image, votes, tournaments, descriptor, landmarks, gender_age, place_name, allowed
        FROM faces
        WHERE allowed > 0
        ORDER BY tournaments
        LIMIT 20
    )
    SELECT * FROM a ORDER BY RANDOM() LIMIT 10
    """
)


def get_game_handler(request: Request) -> Response:
    if request.method == "OPTIONS":
        return Response("", headers=HEADERS)
    if request.method != "GET":
        return Response(json.dumps({"success": False}), headers=HEADERS)

    with get_engine().connect() as connection:
        rows = connection.execute(fetch_random)
        result = [dict(row._mapping) for row in rows]
    return Response(json.dumps({"success": True, "records": result}), headers=HEADERS)
