"""Tests for lib.get_image."""
from __future__ import annotations

import datetime as dt
import json

import pytest
from werkzeug.exceptions import HTTPException

from lib.get_image import get_image_handler


def test_options_returns_cors_headers(flask_request):
    resp = get_image_handler(flask_request(method="OPTIONS"))
    assert resp.status_code == 200


def test_non_get_returns_failure(flask_request):
    resp = get_image_handler(flask_request(method="POST"))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


def test_invalid_id_returns_400(flask_request, patch_engine, make_connection):
    patch_engine(make_connection())
    with pytest.raises(HTTPException) as ei:
        get_image_handler(flask_request(method="GET", args={"id": "not-a-number"}))
    assert ei.value.code == 400


def test_nonexistent_id_returns_404(flask_request, patch_engine, make_connection):
    patch_engine(make_connection([[]]))
    with pytest.raises(HTTPException) as ei:
        get_image_handler(flask_request(method="GET", args={"id": "99"}))
    assert ei.value.code == 404


def test_happy_path(flask_request, patch_engine, make_connection):
    ts = dt.datetime(2026, 1, 2, 3, 4, 5)
    row = {
        "id": 1, "image": "img1", "votes": 2, "tournaments": 3,
        "votes_0": 0, "tournaments_0": 0, "votes_1": 0, "tournaments_1": 0,
        "votes_2": 0, "tournaments_2": 0, "votes_3": 0, "tournaments_3": 0,
        "votes_4": 0, "tournaments_4": 0,
        "descriptor": [], "landmarks": [], "gender_age": {},
        "place_name": "NYC", "created_timestamp": ts,
    }
    conn = make_connection([[row]])
    patch_engine(conn)

    resp = get_image_handler(flask_request(method="GET", args={"id": "1"}))
    payload = json.loads(resp.get_data(as_text=True))
    assert payload["id"] == 1
    assert payload["created_timestamp"] == ts.isoformat()

    _stmt, params = conn.calls[0]
    assert params == {"id": 1}
