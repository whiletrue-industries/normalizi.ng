import json

from flask import Request, Response
from sqlalchemy.sql import text

from .db import get_engine
from .net import HEADERS

update_sql = text("UPDATE faces SET tournaments=tournaments+:t, votes=votes+:v WHERE id=:id")
per_feature_updates_sql = [
    text(f"UPDATE faces SET tournaments_{i}=tournaments_{i}+:t, votes_{i}=votes_{i}+:v WHERE id=:id")
    for i in range(5)
]


def game_results_handler(request: Request) -> Response:
    if request.method == "OPTIONS":
        return Response("", headers=HEADERS)
    if request.method != "POST":
        return Response(json.dumps({"success": False}), headers=HEADERS)

    content = request.json or {}
    results = content.get("results", [])
    updates: dict[int, dict] = {}
    for item in results:
        winner, loser, feature = tuple(item)
        updates.setdefault(winner, {"f": feature, "t": 0, "v": 0})["t"] += 1
        updates.setdefault(loser, {"f": feature, "t": 0, "v": 0})["t"] += 1
        updates[winner]["v"] += 1

    with get_engine().connect() as connection:
        for id_, update in updates.items():
            feature = update["f"]
            params = {"t": update["t"], "v": update["v"], "id": id_}
            connection.execute(update_sql, params)
            connection.execute(per_feature_updates_sql[feature], params)
        connection.commit()

    return Response(json.dumps({"success": True, "updated": len(updates)}), headers=HEADERS)
