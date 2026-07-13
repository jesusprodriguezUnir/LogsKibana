"""Configuración centralizada y tipada de la aplicación.

Sustituye las lecturas dispersas de `os.environ` por un único modelo validado
(`pydantic-settings`). Cada variable de entorno se mapea por nombre (case-insensitive):
CORS_ORIGINS, API_KEY, MAX_UPLOAD_MB, SESSION_MAX, SESSION_TTL_SECONDS,
RABBITMQ_ENABLED, RABBITMQ_URL, RABBITMQ_RETRIES, RABBITMQ_RETRY_DELAY.

Ver `backend/.env.example` para la documentación de cada una.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── API / seguridad ──────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173"
    api_key: str | None = None

    # ── Upload ───────────────────────────────────────────────────────────────
    max_upload_mb: int = 50

    # ── Session store ────────────────────────────────────────────────────────
    session_max: int = 100
    session_ttl_seconds: int = 3600

    # ── RabbitMQ ─────────────────────────────────────────────────────────────
    # Se mantiene como str para replicar el parseo permisivo previo (ver
    # `rabbit_enabled`): admite 0/false/off/no como desactivado.
    rabbitmq_enabled: str = "true"
    rabbitmq_url: str = "amqp://devuser:devpassword@127.0.0.1:5672/"
    rabbitmq_retries: int = 5
    rabbitmq_retry_delay: int = 5

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def rabbit_enabled(self) -> bool:
        return self.rabbitmq_enabled.strip().lower() not in {"0", "false", "off", "no"}


def get_settings() -> Settings:
    """Construye la configuración leyendo entorno (+ .env). No se cachea para
    respetar el comportamiento previo de releer el entorno en cada llamada."""
    return Settings()
