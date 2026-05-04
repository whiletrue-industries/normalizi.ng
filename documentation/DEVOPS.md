# DevOps

## CI

GitHub Actions workflows live under `.github/workflows/`:

| Workflow | Trigger | Purpose |
|---|---|---|
| `build-check.yml` | PR to master | Angular production build check |
| `backend-tests.yml` | PR / push touching `backend/**` | `pytest` + `ruff check` on Python 3.12 |
| `deploy.yml` | Push to master | Builds the Angular app and publishes to `gh-pages` |

## Backend deployment

Handlers are deployed as Google Cloud Functions. Each exported function in `backend/main.py` maps to one Cloud Function:

| Cloud Function | Handler | Trigger |
|---|---|---|
| `upload-selfie` | `new_selfie_handler` | HTTP POST |
| `get-game` | `get_game_handler` | HTTP GET |
| `game-results` | `game_results_handler` | HTTP POST |
| `get-image` | `get_image_handler` | HTTP GET |
| `get-latest` | `get_latest_handler` | HTTP GET |
| `send_email` | `send_email_handler` | HTTP POST |
| `delete-item` | `delete_item_handler` | HTTP POST |
| `calc_tsne` | `calc_tsne_handler` | Event-triggered (Cloud Tasks / Pub/Sub) |

### Runtime

- Python 3.12.
- Dependencies come from `backend/pyproject.toml` (preferred) or `backend/requirements.txt` (still kept in sync for Gen1 compatibility).

### Required environment variables in production

See `backend/README.md` for the full list. Key ones:
- `DATABASE_URL` — PostgreSQL connection string
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `BUCKET_NAME` — DigitalOcean Spaces
- `MAILGUN_API_KEY` — transactional email
- `GOOGLE_MAPS_API_KEY` — reverse geocoding (optional; falls back to `lat, lon` if unset)
- `UPDATE_KEY_1`, `UPDATE_KEY_2` — gallery rotation (optional)

## Frontend deployment

`deploy.yml` runs `npm run prod`, copies the build to a `dist` branch, then pushes the split subtree to `gh-pages`. Uses `CNAME` for custom domain.
