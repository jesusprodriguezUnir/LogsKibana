from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from services.csv_processor import CSVValidationError, parse_csv_text
from services.store import store

router = APIRouter()


@router.post("/upload", responses={400: {"description": "CSV inválido"}})
async def upload_csv(file: Annotated[UploadFile, File(...)]) -> dict[str, object]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="El archivo debe ser CSV")

    content = await file.read()
    try:
        text = content.decode("utf-8")
        df = parse_csv_text(text)
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV no es UTF-8") from exc
    except CSVValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail="No se pudo procesar el CSV") from exc

    session_id = str(uuid4())
    store.save(session_id, df)

    return {
        "session_id": session_id,
        "rows": len(df),
        "columns": list(df.columns),
    }
