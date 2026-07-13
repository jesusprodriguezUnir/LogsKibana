import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.query import router as query_router
from api.routes.upload import router as upload_router
from api.routes.publish import router as publish_router, close_connection
from services.config import get_settings
from services.logging_config import configure_logging
from services.rabbit_init import ensure_queues_exist, rabbit_status
from services.rabbit_settings import get_rabbit_settings

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Inicializar RabbitMQ
    logger.info("Iniciando aplicación: verificando configuración de RabbitMQ...")
    settings = get_rabbit_settings()
    if settings.enabled:
        # Ejecutamos en segundo plano para no bloquear el arranque de la API;
        # aunque aio_pika es asíncrono, los reintentos podrían tardar.
        app.state.rabbit_init_task = asyncio.create_task(ensure_queues_exist())
    else:
        logger.warning("RabbitMQ deshabilitado por configuración (RABBITMQ_ENABLED=false).")
    yield
    # Shutdown: cerrar la conexión compartida de RabbitMQ.
    await close_connection()


app = FastAPI(
    title="Kibana Logs Processor API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS restringido por configuración. `allow_origins=["*"]` junto a
# `allow_credentials=True` es inválido por spec y un mal patrón de seguridad.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)

app.include_router(upload_router, prefix="/api", tags=["upload"])
app.include_router(query_router, prefix="/api", tags=["query"])
app.include_router(publish_router, prefix="/api", tags=["publish"])


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    """Liveness: el proceso está vivo. No comprueba dependencias."""
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
def ready() -> dict[str, object]:
    """Readiness: incluye el estado de las dependencias (RabbitMQ)."""
    return {"status": "ok", "rabbitmq": rabbit_status()}
