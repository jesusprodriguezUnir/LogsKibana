"""Vista de configuración específica de RabbitMQ.

Mantiene la interfaz `RabbitSettings` / `get_rabbit_settings()` usada por el
resto del backend y los tests, delegando en la configuración centralizada
(`services.config`) como única fuente de verdad.
"""
from dataclasses import dataclass

from services.config import get_settings


@dataclass(frozen=True)
class RabbitSettings:
    enabled: bool
    url: str
    retries: int
    retry_delay_seconds: int


def get_rabbit_settings() -> RabbitSettings:
    s = get_settings()
    return RabbitSettings(
        enabled=s.rabbit_enabled,
        url=s.rabbitmq_url,
        retries=s.rabbitmq_retries,
        retry_delay_seconds=s.rabbitmq_retry_delay,
    )
