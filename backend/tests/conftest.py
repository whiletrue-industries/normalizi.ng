"""Shared pytest fixtures for backend tests.

Tests are fully hermetic: no real DB, S3, HTTP, or geocoder.
"""
from __future__ import annotations

import base64
from collections.abc import Callable, Iterable
from io import BytesIO
from typing import Any
from unittest.mock import MagicMock

import pytest
from flask import Request
from PIL import Image
from werkzeug.test import EnvironBuilder


class FakeRow:
    """Stand-in for sqlalchemy.engine.Row.

    Supports both `row._mapping` (SQLA 2.x) and dict-style iteration used by callers.
    """

    def __init__(self, mapping: dict[str, Any]):
        self._mapping = dict(mapping)

    def __iter__(self):
        return iter(self._mapping.values())

    def __getitem__(self, key):
        if isinstance(key, str):
            return self._mapping[key]
        return list(self._mapping.values())[key]


class FakeResult:
    """Iterable of FakeRow objects; also supports .fetchone()."""

    def __init__(self, rows: Iterable[dict[str, Any]] | None = None):
        self._rows = [FakeRow(r) for r in (rows or [])]
        self._iter = iter(self._rows)

    def __iter__(self):
        return iter(self._rows)

    def fetchone(self):
        return next(self._iter, None)


class FakeConnection:
    """Records execute() calls so tests can assert SQL text and bound params."""

    def __init__(self, results_by_call: list[FakeResult] | None = None):
        self.calls: list[tuple[Any, dict[str, Any] | None]] = []
        self.commits = 0
        self._results = list(results_by_call or [])

    def execute(self, statement, params=None):
        self.calls.append((statement, params))
        if self._results:
            return self._results.pop(0)
        return FakeResult([])

    def commit(self):
        self.commits += 1

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeEngine:
    def __init__(self, connection: FakeConnection):
        self._connection = connection

    def connect(self):
        return self._connection


@pytest.fixture
def make_connection():
    """Factory: build a FakeConnection pre-loaded with execute() results."""

    def _make(results: list[list[dict[str, Any]]] | None = None) -> FakeConnection:
        return FakeConnection([FakeResult(r) for r in (results or [])])

    return _make


_HANDLER_MODULES_USING_ENGINE = [
    "lib.db",
    "lib.delete_item",
    "lib.get_game",
    "lib.get_image",
    "lib.game_results",
    "lib.latest",
    "lib.new_selfie",
    "lib.send_email",
    "lib.calc_tsne",
]


@pytest.fixture
def patch_engine(monkeypatch):
    """Patch get_engine across all handler modules that import it at module load time."""

    def _patch(connection: FakeConnection):
        engine = FakeEngine(connection)

        def _fake_get_engine():
            return engine

        import importlib

        for module_name in _HANDLER_MODULES_USING_ENGINE:
            try:
                module = importlib.import_module(module_name)
            except ImportError:
                continue
            monkeypatch.setattr(module, "get_engine", _fake_get_engine, raising=False)
            monkeypatch.setattr(module, "engine", engine, raising=False)
        return engine

    return _patch


@pytest.fixture
def flask_request() -> Callable[..., Request]:
    """Build a flask.Request via werkzeug's EnvironBuilder."""

    def _make(
        method: str = "GET",
        json: Any = None,
        args: dict[str, str] | None = None,
        form: dict[str, str] | None = None,
        path: str = "/",
    ) -> Request:
        kwargs: dict[str, Any] = {"method": method, "path": path}
        if json is not None:
            kwargs["json"] = json
        if args:
            kwargs["query_string"] = args
        if form:
            kwargs["data"] = form
        builder = EnvironBuilder(**kwargs)
        env = builder.get_environ()
        return Request(env)

    return _make


@pytest.fixture
def sample_png_bytes() -> bytes:
    """Raw bytes of a tiny PNG, suitable for uploads and image-handling tests."""
    img = Image.new("RGB", (1500, 300), color=(200, 100, 50))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def sample_selfie_payload(sample_png_bytes) -> dict[str, Any]:
    """A plausible `new_selfie` POST body."""
    b64 = base64.b64encode(sample_png_bytes).decode("ascii")
    return {
        "image": f"data:image/png;base64,{b64}",
        "descriptor": [0.1, 0.2, 0.3],
        "landmarks": [{"x": 10, "y": 20}],
        "gender_age": {"gender": "x", "age": 30},
        "geolocation": [32.08, 34.78],
    }


@pytest.fixture
def mock_s3_upload(monkeypatch):
    """Replace lib.net.upload_fileobj_s3 with a recorder. Returns the call log."""
    calls: list[dict[str, Any]] = []

    def _fake_upload(buff, filename, content_type, cache_control=None):
        data = buff.getvalue() if hasattr(buff, "getvalue") else None
        calls.append({
            "filename": filename,
            "content_type": content_type,
            "cache_control": cache_control,
            "bytes": len(data) if data else None,
        })
        return True

    import lib.net as net_module

    monkeypatch.setattr(net_module, "upload_fileobj_s3", _fake_upload)
    # Also patch in modules that imported it directly.
    try:
        import lib.new_selfie as new_selfie_module

        monkeypatch.setattr(new_selfie_module, "upload_fileobj_s3", _fake_upload, raising=False)
    except ImportError:
        pass
    try:
        import lib.calc_tsne as calc_tsne_module

        monkeypatch.setattr(calc_tsne_module, "upload_fileobj_s3", _fake_upload, raising=False)
    except ImportError:
        pass
    return calls


@pytest.fixture
def mock_geocoder(monkeypatch):
    """Patch geopy.GoogleV3 used by new_selfie.py.

    Returns a MagicMock that the test can configure. By default returns a location
    with address="Tel Aviv, Israel".
    """
    location = MagicMock()
    location.address = "Tel Aviv, Israel"
    location.raw = {
        "address_components": [
            {"long_name": "Tel Aviv", "types": ["locality"]},
            {"long_name": "Israel", "types": ["country"]},
        ]
    }

    geocoder_instance = MagicMock()
    geocoder_instance.reverse.return_value = location

    geocoder_cls = MagicMock(return_value=geocoder_instance)

    try:
        import lib.new_selfie as new_selfie_module

        monkeypatch.setattr(new_selfie_module, "GoogleV3", geocoder_cls, raising=False)
    except ImportError:
        pass
    return geocoder_instance


@pytest.fixture(autouse=True)
def _set_env(monkeypatch):
    """Minimal env vars so modules import cleanly."""
    monkeypatch.setenv("BUCKET_NAME", "test-bucket")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setenv("MAILGUN_API_KEY", "test-mailgun-key")
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "test-google-key")
