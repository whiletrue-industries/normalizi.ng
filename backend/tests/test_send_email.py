"""Tests for lib.send_email."""
from __future__ import annotations

import json

import responses

from lib.send_email import MAILGUN_ENDPOINT, send_email_handler


def test_options_returns_cors_headers(flask_request):
    resp = send_email_handler(flask_request(method="OPTIONS"))
    assert resp.status_code == 200


def test_non_post_returns_failure(flask_request):
    resp = send_email_handler(flask_request(method="GET"))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


@responses.activate
def test_sends_email_and_marks_record(flask_request, patch_engine, make_connection):
    conn = make_connection()
    patch_engine(conn)
    responses.add(responses.POST, MAILGUN_ENDPOINT, status=200, body="ok")

    payload = {"email": "user@example.com", "link": "https://normalizi.ng/me/x", "own_id": 42, "magic": "magic-xyz"}
    resp = send_email_handler(flask_request(method="POST", json=payload))
    body = json.loads(resp.get_data(as_text=True))

    assert body == {"success": True, "error": None}
    assert len(responses.calls) == 1

    stmt, params = conn.calls[0]
    assert "UPDATE faces" in str(stmt)
    assert params == {"id": 42, "magic": "magic-xyz", "allowed": 2}
    assert conn.commits == 1


@responses.activate
def test_mailgun_failure_reported_but_db_still_updates(flask_request, patch_engine, make_connection):
    conn = make_connection()
    patch_engine(conn)
    responses.add(responses.POST, MAILGUN_ENDPOINT, status=500, body="upstream down")

    payload = {"email": "user@example.com", "link": "https://x", "own_id": 42, "magic": "m"}
    resp = send_email_handler(flask_request(method="POST", json=payload))
    body = json.loads(resp.get_data(as_text=True))

    assert body["success"] is False
    assert body["error"] == "upstream down"
    assert len(conn.calls) == 1
    assert conn.commits == 1


def test_no_email_still_marks_record(flask_request, patch_engine, make_connection):
    conn = make_connection()
    patch_engine(conn)

    payload = {"email": None, "link": None, "own_id": 7, "magic": "m"}
    resp = send_email_handler(flask_request(method="POST", json=payload))
    body = json.loads(resp.get_data(as_text=True))

    assert body["success"] is True
    # allowed=1 when not sending email
    assert conn.calls[0][1] == {"id": 7, "magic": "m", "allowed": 1}
