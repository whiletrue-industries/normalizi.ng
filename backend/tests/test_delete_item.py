"""Tests for lib.delete_item."""
from __future__ import annotations

import json

from lib.delete_item import delete_item_handler


def test_options_returns_cors_headers(flask_request):
    resp = delete_item_handler(flask_request(method="OPTIONS"))
    assert resp.status_code == 200
    assert resp.headers["Access-Control-Allow-Origin"] == "*"


def test_non_post_returns_failure(flask_request):
    resp = delete_item_handler(flask_request(method="GET"))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


def test_missing_id_returns_failure(flask_request, patch_engine, make_connection):
    patch_engine(make_connection())
    resp = delete_item_handler(flask_request(method="POST"))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


def test_happy_path_authorized(flask_request, patch_engine, make_connection):
    conn = make_connection([[{"magic": "correct-magic"}]])
    patch_engine(conn)

    req = flask_request(method="POST", args={"id": "42", "magic": "correct-magic"})
    resp = delete_item_handler(req)

    assert json.loads(resp.get_data(as_text=True)) == {"success": True}
    assert len(conn.calls) == 2
    fetch_stmt, fetch_params = conn.calls[0]
    assert "SELECT magic" in str(fetch_stmt)
    assert fetch_params == {"id": 42}
    delete_stmt, delete_params = conn.calls[1]
    assert "UPDATE faces SET allowed=-1" in str(delete_stmt)
    assert delete_params == {"id": 42}
    assert conn.commits == 1


def test_wrong_magic_is_noop(flask_request, patch_engine, make_connection):
    """Security-critical: wrong magic must not delete."""
    conn = make_connection([[{"magic": "correct-magic"}]])
    patch_engine(conn)

    req = flask_request(method="POST", args={"id": "42", "magic": "attacker-magic"})
    resp = delete_item_handler(req)

    assert json.loads(resp.get_data(as_text=True)) == {"success": False}
    assert len(conn.calls) == 1
    assert conn.commits == 0


def test_nonexistent_id_returns_failure(flask_request, patch_engine, make_connection):
    patch_engine(make_connection([[]]))
    req = flask_request(method="POST", args={"id": "42", "magic": "any"})
    resp = delete_item_handler(req)
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}
