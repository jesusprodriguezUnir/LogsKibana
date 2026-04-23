import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.query import router as query_router
from api.routes.upload import router as upload_router
from api.routes.publish import router as publish_router
from services.rabbit_init import ensure_queues_exist
from services.rabbit_settings import get_rabbit_settings

# Configurar logging básico
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Inicializar RabbitMQ
    logger.info("Iniciando aplicación: verificando configuración de RabbitMQ...")
    settings = get_rabbit_settings()
    if settings.enabled:
        # Ejecutamos en segundo plano para no bloquear el arranque de la API
        # aunque aio_pika es asíncrono, los reintentos podrían tardar.
        app.state.rabbit_init_task = asyncio.create_task(ensure_queues_exist())
    else:
        logger.warning("RabbitMQ deshabilitado por configuración (RABBITMQ_ENABLED=false).")
    yield

app = FastAPI(
    title="Kibana Logs Processor API", 
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router, prefix="/api", tags=["upload"])
app.include_router(query_router, prefix="/api", tags=["query"])
app.include_router(publish_router, prefix="/api", tags=["publish"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
