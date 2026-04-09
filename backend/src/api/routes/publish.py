from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import aio_pika
import json
import logging
import os

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
        # Por defecto asume que estás corriendo vía docker-compose.
        # Si estás en Render, fallará a menos que definas la variable apuntando a CloudAMQP o similar.
        rabbit_url = os.environ.get("RABBITMQ_URL", "amqp://invitado:secreta@rabbitmq:5672/")
        
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
