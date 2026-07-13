import logging
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from services.config import get_settings
from services.csv_processor import CSVValidationError, parse_csv_text
from services.store import store

router = APIRouter()
logger = logging.getLogger(__name__)

# Límite de tamaño del CSV subido. Configurable por entorno (MB).
MAX_UPLOAD_MB = get_settings().max_upload_mb
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024


@router.post(
    "/upload",
    responses={
        400: {"description": "CSV inválido"},
        413: {"description": "El CSV supera el tamaño máximo permitido"},
    },
)
async def upload_csv(file: Annotated[UploadFile, File(...)]) -> dict[str, object]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="El archivo debe ser CSV")

    # Cortar pronto si el cliente declara un tamaño excesivo.
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"El CSV supera el límite de {MAX_UPLOAD_MB} MB",
        )

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"El CSV supera el límite de {MAX_UPLOAD_MB} MB",
        )

    # Decodificación tolerante: los exports de Kibana/Excel suelen venir con BOM.
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail="No se pudo decodificar el CSV") from exc

    try:
        df = parse_csv_text(text)
    except CSVValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        # Fallo inesperado: 500 con traza en logs, no un 400 genérico que oculta la causa.
        logger.exception("Error inesperado procesando el CSV")
        raise HTTPException(status_code=500, detail="Error interno al procesar el CSV") from exc

    session_id = str(uuid4())
    store.save(session_id, df)

    return {
        "session_id": session_id,
        "rows": len(df),
        "columns": list(df.columns),
        "rows_read": int(df.attrs.get("rows_read", len(df))),
        "rows_dropped": int(df.attrs.get("rows_dropped", 0)),
    }
