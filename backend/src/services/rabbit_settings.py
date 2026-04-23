import os
from dataclasses import dataclass


DEFAULT_RABBIT_URL = "amqp://devuser:devpassword@127.0.0.1:5672/"


@dataclass(frozen=True)
class RabbitSettings:
    enabled: bool
    url: str
    retries: int
    retry_delay_seconds: int


def _as_bool(raw: str | None, default: bool = True) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "off", "no"}


def get_rabbit_settings() -> RabbitSettings:
    return RabbitSettings(
        enabled=_as_bool(os.environ.get("RABBITMQ_ENABLED"), default=True),
        url=os.environ.get("RABBITMQ_URL", DEFAULT_RABBIT_URL),
        retries=int(os.environ.get("RABBITMQ_RETRIES", "5")),
        retry_delay_seconds=int(os.environ.get("RABBITMQ_RETRY_DELAY", "5")),
    )
