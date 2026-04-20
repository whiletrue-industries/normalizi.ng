"""Tests for lib.game_results."""
from __future__ import annotations

import json

from lib.game_results import game_results_handler


def test_options_returns_cors_headers(flask_request):
    resp = game_results_handler(flask_request(method="OPTIONS"))
    assert resp.status_code == 200


def test_non_post_returns_failure(flask_request):
    resp = game_results_handler(flask_request(method="GET"))
    assert json.loads(resp.get_data(as_text=True)) == {"success": False}


def test_empty_results_commits_nothing(flask_request, patch_engine, make_connection):
    conn = make_connection()
    patch_engine(conn)
    resp = game_results_handler(flask_request(method="POST", json={"results": []}))
    payload = json.loads(resp.get_data(as_text=True))
    assert payload == {"success": True, "updated": 0}
    assert conn.calls == []
    assert conn.commits == 1


def test_aggregates_and_executes_per_match(flask_request, patch_engine, make_connection):
    """Winner, loser, feature tuples accumulate into per-face updates + per-feature updates."""
    conn = make_connection()
    patch_engine(conn)

    results = [
        [1, 2, 0],  # 1 beats 2, feature 0
        [1, 3, 0],  # 1 beats 3, feature 0
        [4, 2, 3],  # 4 beats 2, feature 3
    ]
    resp = game_results_handler(flask_request(method="POST", json={"results": results}))
    payload = json.loads(resp.get_data(as_text=True))

    assert payload["success"] is True
    assert payload["updated"] == 4  # 4 distinct ids: 1, 2, 3, 4
    # 2 statements per id (overall + per-feature) = 8 calls
    assert len(conn.calls) == 8
    assert conn.commits == 1

    # Validate the aggregate for id=1: 2 tournaments, 2 votes
    params_1 = [c[1] for c in conn.calls if c[1] and c[1]["id"] == 1]
    assert params_1[0] == {"t": 2, "v": 2, "id": 1}

    # Validate feature index dispatch — id=4 uses per_feature_updates_sql[3]
    id4_stmts = [str(c[0]) for c in conn.calls if c[1] and c[1]["id"] == 4]
    assert any("tournaments_3" in s for s in id4_stmts), id4_stmts
