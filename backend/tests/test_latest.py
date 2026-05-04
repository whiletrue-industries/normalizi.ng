"""Tests for lib.latest."""
from __future__ import annotations

import datetime as dt
import json

from lib.latest import get_latest_handler

BASE_ROW = {
    "id": 1, "image": "img1", "votes": 0, "tournaments": 0,
    "votes_0": 0, "tournaments_0": 0, "votes_1": 0, "tournaments_1": 0,
    "votes_2": 0, "tournaments_2": 0, "votes_3": 0, "tournaments_3": 0,
    "votes_4": 0, "tournaments_4": 0,
    "descriptor": [], "landmarks": [], "gender_age": {},
    "place_name": "", "created_timestamp": dt.datetime(2026, 1, 1),
    "last_shown_1": None, "last_shown_2": None,
}


def test_options_returns_cors_headers(flask_request):
    resp = get_latest_handler(flask_request(method="OPTIONS"))
    assert resp.status_code == 200


def test_non_get_returns_failure(flask_request):
    resp = get_latest_handler(flask_request(method="POST"))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


def test_returns_new_record_when_available(flask_request, patch_engine, make_connection):
    conn = make_connection([[BASE_ROW]])
    patch_engine(conn)
    resp = get_latest_handler(flask_request(method="GET"))
    payload = json.loads(resp.get_data(as_text=True))

    assert payload["success"] is True
    assert payload["record"]["id"] == 1
    # Only the "new" query is executed (no fallback to "any").
    assert len(conn.calls) == 1
    assert "last_shown_1 IS NULL" in str(conn.calls[0][0])


def test_falls_back_to_any_when_no_new(flask_request, patch_engine, make_connection):
    conn = make_connection([[], [BASE_ROW]])
    patch_engine(conn)
    resp = get_latest_handler(flask_request(method="GET"))
    payload = json.loads(resp.get_data(as_text=True))
    assert payload["success"] is True
    assert len(conn.calls) == 2
    assert "last_shown_1 IS NOT NULL" in str(conn.calls[1][0])


def test_returns_failure_when_no_records(flask_request, patch_engine, make_connection):
    conn = make_connection([[], []])
    patch_engine(conn)
    resp = get_latest_handler(flask_request(method="GET"))
    payload = json.loads(resp.get_data(as_text=True))
    assert payload == {"success": False, "record": None}


def test_update_key_triggers_timestamp_update(flask_request, patch_engine, make_connection, monkeypatch):
    monkeypatch.setenv("UPDATE_KEY_1", "secret-1")
    conn = make_connection([[BASE_ROW]])
    patch_engine(conn)
    resp = get_latest_handler(flask_request(method="GET", args={"key": "secret-1"}))
    payload = json.loads(resp.get_data(as_text=True))
    assert payload["success"] is True
    # SELECT + UPDATE
    assert len(conn.calls) == 2
    update_stmt, update_params = conn.calls[1]
    assert "UPDATE faces SET last_shown_1=now()" in str(update_stmt)
    assert update_params == {"id": 1}
    assert conn.commits == 1


def test_update_key_idx_2(flask_request, patch_engine, make_connection, monkeypatch):
    monkeypatch.setenv("UPDATE_KEY_2", "secret-2")
    conn = make_connection([[BASE_ROW]])
    patch_engine(conn)
    resp = get_latest_handler(flask_request(method="GET", args={"key": "secret-2"}))
    assert json.loads(resp.get_data(as_text=True))["success"] is True
    update_stmt = str(conn.calls[1][0])
    assert "last_shown_2" in update_stmt


def test_wrong_key_does_not_update(flask_request, patch_engine, make_connection, monkeypatch):
    monkeypatch.setenv("UPDATE_KEY_1", "secret-1")
    conn = make_connection([[BASE_ROW]])
    patch_engine(conn)
    resp = get_latest_handler(flask_request(method="GET", args={"key": "wrong"}))
    assert json.loads(resp.get_data(as_text=True))["success"] is True
    # Only SELECT, no UPDATE.
    assert len(conn.calls) == 1
    assert conn.commits == 0
