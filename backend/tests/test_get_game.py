"""Tests for lib.get_game."""
from __future__ import annotations

import json

from lib.get_game import get_game_handler


def test_options_returns_cors_headers(flask_request):
    resp = get_game_handler(flask_request(method="OPTIONS"))
    assert resp.status_code == 200
    assert resp.headers["Access-Control-Allow-Origin"] == "*"


def test_non_get_returns_failure(flask_request):
    resp = get_game_handler(flask_request(method="POST"))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


def test_returns_records_from_db(flask_request, patch_engine, make_connection):
    canned = [
        {"id": 1, "image": "abc", "votes": 0, "tournaments": 0, "descriptor": [], "landmarks": [],
         "gender_age": {}, "place_name": "", "allowed": 1},
        {"id": 2, "image": "def", "votes": 3, "tournaments": 5, "descriptor": [], "landmarks": [],
         "gender_age": {}, "place_name": "Tel Aviv", "allowed": 1},
    ]
    conn = make_connection([canned])
    patch_engine(conn)

    resp = get_game_handler(flask_request(method="GET"))
    payload = json.loads(resp.get_data(as_text=True))

    assert payload["success"] is True
    assert len(payload["records"]) == 2
    assert payload["records"][0]["id"] == 1
    assert payload["records"][1]["place_name"] == "Tel Aviv"

    stmt, params = conn.calls[0]
    sql_text = str(stmt)
    assert "ORDER BY RANDOM()" in sql_text
    assert "allowed > 0" in sql_text
    assert params is None


def test_empty_db_returns_empty_records(flask_request, patch_engine, make_connection):
    patch_engine(make_connection([[]]))
    resp = get_game_handler(flask_request(method="GET"))
    payload = json.loads(resp.get_data(as_text=True))
    assert payload == {"success": True, "records": []}
