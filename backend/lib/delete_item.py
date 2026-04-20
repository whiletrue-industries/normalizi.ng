import json

from flask import Request, Response
from sqlalchemy.sql import text

from .db import get_engine
from .net import HEADERS

fetch_item = text("SELECT magic FROM faces WHERE id = :id")
delete_item = text("UPDATE faces SET allowed=-1 WHERE id = :id")


def delete_item_handler(request: Request) -> Response:
    if request.method == "OPTIONS":
        return Response("", headers=HEADERS)
    if request.method != "POST":
        return Response(json.dumps({"success": False}), headers=HEADERS)

    try:
        id_ = int(request.values.get("id"))
    except (TypeError, ValueError):
        return Response(json.dumps({"success": False}), headers=HEADERS)
    magic = request.values.get("magic")

    with get_engine().connect() as connection:
        rows = connection.execute(fetch_item, {"id": id_})
        for row in rows:
            if row._mapping["magic"] == magic:
                connection.execute(delete_item, {"id": id_})
                connection.commit()
                return Response(json.dumps({"success": True}), headers=HEADERS)
    return Response(json.dumps({"success": False}), headers=HEADERS)
