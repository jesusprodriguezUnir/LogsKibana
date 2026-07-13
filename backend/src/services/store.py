"""Almacén de sesiones con TTL, límite de entradas y persistencia segura.

Sustituye el `dict` sin límites + `pickle` anterior por:
  - Caché LRU en memoria acotada (`max_sessions`) con expiración por TTL.
  - Persistencia en Parquet (no en pickle): estable entre versiones y sin
    riesgo de ejecución de código arbitrario al deserializar.
  - Acceso protegido por lock (los endpoints síncronos de FastAPI corren en
    un threadpool y comparten esta instancia global).

Configurable por entorno:
  SESSION_MAX          — nº máximo de sesiones en memoria (def. 100)
  SESSION_TTL_SECONDS  — segundos de vida de cada sesión (def. 3600)
"""
from __future__ import annotations

import logging
import time
from collections import OrderedDict
from pathlib import Path
from threading import RLock

import pandas as pd

from services.config import get_settings

logger = logging.getLogger(__name__)

_settings = get_settings()
DEFAULT_MAX_SESSIONS = _settings.session_max
DEFAULT_TTL_SECONDS = _settings.session_ttl_seconds


class SessionStore:
    def __init__(
        self,
        storage_dir: Path | None = None,
        max_sessions: int = DEFAULT_MAX_SESSIONS,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ) -> None:
        self._lock = RLock()
        # sid -> (dataframe, expires_at)
        self._data: OrderedDict[str, tuple[pd.DataFrame, float]] = OrderedDict()
        self._max_sessions = max(1, max_sessions)
        self._ttl = max(1, ttl_seconds)
        self._storage_dir = storage_dir or Path(__file__).resolve().parents[2] / ".session_store"
        self._storage_dir.mkdir(parents=True, exist_ok=True)

    def _session_path(self, session_id: str) -> Path:
        return self._storage_dir / f"{session_id}.parquet"

    def _delete_file(self, session_id: str) -> None:
        try:
            self._session_path(session_id).unlink(missing_ok=True)
        except OSError as exc:  # pragma: no cover - best effort
            logger.warning("No se pudo borrar el fichero de sesión %s: %s", session_id, exc)

    def _evict_if_needed(self) -> None:
        """Elimina las sesiones más antiguas (LRU) si se supera el límite. Requiere lock."""
        while len(self._data) > self._max_sessions:
            old_sid, _ = self._data.popitem(last=False)
            self._delete_file(old_sid)
            logger.info("Sesión evacuada por límite de capacidad: %s", old_sid)

    def save(self, session_id: str, dataframe: pd.DataFrame) -> None:
        expires_at = time.monotonic() + self._ttl
        with self._lock:
            self._data[session_id] = (dataframe, expires_at)
            self._data.move_to_end(session_id)
            self._evict_if_needed()
        # Persistir fuera del lock: to_parquet es E/S y no muta estado compartido.
        try:
            dataframe.to_parquet(self._session_path(session_id))
        except Exception as exc:  # pragma: no cover - la sesión sigue viva en memoria
            logger.warning("No se pudo persistir la sesión %s en Parquet: %s", session_id, exc)

    def get(self, session_id: str) -> pd.DataFrame | None:
        now = time.monotonic()
        with self._lock:
            cached = self._data.get(session_id)
            if cached is not None:
                dataframe, expires_at = cached
                if expires_at >= now:
                    self._data.move_to_end(session_id)
                    return dataframe
                # Expirada: purgar memoria y disco.
                del self._data[session_id]
                self._delete_file(session_id)
                return None

        # Fallback a disco (p. ej. tras reinicio del proceso). TTL por mtime.
        session_file = self._session_path(session_id)
        if not session_file.exists():
            return None
        if (time.time() - session_file.stat().st_mtime) > self._ttl:
            self._delete_file(session_id)
            return None

        try:
            loaded = pd.read_parquet(session_file)
        except Exception as exc:
            logger.warning("No se pudo leer la sesión %s desde disco: %s", session_id, exc)
            return None

        with self._lock:
            self._data[session_id] = (loaded, time.monotonic() + self._ttl)
            self._data.move_to_end(session_id)
            self._evict_if_needed()
        return loaded


store = SessionStore()
