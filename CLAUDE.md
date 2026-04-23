# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**LogsKibana** is a full-stack log analysis tool. Users upload Kibana CSV exports, which are parsed and stored server-side in a session. The frontend queries the backend to filter, search, group, and export log entries. A secondary feature extracts and re-publishes RabbitMQ messages embedded in logs.

## Commands

### Local Development (no Docker)

```bash
# Start both services at once (PowerShell)
.\start-local.ps1
.\start-local.ps1 -NoInstall   # skip npm/pip installs

# Backend only (http://localhost:8000)
cd backend
pip install -e .[dev]
uvicorn api.main:app --reload --app-dir src

# Frontend only (http://localhost:5173)
cd frontend
npm install
npm run dev
```

### Docker

```bash
docker compose -f infra/docker/docker-compose.yml up --build
# RabbitMQ Management UI: http://localhost:15672  (user: invitado / pass: secreta)
```

### Tests

```bash
# Backend
cd backend && pytest

# Frontend unit/integration
cd frontend && npm run test

# Frontend E2E (Playwright)
cd frontend && npm run test:e2e
```

### Build

```bash
cd frontend && npm run build   # output: frontend/dist/
```

### Environment Variables

- `backend/.env` — `HOST`, `PORT`, `RABBITMQ_URL`
- `frontend/.env.local` — `VITE_API_URL=http://localhost:8000/api`

## Architecture

### Data Flow

1. **Upload** — User uploads a CSV → `POST /api/upload` → backend parses with pandas, normalizes columns, extracts JSON payloads from embedded log messages, stores the DataFrame via `SessionStore` (in-memory + pickle on disk in `.session_store/`). Returns a `session_id`.

2. **Query** — Frontend sends `GET /api/search?session_id=...` with filter params → `query_engine.py` loads the session DataFrame, applies text search, field matching, datetime ranges, dynamic payload filters, sorts, and paginates (max 500 rows/page).

3. **Grouping** — `GET /api/group` computes value distributions per field and a diagnostic panel (top errors by service/status_code/logger) via pandas groupby operations.

4. **Export** — `GET /api/export` returns filtered results as CSV; `GET /api/export_zip` bundles individual message metadata files.

5. **RabbitMQ re-publish** — Frontend extracts RabbitMQ events from logs (identified by `rabbit_name`), parses JSON payloads, classifies error types; `POST /api/publish/{routing_key}` re-publishes to local RabbitMQ.

### Backend (`backend/src/`)

| File | Responsibility |
|------|---------------|
| `api/main.py` | FastAPI app, CORS, startup RabbitMQ init, router registration |
| `api/routes/upload.py` | CSV ingestion endpoint |
| `api/routes/query.py` | Search, group, export endpoints |
| `api/routes/publish.py` | RabbitMQ publish and queue stats |
| `services/csv_processor.py` | Normalization of Kibana CSV exports into standard schema |
| `services/query_engine.py` | Filtering, sorting, pagination, grouping aggregations |
| `services/store.py` | `SessionStore` — in-memory dict + pickle persistence |
| `services/payload_parsers.py` | JSON payload extraction from nested log messages |
| `services/rabbit_init.py` | Async queue initialization with retries |

### Frontend (`frontend/src/`)

| File | Responsibility |
|------|---------------|
| `App.tsx` | Root `LogExplorer` — orchestrates upload, filter, query, export state |
| `components/UploadDropzone.tsx` | Drag-and-drop CSV upload |
| `components/RabbitExtractor.tsx` | Extract and filter RabbitMQ messages from loaded logs |
| `components/RabbitConfig.tsx` | RabbitMQ connection configuration UI |
| `services/api.ts` | HTTP client (all backend calls) |
| `config/rabbitFields.ts` | RabbitMQ queue schemas and field definitions |
| `types/index.ts` | Shared TypeScript types |

The Vite dev server proxies `/api` to `http://localhost:8000` (see `vite.config.ts`).

### Session Model

Each CSV upload produces a UUID `session_id`. The backend holds the parsed DataFrame in memory and also pickles it to `.session_store/<session_id>.pkl`. All subsequent query/group/export calls reference this `session_id`. There is no database — state is ephemeral per process restart unless the pickle file survives.

### RabbitMQ Queues

`rabbit_init.py` initializes 30+ predefined queues on startup (e.g., `MatriculaRealizada`, `InscripcionCreada`). Queue definitions for the local Docker RabbitMQ instance are in `infra/docker/rabbitmq_definitions.json`.

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | Upload and parse CSV |
| `GET` | `/api/search` | Filter/paginate logs |
| `GET` | `/api/group` | Aggregations & diagnostics |
| `GET` | `/api/export` | Download filtered CSV |
| `GET` | `/api/export_zip` | Download ZIP of message files |
| `POST` | `/api/publish/{routing_key}` | Publish message to RabbitMQ |
| `GET` | `/api/queues` | RabbitMQ queue statistics |
| `GET` | `/health` | Health check |
