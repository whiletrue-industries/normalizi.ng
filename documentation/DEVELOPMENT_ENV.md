# Development environment

## Frontend

```sh
npm install --legacy-peer-deps
npm start
```

Opens at http://localhost:4200.

## Backend

Python 3.12 is required.

```sh
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
```

Run tests:

```sh
pytest -v
ruff check .
```

### Local Postgres

Two helper scripts spin up disposable Postgres instances in Docker:

```sh
./run_db.sh   # main DB on 5432
./run_db1.sh  # secondary DB (testing)
```

Credentials: user/password = `normalize`/`normalize`. Set `DATABASE_URL=postgresql://normalize:normalize@localhost:5432/normalize` to point the backend at it.

### Required local environment variables

Only needed when exercising code paths against real services (not for tests):

```sh
export DATABASE_URL=postgresql://normalize:normalize@localhost:5432/normalize
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export BUCKET_NAME=...
export MAILGUN_API_KEY=...
export GOOGLE_MAPS_API_KEY=...
```

### IDE

Recommended: VS Code with the Python and Angular language extensions. The project uses `.python-version` at `backend/.python-version` for `pyenv` compatibility.
