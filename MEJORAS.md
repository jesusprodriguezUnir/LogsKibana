# LogsKibana — Propuesta de mejoras de código y arquitectura

> Revisión técnica del estado actual del repositorio (backend FastAPI + frontend React/Vite + RabbitMQ).
> Fecha: 2026-07-13. Audiencia: equipo de desarrollo / arquitectura.

## 1. Resumen ejecutivo

LogsKibana cumple su objetivo funcional (subir CSV de Kibana, parsear, filtrar, agrupar, exportar y re-publicar mensajes RabbitMQ) y tiene una base sana: separación backend/frontend, tests unitarios en ambos lados, CI en GitHub Actions, tipado estricto (Pyright + TypeScript) y un modo degradado cuando RabbitMQ no está disponible. Es un buen punto de partida.

Los problemas de mayor impacto no son estéticos sino estructurales y de robustez:

1. **Modelo de sesión no escalable ni seguro** — `SessionStore` es un `dict` en memoria + `pickle` en disco, sin TTL, sin límite de tamaño y sin evicción. Fuga de memoria y disco garantizada en uso prolongado, y `pickle` es un vector de ejecución de código arbitrario.
2. **Acoplamiento del dominio (UNIR) en un parser genérico** — la lógica de extracción de payloads (`ActaArchivada`, `MatriculaRealizada`, etc.) está incrustada como cadenas de `if/elif` en `csv_processor.py`, y duplicada en el frontend. Tres fuentes de verdad para la lista de colas.
3. **Riesgos de seguridad de entrada** — búsqueda de texto interpretada como **regex** (inyección/ReDoS), CORS `*` con credenciales, `await file.read()` sin límite de tamaño (OOM), y ausencia total de autenticación (incluido `POST /publish`, que puede inyectar en cualquier routing key).
4. **Rendimiento del pipeline** — `df.apply(..., axis=1)` fila a fila y paginación secuencial en el frontend (N peticiones de 500 filas).

El resto del documento detalla cada punto con severidad, justificación y ejemplo de corrección, y cierra con una hoja de ruta priorizada.

Leyenda de severidad: 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🟢 Bajo/pulido.

---

## 2. Backend

### 2.1 🔴 `SessionStore`: fuga de recursos y `pickle` inseguro

`services/store.py` mantiene un `dict` global que crece indefinidamente y persiste cada DataFrame como `.pkl`. Nunca se libera memoria, nunca se borran los ficheros, no hay límite de sesiones concurrentes ni de tamaño.

Problemas concretos:

- **Fuga de memoria y disco**: cada upload añade una entrada permanente. Un proceso de larga vida termina agotando RAM/disco.
- **`pickle` = RCE**: `pd.read_pickle` deserializa objetos arbitrarios. Si un atacante coloca un `.pkl` en `.session_store/`, se ejecuta código al cargarlo. Además el formato pickle es frágil entre versiones de pandas/numpy.
- **No thread-safe**: los endpoints síncronos de FastAPI corren en un threadpool; el `dict` se lee/escribe sin lock.

Recomendación: cachear con TTL + límite de entradas y persistir en un formato de datos (no de código). Para una sola instancia, `cachetools.TTLCache`; para escalar horizontalmente, Redis o almacenamiento de objetos.

```python
# store.py — versión con TTL, límite y formato Parquet (seguro y estable entre versiones)
from pathlib import Path
from threading import RLock
import pandas as pd
from cachetools import TTLCache

class SessionStore:
    def __init__(self, storage_dir: Path | None = None,
                 max_sessions: int = 100, ttl_seconds: int = 3600) -> None:
        self._lock = RLock()
        self._data: TTLCache[str, pd.DataFrame] = TTLCache(maxsize=max_sessions, ttl=ttl_seconds)
        self._storage_dir = storage_dir or Path(__file__).resolve().parents[2] / ".session_store"
        self._storage_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, sid: str) -> Path:
        return self._storage_dir / f"{sid}.parquet"

    def save(self, sid: str, df: pd.DataFrame) -> None:
        with self._lock:
            self._data[sid] = df
        df.to_parquet(self._path(sid))  # requiere pyarrow

    def get(self, sid: str) -> pd.DataFrame | None:
        with self._lock:
            if (df := self._data.get(sid)) is not None:
                return df
        path = self._path(sid)
        if not path.exists():
            return None
        df = pd.read_parquet(path)
        with self._lock:
            self._data[sid] = df
        return df
```

Añadir además una tarea de limpieza periódica de ficheros huérfanos (por antigüedad) o borrarlos al expirar la entrada de caché.

**Trade-off**: Parquet requiere `pyarrow` (dependencia extra ~30 MB) pero elimina el riesgo de `pickle`, es columnar, comprime y es estable entre versiones. Recomendado. Si se quiere escalar a >1 instancia, el disco local deja de servir: mover a Redis (payloads pequeños) o S3/MinIO (DataFrames grandes serializados a Parquet).

### 2.2 🔴 Búsqueda de texto vulnerable a regex injection / ReDoS

En `query_engine.apply_filters`, `str.contains(text, ...)` usa `regex=True` por defecto en pandas. El usuario introduce texto libre desde la UI: un `(` provoca un error 500, y patrones como `(a+)+$` habilitan ReDoS.

```python
# Antes
mask = result["message"].str.contains(text, case=False, na=False)
# Después — tratar como literal salvo que exista una feature explícita de "modo regex"
mask = result["message"].str.contains(text, case=False, na=False, regex=False)
```

Aplica a los cinco `str.contains` del módulo (`text`, `message_text`, `logger_text`, `location_text`) y al `message_text` que el frontend usa con `nombres.join("|")` (ver §4.4): ese uso *depende* del regex implícito, así que hay que hacerlo explícito y deliberado, no accidental.

### 2.3 🔴 Upload sin límite de tamaño → OOM

`upload.py` hace `content = await file.read()` cargando el fichero completo en memoria, y luego pandas construye el DataFrame (otra copia). Un CSV grande tumba el proceso. No hay límite ni streaming.

```python
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB, ajustar a la realidad

@router.post("/upload")
async def upload_csv(file: Annotated[UploadFile, File(...)]) -> dict[str, object]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "El archivo debe ser CSV")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"CSV supera el límite de {MAX_UPLOAD_BYTES // (1024*1024)} MB")
    ...
```

Mejor aún: validar `Content-Length` antes de leer, o leer por chunks. Y devolver `413 Payload Too Large` en vez de `400`.

### 2.4 🟠 CORS `*` con credenciales

`main.py` usa `allow_origins=["*"]` junto a `allow_credentials=True`. Es una combinación inválida según la especificación CORS (el navegador la rechaza) y un mal patrón de seguridad. Restringir a orígenes conocidos vía configuración:

```python
settings_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
```

Si no se usan cookies/credenciales, poner `allow_credentials=False` y entonces `*` sí es válido.

### 2.5 🟠 Ausencia de autenticación

Ningún endpoint está protegido. `POST /api/publish` permite publicar cualquier payload en cualquier routing key del broker local sin control. Aunque sea una herramienta interna, conviene al menos una API key por cabecera (dependencia FastAPI reutilizable) y, si se expone fuera de localhost, autenticación real. Documentar explícitamente el modelo de amenaza asumido ("solo red interna de confianza") si se decide no protegerlo.

### 2.6 🟠 Dominio UNIR acoplado y hardcodeado en el parser

`csv_processor._extract_payload_fields` es un bloque de `if "ActaArchivada" in msg / elif "NotaFinalGenerada" ...` con mapeos de campos específicos por evento. Los `infer_*` asumen literales de UNIR (`"servicio de "`, `"Unir."`). Esto:

- Mezcla la lógica de negocio del cliente con una herramienta que se vende como genérica de logs Kibana.
- Es difícil de extender (tocar el core por cada evento nuevo) y de testear aisladamente.
- Está **duplicado** en el frontend (`RabbitExtractor.tsx`: `extraerJsonLimpio`, `LIMPIOS`, `RABBIT_NAMES`).

Recomendación: extraer un **registro de esquemas de evento** declarativo (mapa evento → campos a extraer) y una única función de extracción guiada por datos. Idealmente en un módulo/config (`event_schemas.py` o YAML/JSON) compartido conceptualmente con el `rabbitFields.ts` del frontend, para que exista **una sola fuente de verdad** por evento.

```python
# event_schemas.py (esbozo)
from dataclasses import dataclass
from typing import Callable

@dataclass
class EventSchema:
    marker: str                      # substring que identifica el evento
    fields: dict[str, list[str]]     # col destino -> claves candidatas (Pascal/camel)
    transforms: dict[str, Callable] = None  # p.ej. {"payload_Fecha": to_datetime}

EVENT_SCHEMAS = [
    EventSchema("ActaArchivada", {
        "payload_IdActa": ["IdActa", "idActa"],
        "payload_IdClase": ["IdClase", "idClase"],
        "payload_TipoEvaluacion": ["TipoEvaluacion", "tipoEvaluacion"],
        ...
    }),
    ...
]

def extract_payload_fields(msg: str, parsed: dict) -> dict:
    out = {}
    for schema in EVENT_SCHEMAS:
        if schema.marker in msg:
            for col, keys in schema.fields.items():
                val = next((parsed[k] for k in keys if parsed.get(k) is not None), None)
                out[col] = schema.transforms.get(col, lambda x: x)(val) if val is not None else None
            break
    return out
```

Beneficio: añadir un evento = añadir una entrada, sin tocar el pipeline. Testeable con tabla de casos. **Trade-off**: algo más de indirección inicial a cambio de eliminar duplicación y acoplamiento.

### 2.7 🟠 `df.apply(_extract_payload_fields, axis=1)` es lento

`apply(..., axis=1)` itera fila a fila en Python puro sobre todo el DataFrame, y además crea columnas dispersas. En CSVs grandes es un cuello de botella. Alternativas, de menor a mayor esfuerzo:

- Filtrar primero las filas que contienen algún marcador RabbitMQ y aplicar solo sobre ese subconjunto (probablemente una minoría de filas).
- Usar `itertuples()` (más rápido que `iterrows`/`apply`) construyendo una lista de dicts y un `pd.DataFrame` que se concatena por índice.
- Si el volumen crece, mover el parseo a un paso perezoso (bajo demanda por página) en lugar de en el `upload`.

### 2.8 🟠 Conexión RabbitMQ por petición, sin pool

`publish.py` y `get_queues` hacen `await aio_pika.connect_robust(url)` en **cada** request. Establecer conexión/canal AMQP es caro. Crear una conexión robusta al arranque (en `lifespan`, guardada en `app.state`) y reutilizar canales:

```python
# main.py lifespan
app.state.rabbit_conn = await aio_pika.connect_robust(settings.url)
...
# publish.py
channel = await request.app.state.rabbit_conn.channel()
```

Gestionar reconexión (aio-pika `connect_robust` ya reintenta) y cerrar en el shutdown.

### 2.9 🟡 `rabbit_status` es código muerto

`rabbit_init.rabbit_status()` mantiene estado (`available`, `last_error`) que **nadie expone**. El `/health` devuelve un `ok` fijo. Aprovecharlo para un health check útil:

```python
@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "rabbitmq": rabbit_status()}
```

Considerar `/health` (liveness, siempre ok si el proceso vive) separado de `/ready` (readiness, incluye estado de dependencias) para orquestadores.

### 2.10 🟡 Manejo de errores demasiado amplio en upload

`except Exception ... # pragma: no cover` convierte cualquier fallo (incluido un bug interno 500) en un `400 "No se pudo procesar el CSV"`, ocultando la causa y dificultando el diagnóstico. Distinguir errores de parseo esperados (400) de fallos inesperados (500 + log con stack trace). Loggear siempre la excepción original.

### 2.11 🟡 Robustez de encoding y reporte de filas descartadas

- `content.decode("utf-8")` falla con exports en `utf-8-sig` (BOM) o `latin-1`, habituales en Kibana/Excel. Probar `utf-8-sig` y como fallback una codificación tolerante, o detectar con `charset-normalizer`.
- `normalize_dataframe` hace `dropna(subset=["timestamp"])` en silencio. Si el 30% de las filas tiene timestamp no parseable, el usuario no se entera. Devolver en la respuesta de `/upload` cuántas filas se descartaron y por qué.

### 2.12 🟢 Ficheros scratch en el paquete de producción

`src/scratch_rabbit.py` y `src/scratch_test.py` son scripts de prueba manual (usan `urllib`) commiteados dentro del código fuente empaquetado, e incluso violan la restricción del propio proyecto de no usar HTTP crudo. Moverlos a `scripts/` fuera de `src/`, o eliminarlos. También `_decode_escaped_message` en `payload_parsers.py` tiene reemplazos mágicos frágiles que convendría documentar o unificar con el frontend.

---

## 3. Frontend

### 3.1 🟠 `LogExplorer` (App.tsx) es un componente-Dios

~540 líneas, 14 `useState`, orquestación de upload+filtros+query+export+agrupación+modal en un solo componente. Difícil de testear y de mantener. Refactor sugerido:

- Extraer la lógica de datos a un hook `useLogQuery(sessionId)` que encapsule estado de filtros, paginación, orden y las llamadas a `/search` y `/group`.
- Separar en componentes de presentación: `<FiltersPanel>`, `<ResultsTable>`, `<GroupPanels>`, `<StatsRow>`, `<MessageModal>`.
- Sustituir los estilos inline dispersos (`style={{...}}`) por clases CSS (ya existe `styles.css`).

### 3.2 🟠 Lógica de parseo duplicada frontend/backend

`RabbitExtractor.tsx` reimplementa en TypeScript lo que ya hace `payload_parsers.py` (`extractBalancedJson` ≈ `_extract_balanced_json`, `extraerJsonLimpio`, decodificación de escapes). Dos implementaciones que **divergen con el tiempo**. Decisión arquitectónica a tomar: que el parseo viva en **un solo lado**. Recomendado: el backend ya extrae `payload_*`; que exponga esos campos parseados en `/search` y que el frontend solo los consuma, eliminando el parseo cliente.

### 3.3 🟠 Paginación secuencial en `fetchAllRows`

Para "extraer todos" los mensajes, el frontend pide páginas de 500 en un bucle `for p = 2..totalPages` **secuencial**. Con muchos miles de filas son muchos round-trips en serie. Opciones: un endpoint backend que devuelva el conjunto completo filtrado (ya existe `/export`; podría existir un `/search/all` con streaming NDJSON), o paralelizar las páginas con `Promise.all` acotado. Mejor: no traer todo al cliente y filtrar/paginar en servidor.

### 3.4 🟡 `alert()` como feedback de usuario

`publishToLocalRabbit` usa `alert()`/`confirm()` nativos para éxito y error. UX pobre y bloqueante. Reutilizar el patrón de toasts/`alert-error` que ya existe en la app.

### 3.5 🟡 Sin Error Boundary

Un throw en render tumba toda la SPA a pantalla en blanco. Añadir un `<ErrorBoundary>` de React alrededor de las rutas en `main.tsx`.

### 3.6 🟢 Acoplamiento implícito de `message_text` como regex

`downloadZipFromServer` construye `message_text = selectedRabbitNames.join("|")` confiando en que el backend lo interprete como alternancia regex. Es frágil y quedará roto si se aplica §2.2. Definir un contrato explícito (p. ej. parámetro `rabbit_names` multivalor en el backend) en lugar de depender de un detalle de implementación de pandas.

---

## 4. Duplicación y fuentes de verdad

La lista de eventos/colas RabbitMQ está triplicada y **se desincronizará**:

| Fuente | Fichero |
|--------|---------|
| Backend init de colas | `services/rabbit_init.py` → `RABBIT_QUEUES` |
| Frontend detección | `components/RabbitExtractor.tsx` → `RABBIT_NAMES` |
| Definiciones broker | `infra/docker/rabbitmq_definitions.json` |

Y los esquemas de campos por evento están en `csv_processor.py` (backend) y `config/rabbitFields.ts` (frontend). Recomendación: una única definición canónica (por ejemplo un JSON versionado en el repo) del que se generen/deriven las tres representaciones, o al menos un test de CI que verifique que las tres listas coinciden.

---

## 5. Infraestructura, tooling y CI/CD

### 5.1 🟠 Dockerfile de backend endurecible

`infra/docker/backend.Dockerfile` corre como root, es single-stage, copia `tests/` a la imagen de runtime y no tiene healthcheck. Mejoras:

- Usuario no-root (`USER appuser`).
- No incluir `tests/` ni dependencias `dev` en la imagen final (multi-stage o instalar sin `[dev]`).
- `HEALTHCHECK` apuntando a `/health`.
- Fijar versión base por digest para builds reproducibles.

### 5.2 🟠 Frontend sin imagen propia

En `docker-compose.yml`, el frontend monta el código en `node:20-alpine` y ejecuta `npm install && npm run dev` en cada arranque: lento y no apto para producción. Crear un `frontend.Dockerfile` (build de Vite + servir estáticos con nginx). Además `version: "3.9"` está obsoleto en Compose v2 (se puede eliminar la clave).

### 5.3 🟠 CI incompleta

`.github/workflows/ci.yml`:

- Usa `npm install` en vez de `npm ci` (no reproducible; además no veo `package-lock.json` commiteado — conviene commitearlo y cachear sobre él, no sobre `package.json`).
- No ejecuta **linters ni type-check**: falta `ruff`/`mypy` (o `pyright`, que ya está configurado) en backend y `tsc --noEmit` + `eslint` en frontend.
- No corre los **tests E2E** de Playwright ni la integración de RabbitMQ (que requeriría un servicio `rabbitmq` en el job).
- Sin **cobertura** ni umbral mínimo.

### 5.4 🟡 Falta configuración de calidad de código

No hay `ruff`/`black`/`isort` para Python ni `eslint`/`prettier` para TS commiteados. Añadir configuración y un pre-commit hook. Existe `pyrightconfig.json` (bien) pero no se ejecuta en CI.

### 5.5 🟡 Gestión de configuración y secretos

- No hay `backend/.env.example` ni `frontend/.env.local.example` documentando variables (`HOST`, `PORT`, `RABBITMQ_URL`, `RABBITMQ_ENABLED`, `VITE_API_URL`). Añadirlos.
- Migrar la configuración del backend a `pydantic-settings` (`BaseSettings`) en lugar de leer `os.environ` disperso; centraliza validación y valores por defecto. Ya se usa Pydantic v2.
- Credenciales `devuser/devpassword` en `docker-compose.yml`: aceptable en local, pero dejar claro que no deben replicarse en despliegues reales.

### 5.6 🟢 Seguridad de dependencias

Sin Dependabot ni escaneo (`pip-audit`, `npm audit`). Añadir `dependabot.yml` y un job de auditoría. Las versiones están pinneadas (bien para reproducibilidad).

---

## 6. Arquitectura: consideraciones transversales

**Estado por proceso vs. escalado horizontal.** El diseño actual (DataFrame en memoria + pickle en disco local, `session_id` como clave) funciona en una sola instancia pero impide escalar: dos réplicas detrás de un balanceador no comparten sesiones. Si el escalado es un requisito, la decisión de fondo es externalizar el estado (Redis/objeto) o rediseñar hacia un modelo stateless con almacenamiento compartido. Conviene registrarlo como **ADR** explícito con el trade-off (simplicidad actual vs. escalabilidad futura).

**Herramienta genérica vs. producto UNIR.** Hoy el core "genérico de logs Kibana" está impregnado de reglas de UNIR (regex de servicios, catálogo de eventos). Definir la frontera: o se asume que es un producto interno UNIR (y se documenta así, simplificando), o se aísla el dominio tras una capa de plugins/config para mantenerlo genérico (§2.6). Es una decisión de producto que debe tomarse conscientemente, no por inercia.

**Observabilidad.** Falta logging estructurado (JSON), correlación por request-id y métricas. Para una herramienta de análisis de logs es irónico carecer de sus propios logs operativos. Añadir `structlog` o logging JSON y, si aplica, métricas Prometheus.

---

## 7. Hoja de ruta priorizada

### Fase 1 — Robustez y seguridad (impacto alto, esfuerzo bajo-medio)

1. `str.contains(..., regex=False)` en todos los filtros de texto (§2.2). *Trivial, evita 500s e inyección.*
2. Límite de tamaño en `/upload` + `413` (§2.3).
3. TTL + límite + evicción en `SessionStore` y migración `pickle` → `parquet` (§2.1).
4. CORS por configuración (§2.4) y decisión sobre auth de `/publish` (§2.5).
5. Eliminar/mover ficheros scratch (§2.12).

### Fase 2 — Deuda técnica y duplicación (impacto alto, esfuerzo medio)

6. Registro declarativo de esquemas de evento; eliminar `if/elif` y unificar con frontend (§2.6, §3.2, §4).
7. Reutilización de conexión RabbitMQ (§2.8).
8. Refactor de `LogExplorer` en hook + componentes (§3.1).
9. Reporte de filas descartadas y encoding robusto (§2.11).

### Fase 3 — Tooling, CI y escalado (impacto medio, esfuerzo medio)

10. CI: `npm ci`, lint + type-check + cobertura; job con servicio RabbitMQ para integración (§5.3).
11. Dockerfiles endurecidos (backend no-root, frontend con nginx) (§5.1, §5.2).
12. `pydantic-settings`, `.env.example`, Dependabot (§5.5, §5.6).
13. Health/readiness con estado de RabbitMQ; logging estructurado (§2.9, §6).
14. ADR sobre modelo de estado y escalado; decisión genérico-vs-UNIR (§6).

---

## 8. Lo que ya está bien (mantener)

- Separación clara backend/frontend y por capas (`api/routes` vs `services`).
- Tipado estricto en ambos lados (Pyright + TS strict).
- Tests unitarios de backend (`store`, `csv_processor`, `query_engine`, endpoints, export_zip) y frontend (`App`, `LevelBadge`), más E2E con Playwright.
- Modo degradado ante RabbitMQ caído (no rompe la API principal).
- Manejo de errores de red y timeouts en el cliente `api.ts` (`AbortController`, mapeo de errores).
- Versiones de dependencias pinneadas.
- `.gitignore` correcto (`.venv`, `.session_store`, `dist`, `.env`).

---

*Documento generado como revisión de arquitectura. Cada punto es accionable de forma independiente; la numeración de la hoja de ruta refleja una secuencia recomendada por relación impacto/esfuerzo, no una dependencia estricta.*
