# normalize backend

Python handlers deployed as Google Cloud Functions.

## Requirements

- Python 3.12
- Docker (for local Postgres)

## Local setup

```sh
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
```

## Running tests

```sh
cd backend
pytest -v
ruff check .
```

Tests are self-contained: Postgres, S3, and Mailgun are mocked. No `DATABASE_URL` or credentials needed.

## Local Postgres

```sh
./run_db.sh   # main DB, maps 5432
./run_db1.sh  # secondary DB (testing/backup)
```

## Required environment variables (production)

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | all handlers | PostgreSQL connection string |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | `net.py` | DigitalOcean Spaces credentials |
| `BUCKET_NAME` | `net.py` | DO Spaces bucket name |
| `MAILGUN_API_KEY` | `send_email.py` | Mailgun API key |
| `GOOGLE_MAPS_API_KEY` | `new_selfie.py` | Google geocoding API key |
| `UPDATE_KEY_1`, `UPDATE_KEY_2`, `UPDATE_KEY` | `latest.py` | Gallery rotation keys (optional) |

## Handlers

See `main.py` for the exported handler functions. Each maps to a deployed Cloud Function:

| GCF name | Handler |
|---|---|
| `upload-selfie` | `new_selfie_handler` |
| `get-game` | `get_game_handler` |
| `game-results` | `game_results_handler` |
| `get-image` | `get_image_handler` |
| `get-latest` | `get_latest_handler` |
| `send_email` | `send_email_handler` |
| `delete-item` | `delete_item_handler` |
| `calc_tsne` | `calc_tsne_handler` (event-triggered) |
