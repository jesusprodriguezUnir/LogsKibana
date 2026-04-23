from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import aio_pika
import json
import logging
from services.rabbit_init import RABBIT_QUEUES
from services.rabbit_settings import get_rabbit_settings

router = APIRouter()
logger = logging.getLogger(__name__)

class PublishRequest(BaseModel):
    rabbit_name: str
    payload: dict


def _rabbit_disabled_detail() -> str:
    return "RabbitMQ está deshabilitado en este entorno (RABBITMQ_ENABLED=false)."


def _rabbit_unavailable_detail(error: str) -> str:
    return f"RabbitMQ no disponible: {error}. La API principal sigue operativa en modo degradado."

@router.post(
    "/publish",
    responses={
        503: {
            "description": "RabbitMQ no disponible o deshabilitado (modo degradado)."
        }
    },
)
async def publish_message(request: PublishRequest):
    """
    Publica un mensaje (payload JSON) hacia RabbitMQ local
    usando rabbit_name como routing key en el exchange por defecto.
    """
    try:
        settings = get_rabbit_settings()
        if not settings.enabled:
            raise HTTPException(status_code=503, detail=_rabbit_disabled_detail())

        rabbit_url = settings.url
        
        connection = await aio_pika.connect_robust(rabbit_url)
        
        async with connection:
            channel = await connection.channel()
            
            # Convertimos el payload a str JSON
            message_body = json.dumps(request.payload).encode("utf-8")
            
            message = aio_pika.Message(
                body=message_body,
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT
            )
            
            # Enviamos usando default exchange
            await channel.default_exchange.publish(
                message,
                routing_key=request.rabbit_name
            )
            
            return {
                "status": "ok",
                "message": f"Mensaje publicado con éxito a la cola '{request.rabbit_name}'"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"RabbitMQ no disponible para publish: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=_rabbit_unavailable_detail(str(e))
        )

@router.get(
    "/queues",
    responses={
        503: {
            "description": "RabbitMQ no disponible o deshabilitado (modo degradado)."
        }
    },
)
async def get_queues():
    """
    Obtiene el listado de colas y el número de mensajes de cada una.
    """
    try:
        settings = get_rabbit_settings()
        if not settings.enabled:
            raise HTTPException(status_code=503, detail=_rabbit_disabled_detail())

        rabbit_url = settings.url
        connection = await aio_pika.connect_robust(rabbit_url)
        stats = []
        
        async with connection:
            channel = await connection.channel()
            for q_name in RABBIT_QUEUES:
                try:
                    queue = await channel.declare_queue(q_name, passive=True)
                    stats.append({
                        "name": q_name,
                        "messages": queue.declaration_result.message_count,
                        "consumers": queue.declaration_result.consumer_count
                    })
                except Exception as e:
                    # Si no existe pacivamente, la omitimos o devolvemos 0
                    stats.append({
                        "name": q_name,
                        "messages": 0,
                        "consumers": 0,
                        "error": str(e)
                    })
        return {"queues": stats}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"RabbitMQ no disponible para consultar colas: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=_rabbit_unavailable_detail(str(e))
        )
