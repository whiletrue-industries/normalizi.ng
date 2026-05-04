import json
import logging
import os

from flask import Request, Response
from sqlalchemy.sql import text

from .db import get_engine
from .net import HEADERS

logging.getLogger().setLevel(logging.INFO)


def _update_keys() -> dict[int, str | None]:
    return {
        1: os.environ.get("UPDATE_KEY_1") or os.environ.get("UPDATE_KEY"),
        2: os.environ.get("UPDATE_KEY_2"),
    }


_QUERY_NEW = """
    SELECT id, image, votes, tournaments,
        votes_0, tournaments_0,
        votes_1, tournaments_1,
        votes_2, tournaments_2,
        votes_3, tournaments_3,
        votes_4, tournaments_4,
        descriptor, landmarks, gender_age, place_name, created_timestamp,
        last_shown_1, last_shown_2
    FROM faces
    WHERE last_shown_{idx} IS NULL AND allowed > 0
    ORDER BY id ASC
    LIMIT 1
"""
_QUERY_ANY = """
    SELECT id, image, votes, tournaments,
        votes_0, tournaments_0,
        votes_1, tournaments_1,
        votes_2, tournaments_2,
        votes_3, tournaments_3,
        votes_4, tournaments_4,
        descriptor, landmarks, gender_age, place_name, created_timestamp,
        last_shown_1, last_shown_2
    FROM faces
    WHERE last_shown_{idx} IS NOT NULL AND allowed > 0
    ORDER BY last_shown_{idx} ASC
    LIMIT 1
"""
_UPDATE = "UPDATE faces SET last_shown_{idx}=now() WHERE id=:id"


def _first_row(result):
    for row in result:
        return dict(row._mapping)
    return None


def get_latest_handler(request: Request) -> Response:
    if request.method == "OPTIONS":
        return Response("", headers=HEADERS)
    if request.method != "GET":
        return Response(json.dumps({"success": False}), headers=HEADERS)

    idx = 1
    update_key = request.args.get("key")
    found_update_key = None
    for k, v in _update_keys().items():
        if v is not None and v == update_key:
            idx = k
            found_update_key = v
            break
    # idx is one of 1 or 2 — safe to interpolate into SQL template.
    if idx not in (1, 2):
        idx = 1

    with get_engine().connect() as connection:
        result = _first_row(connection.execute(text(_QUERY_NEW.format(idx=idx))))
        if result is None:
            result = _first_row(connection.execute(text(_QUERY_ANY.format(idx=idx))))

        last_shown = None
        if result is not None:
            last_shown = [result.pop("last_shown_1"), result.pop("last_shown_2")]
        if result and found_update_key is not None:
            logging.info("UPDATING %s WITH KEY %s (last_shown=%s)", idx, found_update_key, last_shown)
            connection.execute(text(_UPDATE.format(idx=idx)), {"id": result["id"]})
            connection.commit()

    if result is not None:
        ts = result.get("created_timestamp")
        if ts is not None:
            result["created_timestamp"] = ts.isoformat()

    response = Response(
        json.dumps({"success": result is not None, "record": result}),
        headers=HEADERS,
    )
    response.cache_control.max_age = 10
    return response
