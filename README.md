# LogsKibana

Aplicacion web para procesar CSV de logs de Kibana en entorno local: carga, busqueda, filtros por columnas, agrupaciones y exportacion.

## Arquitectura (local)

- Frontend: React + Vite (ejecucion local en puerto 5173).
- Backend: FastAPI + pandas (ejecucion local en puerto 8000).
- Tests unitarios: pytest (backend) y vitest (frontend).
- Docker: backend y compose para entorno local.

## Requisitos

- Python 3.11+
- Node.js 20+

## Desarrollo local (sin Docker)

### Lanzar todo con un comando

Desde la raiz del proyecto:

```powershell
.\start-local.ps1
```

Para lanzar sin reinstalar dependencias:

```powershell
.\start-local.ps1 -NoInstall
```

### Backend

```bash
cd backend
pip install -e .[dev]
uvicorn api.main:app --reload --app-dir src
```

Backend en: http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend en: http://localhost:5173

Si el backend vive en otra URL, define `VITE_API_URL`.

## Variables de entorno para local

- Frontend: copia `frontend/.env.example` como `frontend/.env.local`.
- Backend: copia `backend/.env.example` como `backend/.env` si quieres personalizar host o puerto.

## Tests

### Backend

```bash
cd backend
pytest
```

### Frontend

```bash
cd frontend
npm run test
```

## Docker local

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

## Endpoints principales

- `POST /api/upload` - Carga CSV y retorna `session_id`
- `GET /api/search` - Busqueda y filtros con paginacion
- `GET /api/group` - Agrupaciones por fecha/nivel/servicio/host
- `GET /api/export` - Exporta CSV filtrado
- `GET /health` - Estado del backend

## Siguiente fase (cuando lo pases a cloud)

1. Subir repositorio a GitHub.
2. Publicar frontend en Vercel.
3. Publicar backend en Render/Railway/Fly.
4. Configurar `VITE_API_URL` apuntando al backend publicado.

## Ideas siguientes

- Cambiar motor de consultas a DuckDB/Polars para datasets mas grandes.
- Agregar autenticacion y persistencia de sesiones.
- Agregar perfiles de consulta guardados.
- Agregar dashboards con tendencias por servicio.
