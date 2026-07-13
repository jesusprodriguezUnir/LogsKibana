from io import StringIO
import re
from urllib.parse import urlparse

import pandas as pd
from datetime import datetime
from services.event_schemas import extract_event_fields
from services.payload_parsers import extract_json_payload

REQUIRED_COLUMNS = ["timestamp", "message"]
COLUMN_ALIASES = {
    "@timestamp": "timestamp",
    "log.level": "level",
    "service.name": "service",
    "host.name": "host",
    "message": "message",
}


class CSVValidationError(ValueError):
    pass


LEVEL_PATTERNS: list[tuple[str, str]] = [
    (r"\bfatal\b", "fatal"),
    (r"\bexception\b|\bexcepcion\b", "exception"),
    (r"\berror\b", "error"),
    (r"\bwarn(?:ing)?\b", "warning"),
    (r"\binfo\b", "info"),
    (r"\bdebug\b", "debug"),
]


def infer_level(message: str) -> str:
    text = message.lower()
    for pattern, label in LEVEL_PATTERNS:
        if re.search(pattern, text):
            return label
    return "unknown"


def infer_service(message: str) -> str:
    match = re.search(r"servicio de\s+([^:]+)", message, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip().lower()
    return "unknown"


def infer_host(message: str) -> str:
    url_match = re.search(r"https?://[^\s,]+", message)
    if url_match:
        host = urlparse(url_match.group(0)).netloc
        if host:
            return host.lower()
    return "unknown"


def infer_logger(message: str) -> str:
    match = re.search(r"Method:\s+(Unir\.[A-Za-z0-9_.`]+)", message)
    if match:
        return match.group(1)

    stack_match = re.search(r"\bat\s+(Unir\.[A-Za-z0-9_.`<>]+)", message)
    if stack_match:
        return stack_match.group(1)

    return "unknown"


def infer_location(message: str) -> str:
    source_match = re.search(r"in\s+(/src/[^:\s]+(?:\.[A-Za-z0-9]+)?):line\s+\d+", message)
    if source_match:
        return source_match.group(1)

    url_match = re.search(r"https?://[^\s,]+", message)
    if url_match:
        parsed = urlparse(url_match.group(0))
        if parsed.path:
            return parsed.path

    body_match = re.search(r"Body:\s*([^\s,]+/api/v\d+/[^\s,]+)", message)
    if body_match:
        return body_match.group(1)

    return "unknown"


def infer_method(message: str) -> str:
    match = re.search(r"Method:\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b", message, flags=re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return "unknown"


def infer_status_code(message: str) -> str:
    match = re.search(r"StatusCode:\s*(\w+)", message)
    if match:
        return match.group(1)
    return "unknown"


def infer_exception_type(message: str) -> str:
    match = re.search(r"tipo:\s*([\w.]+Exception)", message, flags=re.IGNORECASE)
    if match:
        return match.group(1)

    generic = re.search(r"\b([\w.]+Exception)\b", message)
    if generic:
        return generic.group(1)
    return "unknown"



def normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    # Renombrar columnas usando los alias definidos
    renamed = df.rename(columns=COLUMN_ALIASES).copy()

    # Permitir que timestamp esté como "@timestamp" o "timestamp"
    if "timestamp" not in renamed.columns:
        if "@timestamp" in df.columns:
            renamed["timestamp"] = df["@timestamp"]
    if "message" not in renamed.columns and "message" in df.columns:
        renamed["message"] = df["message"]

    missing = [col for col in REQUIRED_COLUMNS if col not in renamed.columns]
    if missing:
        raise CSVValidationError(f"Columnas requeridas faltantes: {', '.join(missing)}")

    renamed["message"] = renamed["message"].astype(str)

    if "level" in renamed.columns:
        renamed["level"] = renamed["level"].astype(str).str.lower().str.strip()
    else:
        renamed["level"] = renamed["message"].map(infer_level)

    if "service" in renamed.columns:
        renamed["service"] = renamed["service"].astype(str).str.strip()
    else:
        renamed["service"] = renamed["message"].map(infer_service)

    if "host" in renamed.columns:
        renamed["host"] = renamed["host"].astype(str).str.strip()
    else:
        renamed["host"] = renamed["message"].map(infer_host)

    renamed["logger"] = renamed["message"].map(infer_logger)
    renamed["location"] = renamed["message"].map(infer_location)
    renamed["method"] = renamed["message"].map(infer_method)
    renamed["status_code"] = renamed["message"].map(infer_status_code)
    renamed["exception_type"] = renamed["message"].map(infer_exception_type)

    # Kibana suele exportar timestamps como "Mar 31, 2026 @ 09:37:18.780".
    timestamp_text = renamed["timestamp"].astype(str).str.replace(" @ ", " ", regex=False)
    renamed["timestamp"] = pd.to_datetime(timestamp_text, errors="coerce", utc=True)

    rows_before = len(renamed)
    renamed = renamed.dropna(subset=["timestamp"])
    rows_after = len(renamed)
    renamed["date"] = renamed["timestamp"].dt.strftime("%Y-%m-%d")

    # Extraer campos del payload de mensajes RabbitMQ mediante el registro
    # declarativo de esquemas. Solo se procesan las filas con marcador de evento
    # (minoría), evitando el coste de `apply` fila a fila sobre todo el DataFrame.
    renamed = _attach_payload_fields(renamed)

    # Estadísticas de ingesta (p. ej. filas con timestamp no parseable descartadas).
    renamed.attrs["rows_read"] = rows_before
    renamed.attrs["rows_valid"] = rows_after
    renamed.attrs["rows_dropped"] = rows_before - rows_after

    return renamed


def _attach_payload_fields(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    extracted: dict[int, dict[str, object]] = {}
    for idx, message in df["message"].items():
        msg = str(message)
        parsed = extract_json_payload(msg)
        if not parsed:
            continue
        fields = extract_event_fields(msg, parsed)
        if fields:
            extracted[idx] = fields

    if not extracted:
        return df

    payload_df = pd.DataFrame.from_dict(extracted, orient="index")
    return df.join(payload_df)


def parse_csv_text(csv_text: str) -> pd.DataFrame:
    raw = pd.read_csv(StringIO(csv_text))
    return normalize_dataframe(raw)
