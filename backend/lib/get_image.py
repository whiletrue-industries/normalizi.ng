import json

from flask import Request, Response, abort
from sqlalchemy.sql import text

from .db import get_engine
from .net import HEADERS

fetch_image = text(
    """
    SELECT
        id, image, votes, tournaments,
        votes_0, tournaments_0,
        votes_1, tournaments_1,
        votes_2, tournaments_2,
        votes_3, tournaments_3,
        votes_4, tournaments_4,
        descriptor, landmarks, gender_age, place_name, created_timestamp, allowed
    FROM faces WHERE id = :id
    """
)


def get_image_handler(request: Request) -> Response:
    if request.method == "OPTIONS":
        return Response("", headers=HEADERS)
    if request.method != "GET":
        return Response(json.dumps({"success": False}), headers=HEADERS)

    try:
        id_ = int(request.values.get("id"))
    except (TypeError, ValueError):
        abort(400)

    with get_engine().connect() as connection:
        rows = connection.execute(fetch_image, {"id": id_})
        for row in rows:
            payload = dict(row._mapping)
            ts = payload.get("created_timestamp")
            if ts is not None:
                payload["created_timestamp"] = ts.isoformat()
            return Response(json.dumps(payload), headers=HEADERS)
    abort(404)
