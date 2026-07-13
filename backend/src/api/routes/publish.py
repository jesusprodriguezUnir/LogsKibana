import asyncio
import json
import logging

import aio_pika
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from services.config import get_settings
from services.rabbit_init import RABBIT_QUEUES
from services.rabbit_settings import get_rabbit_settings

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Conexión reutilizable ────────────────────────────────────────────────────
# Antes se abría (y cerraba) una conexión AMQP por cada request, lo cual es caro.
# Mantenemos una única conexión robusta a nivel de módulo y abrimos solo un canal
# efímero por operación. aio_pika.connect_robust ya gestiona la reconexión.
_connection: aio_pika.abc.AbstractRobustConnection | None = None
_conn_lock = asyncio.Lock()


async def get_connection(url: str) -> aio_pika.abc.AbstractRobustConnection:
    global _connection
    if _connection is not None and not _connection.is_closed:
        return _connection
    async with _conn_lock:
        if _connection is None or _connection.is_closed:
            _connection = await aio_pika.connect_robust(url)
    return _connection


async def close_connection() -> None:
    """Cierra la conexión compartida (invocar en el shutdown de la app)."""
    global _connection
    if _connection is not None and not _connection.is_closed:
        await _connection.close()
    _connection = None


class PublishRequest(BaseModel):
    rabbit_name: str
    payload: dict


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Protege endpoints sensibles con una API key opcional.

    Si la variable de entorno API_KEY está definida, se exige la cabecera
    `X-API-Key` con ese valor. Si no está definida, no se aplica control
    (compatibilidad con el uso local/red interna de confianza).
    """
    expected = get_settings().api_key
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="API key inválida o ausente")


def _rabbit_disabled_detail() -> str:
    return "RabbitMQ está deshabilitado en este entorno (RABBITMQ_ENABLED=false)."


def _rabbit_unavailable_detail(error: str) -> str:
    return f"RabbitMQ no disponible: {error}. La API principal sigue operativa en modo degradado."


@router.post(
    "/publish",
    dependencies=[Depends(require_api_key)],
    responses={
        401: {"description": "API key inválida o ausente"},
        503: {"description": "RabbitMQ no disponible o deshabilitado (modo degradado)."},
    },
)
async def publish_message(request: PublishRequest):
    """Publica un payload JSON en RabbitMQ usando rabbit_name como routing key."""
    try:
        settings = get_rabbit_settings()
        if not settings.enabled:
            raise HTTPException(status_code=503, detail=_rabbit_disabled_detail())

        connection = await get_connection(settings.url)
        async with connection.channel() as channel:
            message = aio_pika.Message(
                body=json.dumps(request.payload).encode("utf-8"),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            )
            await channel.default_exchange.publish(message, routing_key=request.rabbit_name)

        return {
            "status": "ok",
            "message": f"Mensaje publicado con éxito a la cola '{request.rabbit_name}'",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("RabbitMQ no disponible para publish: %s", e)
        raise HTTPException(status_code=503, detail=_rabbit_unavailable_detail(str(e)))


@router.get(
    "/queues",
    responses={
        503: {"description": "RabbitMQ no disponible o deshabilitado (modo degradado)."},
    },
)
async def get_queues():
    """Devuelve el listado de colas con su número de mensajes y consumidores."""
    try:
        settings = get_rabbit_settings()
        if not settings.enabled:
            raise HTTPException(status_code=503, detail=_rabbit_disabled_detail())

        connection = await get_connection(settings.url)
        stats = []
        for q_name in RABBIT_QUEUES:
            # Un canal por cola: una declaración passive fallida cierra el canal
            # en AMQP, así que aislamos cada comprobación para no arrastrar el error.
            try:
                async with connection.channel() as channel:
                    queue = await channel.declare_queue(q_name, passive=True)
                    stats.append({
                        "name": q_name,
                        "messages": queue.declaration_result.message_count,
                        "consumers": queue.declaration_result.consumer_count,
                    })
            except Exception as e:
                stats.append({"name": q_name, "messages": 0, "consumers": 0, "error": str(e)})
        return {"queues": stats}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("RabbitMQ no disponible para consultar colas: %s", e)
        raise HTTPException(status_code=503, detail=_rabbit_unavailable_detail(str(e)))
