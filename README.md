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

## Extractor RabbitMQ (UI)

La pantalla de extraccion RabbitMQ del frontend incluye las siguientes funcionalidades:

- Flujo estable `upload -> search` contra el backend.
- Paginacion automatica para respetar limites de `page_size` del API.
- Deteccion de tipos Rabbit por mensaje y filtro por checkboxes.
- Visualizacion de payload Rabbit estructurado en JSON por fila.
- Columna `Tipo de error` con clasificacion: `Exception`, `StatusCode`, `Parseo`, `Sin detalle`.
- Columna `Error` con detalle extraido del log (`Exception caught`, `StatusCode`, etc.).
- Copia de mensajes filtrados al portapapeles.
- Descarga de JSON filtrado con `rabbit_name`, `timestamp`, `payload`, `error_type`, `log_error`, `parse_error`.

Notas:

- Si un mensaje requiere parseo limpio y no se puede transformar, se usa fallback estructurado con `rabbit_name`, `timestamp` y `message`.
- El extractor prioriza mostrar el error funcional del log (no solo errores de parseo).

## Politica de archivos locales

- Todo lo que este dentro de `Docs/` se considera material local de trabajo y no se sube al repositorio.
- Esta exclusion se controla mediante `.gitignore`.

## Despliegue en la Nube ☁️ (Render & Vercel)

El proyecto está preparado para funcionar en la nube de forma nativa. 

### 1. Desplegar el Backend (Render)

1. Sube tu código (haz un `git push`) a tu repositorio en GitHub.
2. Crea una cuenta en [Render.com](https://render.com/) y haz clic en **New +** -> **Web Service**.
3. Conecta tu repositorio de GitHub correspondiente.
4. Completa la configuración del servicio de esta manera:
   - **Name**: `logs-kibana-api` (o el nombre que desees).
   - **Root Directory**: `backend` (¡Muy importante!).
   - **Runtime**: `Docker` (Render lo detectará por el Dockerfile incluido).
   - **Instance Type**: `Free`.
5. Haz clic en **Deploy Web Service** y espera a que instale todas las dependencias. 
   - _Render te devolverá una URL cuando termine, ej. `https://xxx.onrender.com`._

> **Nota sobre Render Free:** El disco es efímero. Cada vez que haya inactividad y Render ponga el servidor en hibernación, las sesiones CSV cargadas temporalmente se borrarán del servidor. Podrás solucionar la caducidad, repitiendo la subida del CSV en el UI.

### 2. Desplegar el Frontend (Vercel)

1. Entra a [Vercel.com](https://vercel.com/) y haz clic en **Add New** -> **Project**.
2. Conecta también este mismo repositorio.
3. En la configuración del proyecto en Vercel, marca:
   - **Root Directory**: `frontend`.
   - **Framework Preset**: `Vite`.
4. Extiende el desplegable de **Environment Variables** y añade lo siguiente:
   - Nombre: `VITE_API_URL`
   - Valor: `https://TU_ENLACE_PROVISTO_POR_RENDER.com/api` *(Ojo: asegúrate de meter /api al final).*
5. Dale a **Deploy** e instantáneamente tendrás todo a tu alcance.

## Ideas siguientes

- Cambiar motor de consultas a DuckDB/Polars para datasets mas grandes.
- Agregar autenticacion y persistencia de sesiones.
- Agregar perfiles de consulta guardados.
- Agregar dashboards con tendencias por servicio.
