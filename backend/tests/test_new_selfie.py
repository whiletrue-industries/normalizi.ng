"""Tests for lib.new_selfie."""
from __future__ import annotations

import json
from unittest.mock import MagicMock

from lib.new_selfie import new_selfie_handler


def test_options_returns_cors_headers(flask_request):
    resp = new_selfie_handler(flask_request(method="OPTIONS"))
    assert resp.status_code == 200


def test_non_post_returns_failure(flask_request):
    resp = new_selfie_handler(flask_request(method="GET"))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


def test_missing_image_returns_failure(flask_request):
    resp = new_selfie_handler(flask_request(method="POST", json={}))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


def test_wrong_image_prefix_returns_failure(flask_request):
    resp = new_selfie_handler(flask_request(method="POST", json={"image": "data:image/jpeg;base64,xx"}))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


def test_happy_path_inserts_new(
    flask_request, patch_engine, make_connection, sample_selfie_payload, mock_s3_upload, mock_geocoder
):
    conn = make_connection([[{"id": 99}]])
    conn._results[0]._rows[0]._mapping = {"id": 99}
    # First execute call returns RETURNING id from insert
    patch_engine(conn)

    resp = new_selfie_handler(flask_request(method="POST", json=sample_selfie_payload))
    body = json.loads(resp.get_data(as_text=True))

    assert body["success"] is True
    assert body["id"] == 99
    assert "image" in body
    assert "magic" in body

    # Two S3 uploads: _full.png and _face.png
    assert len(mock_s3_upload) == 2
    assert mock_s3_upload[0]["filename"].endswith("_full.png")
    assert mock_s3_upload[1]["filename"].endswith("_face.png")
    assert mock_s3_upload[0]["content_type"] == "image/png"

    # Exactly one DB call: the INSERT
    assert len(conn.calls) == 1
    stmt, params = conn.calls[0]
    assert "INSERT INTO faces" in str(stmt)
    assert params["place_name"] == "Tel Aviv, Israel"
    assert conn.commits == 1


def test_happy_path_updates_existing(
    flask_request, patch_engine, make_connection, sample_selfie_payload, mock_s3_upload, mock_geocoder
):
    # First call: SELECT returning correct magic. Second call: UPDATE.
    conn = make_connection([[{"magic": "existing-magic"}]])
    patch_engine(conn)

    payload = {**sample_selfie_payload, "id": 77, "magic": "existing-magic"}
    resp = new_selfie_handler(flask_request(method="POST", json=payload))
    body = json.loads(resp.get_data(as_text=True))

    assert body["success"] is True
    assert body["id"] == 77
    # Two DB calls: SELECT magic + UPDATE
    assert len(conn.calls) == 2
    update_stmt = str(conn.calls[1][0])
    assert "UPDATE faces SET image" in update_stmt
    assert conn.commits == 1


def test_wrong_magic_falls_through_to_insert(
    flask_request, patch_engine, make_connection, sample_selfie_payload, mock_s3_upload, mock_geocoder
):
    """If caller provides id+magic but magic doesn't match, the handler inserts a new row."""
    conn = make_connection([[{"magic": "other-magic"}], [{"id": 123}]])
    patch_engine(conn)

    payload = {**sample_selfie_payload, "id": 77, "magic": "attacker-magic"}
    resp = new_selfie_handler(flask_request(method="POST", json=payload))
    body = json.loads(resp.get_data(as_text=True))
    assert body["success"] is True
    assert body["id"] == 123


def test_upload_failure_returns_error(
    flask_request, patch_engine, make_connection, sample_selfie_payload, mock_s3_upload, monkeypatch
):
    import lib.new_selfie as ns

    monkeypatch.setattr(ns, "upload_fileobj_s3", lambda *a, **kw: False)
    patch_engine(make_connection())

    resp = new_selfie_handler(flask_request(method="POST", json=sample_selfie_payload))
    body = json.loads(resp.get_data(as_text=True))
    assert body["success"] is False


def test_geocoding_falls_back_to_lat_lon_on_error(
    flask_request, patch_engine, make_connection, sample_selfie_payload, mock_s3_upload, monkeypatch
):
    from geopy.exc import GeocoderTimedOut

    import lib.new_selfie as ns

    failing_geocoder = MagicMock()
    failing_geocoder.reverse.side_effect = GeocoderTimedOut()
    monkeypatch.setattr(ns, "GoogleV3", MagicMock(return_value=failing_geocoder))

    conn = make_connection([[{"id": 1}]])
    patch_engine(conn)

    resp = new_selfie_handler(flask_request(method="POST", json=sample_selfie_payload))
    body = json.loads(resp.get_data(as_text=True))
    assert body["success"] is True

    insert_params = conn.calls[0][1]
    # Falls back to "lat, lon" when geocoder fails.
    assert insert_params["place_name"] == "32.08, 34.78"
