"""Tests for lib.db."""
from __future__ import annotations

import pytest

from lib import db


def test_get_engine_raises_without_env(monkeypatch):
    db.get_engine.cache_clear()
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL is not set"):
        db.get_engine()


def test_get_engine_returns_engine_when_env_set(monkeypatch):
    db.get_engine.cache_clear()
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    engine = db.get_engine()
    assert engine is not None
    # Cached on subsequent calls.
    assert db.get_engine() is engine
    db.get_engine.cache_clear()
