from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import aio_pika
import json
import logging
import os
from services.rabbit_init import RABBIT_QUEUES

router = APIRouter()
logger = logging.getLogger(__name__)

class PublishRequest(BaseModel):
    rabbit_name: str
    payload: dict

@router.post("/publish")
async def publish_message(request: PublishRequest):
    """
    Publica un mensaje (payload JSON) hacia RabbitMQ local
    usando rabbit_name como routing key en el exchange por defecto.
    """
    try:
        # Por defecto asume que estás corriendo en local (127.0.0.1)
        # Si estás en Docker, debes definir la variable apuntando a "rabbitmq"
        rabbit_url = os.environ.get("RABBITMQ_URL", "amqp://invitado:secreta@127.0.0.1:5672/")
        
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
            
    except Exception as e:
        logger.error(f"Error publishing to RabbitMQ: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error conectando o publicando en RabbitMQ local: {str(e)}"
        )

@router.get("/queues")
async def get_queues():
    """
    Obtiene el listado de colas y el número de mensajes de cada una.
    """
    try:
        rabbit_url = os.environ.get("RABBITMQ_URL", "amqp://invitado:secreta@127.0.0.1:5672/")
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
    except Exception as e:
        logger.error(f"Error getting RabbitMQ queues: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo colas de RabbitMQ local: {str(e)}"
        )
