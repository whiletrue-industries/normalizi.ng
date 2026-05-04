# Testing

## Backend (Python)

The backend has a pytest-based unit test suite in `backend/tests/`. Tests are hermetic — no real database, S3, Mailgun, or geocoder calls. They run in under 5 seconds.

### Running locally

```sh
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest -v
ruff check .
```

### Structure

| File | Covers |
|---|---|
| `tests/conftest.py` | Shared fixtures: `flask_request`, `patch_engine`, `make_connection`, `mock_s3_upload`, `mock_geocoder`, `sample_selfie_payload` |
| `tests/test_db.py` | `lib.db.get_engine` env handling |
| `tests/test_net.py` | S3 upload path (via `moto`), CORS headers |
| `tests/test_delete_item.py` | Auth by `magic` token, soft-delete behavior |
| `tests/test_get_game.py` | Random-selection SQL, empty-DB edge case |
| `tests/test_get_image.py` | 400/404 paths, timestamp serialization |
| `tests/test_game_results.py` | Vote/tournament aggregation, per-feature dispatch |
| `tests/test_latest.py` | New-vs-any fallback, update-key auth (security-critical) |
| `tests/test_send_email.py` | Mailgun mocked via `responses`; DB still updates on email failure |
| `tests/test_new_selfie.py` | Insert vs update path, upload failure, geocoder fallback |
| `tests/test_calc_tsne.py` | Mathematical invariants + regression goldens |

### Mocks

- **SQLAlchemy**: `FakeEngine` / `FakeConnection` in `conftest.py` record every `execute()` call and return canned rows. Patched into all handler modules that imported `get_engine` at load time.
- **S3**: `moto.mock_aws` for `test_net.py`; a recording patch for higher-level handler tests (`mock_s3_upload` fixture).
- **Mailgun**: `responses.activate` to intercept the HTTPS POST.
- **Geocoder**: `monkeypatch` replaces `geopy.GoogleV3` with a `MagicMock`.

### calc_tsne golden fixtures

`tests/fixtures/calc_tsne/` contains seeded input fixtures and reference outputs. To regenerate (only when mathematical semantics intentionally change):

```sh
cd backend
python tests/fixtures/calc_tsne/generate_fixtures.py
```

Review any diff to the `.golden.npy` files before committing.

### CI

`.github/workflows/backend-tests.yml` runs `ruff check` and `pytest -v` on Python 3.12 for every PR and push to `master` that touches `backend/**`.

## Frontend (Angular)

Karma/Jasmine specs live next to components as `*.spec.ts`. Run with `ng test`.
