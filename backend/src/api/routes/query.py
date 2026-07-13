from dataclasses import dataclass
from typing import Annotated
from fastapi import Request

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, StreamingResponse
import io
import json
import zipfile
import pandas as pd

from services.query_engine import GROUPABLE_FIELDS, apply_filters, grouping_summary, paginate, records, sort_dataframe
from services.store import store

router = APIRouter()
SESSION_NOT_FOUND = "session_id no encontrado"


# ─── Params dataclasses ──────────────────────────────────────────────────────

@dataclass
class FilterParams:
    text: str | None = None
    level: str | None = None
    service: str | None = None
    host: str | None = None
    logger: str | None = None
    location: str | None = None
    status_code: str | None = None
    message_text: str | None = None
    logger_text: str | None = None
    location_text: str | None = None
    timestamp_from: str | None = None
    timestamp_to: str | None = None
    rabbit_names: str | None = None


@dataclass
class SearchTableParams:
    sort_by: str | None = None
    sort_order: str = "desc"
    page: int = 1
    page_size: int = 50


def get_filter_params(
    text: Annotated[str | None, Query()] = None,
    level: Annotated[str | None, Query()] = None,
    service: Annotated[str | None, Query()] = None,
    host: Annotated[str | None, Query()] = None,
    logger: Annotated[str | None, Query()] = None,
    location: Annotated[str | None, Query()] = None,
    status_code: Annotated[str | None, Query()] = None,
    message_text: Annotated[str | None, Query()] = None,
    logger_text: Annotated[str | None, Query()] = None,
    location_text: Annotated[str | None, Query()] = None,
    timestamp_from: Annotated[str | None, Query()] = None,
    timestamp_to: Annotated[str | None, Query()] = None,
    rabbit_names: Annotated[str | None, Query()] = None,
) -> FilterParams:
    return FilterParams(
        text=text, level=level, service=service, host=host,
        logger=logger, location=location, status_code=status_code,
        message_text=message_text, logger_text=logger_text, location_text=location_text,
        timestamp_from=timestamp_from, timestamp_to=timestamp_to,
        rabbit_names=rabbit_names,
    )


def get_search_table_params(
    sort_by: Annotated[str | None, Query()] = None,
    sort_order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 50,
) -> SearchTableParams:
    return SearchTableParams(sort_by=sort_by, sort_order=sort_order, page=page, page_size=page_size)


# ─── Shared helper ───────────────────────────────────────────────────────────

def _resolve_and_filter(df: pd.DataFrame, filters: FilterParams, request: Request | None = None) -> pd.DataFrame:
    """Aplica filtros estándar + filtros dinámicos de payload sobre un DataFrame."""
    filtered = apply_filters(
        df,
        text=filters.text,
        level=filters.level,
        service=filters.service,
        host=filters.host,
        logger=filters.logger,
        location=filters.location,
        status_code=filters.status_code,
        message_text=filters.message_text,
        logger_text=filters.logger_text,
        location_text=filters.location_text,
        timestamp_from=filters.timestamp_from,
        timestamp_to=filters.timestamp_to,
        rabbit_names=filters.rabbit_names,
    )

    if request is None:
        return filtered

    # Filtros dinámicos por columnas payload.*
    payload_params = {k[len("payload."):]: v for k, v in request.query_params.items() if k.startswith("payload.")}
    for field, value in payload_params.items():
        if field.endswith("_from") or field.endswith("_to"):
            base, suffix = field.rsplit("_", 1)
            col = f"payload_{base}"
            if col not in filtered.columns:
                continue
            if pd.api.types.is_datetime64_any_dtype(filtered[col]):
                try:
                    dt = pd.to_datetime(value, utc=True, errors="coerce")
                except Exception:
                    dt = pd.to_datetime(value, errors="coerce")
                filtered = filtered[filtered[col] >= dt] if suffix == "from" else filtered[filtered[col] <= dt]
            else:
                try:
                    num = float(value)
                    filtered = (
                        filtered[pd.to_numeric(filtered[col], errors="coerce") >= num]
                        if suffix == "from"
                        else filtered[pd.to_numeric(filtered[col], errors="coerce") <= num]
                    )
                except Exception:
                    continue
        else:
            col = f"payload_{field}"
            if col not in filtered.columns:
                continue
            if pd.api.types.is_string_dtype(filtered[col]) or filtered[col].dtype == object:
                filtered = filtered[filtered[col].astype(str).str.contains(value, case=False, na=False, regex=False)]
            else:
                try:
                    num = float(value)
                    filtered = filtered[pd.to_numeric(filtered[col], errors="coerce") == num]
                except Exception:
                    filtered = filtered[filtered[col].astype(str).str.contains(value, case=False, na=False, regex=False)]

    return filtered


def _get_df_or_404(session_id: str) -> pd.DataFrame:
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    return df


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/search", responses={404: {"description": "Sesión no encontrada"}})
def search(
    session_id: str,
    filters: Annotated[FilterParams, Depends(get_filter_params)],
    table: Annotated[SearchTableParams, Depends(get_search_table_params)],
    request: Request,
) -> dict[str, object]:
    df = _get_df_or_404(session_id)
    filtered = _resolve_and_filter(df, filters, request)
    sorted_df = sort_dataframe(filtered, sort_by=table.sort_by, sort_order=table.sort_order)
    page_df, total = paginate(sorted_df, page=table.page, page_size=table.page_size)
    return {
        "total": total,
        "page": table.page,
        "page_size": table.page_size,
        "sort_by": table.sort_by or "timestamp",
        "sort_order": table.sort_order,
        "items": records(page_df),
    }


@router.get("/group", responses={404: {"description": "Sesión no encontrada"}})
def group(
    session_id: str,
    filters: Annotated[FilterParams, Depends(get_filter_params)],
    group_by: Annotated[str | None, Query()] = None,
) -> dict[str, object]:
    df = _get_df_or_404(session_id)
    filtered = _resolve_and_filter(df, filters)
    requested_fields = [f.strip() for f in (group_by or "").split(",") if f.strip()]
    valid_fields = [f for f in requested_fields if f in GROUPABLE_FIELDS]
    return grouping_summary(filtered, group_fields=valid_fields or None)


@router.get(
    "/export",
    response_class=PlainTextResponse,
    responses={404: {"description": "Sesión no encontrada"}},
)
def export_csv(
    session_id: str,
    filters: Annotated[FilterParams, Depends(get_filter_params)],
) -> str:
    df = _get_df_or_404(session_id)
    filtered = _resolve_and_filter(df, filters)
    cols = ["timestamp", "level", "service", "host", "logger", "location", "method", "status_code", "message"]
    out = filtered[cols].copy()
    out["timestamp"] = out["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return out.to_csv(index=False)


@router.get("/export_zip", responses={404: {"description": "Sesión no encontrada"}})
def export_zip(
    session_id: str,
    filters: Annotated[FilterParams, Depends(get_filter_params)],
    max_messages: Annotated[int, Query(ge=1, le=10000)] = 5000,
) -> StreamingResponse:
    """Genera un ZIP con un archivo de texto por cada mensaje filtrado."""
    df = _get_df_or_404(session_id)
    filtered = _resolve_and_filter(df, filters)

    bio = io.BytesIO()

    if len(filtered) == 0:
        with zipfile.ZipFile(bio, mode="w"):
            pass
        bio.seek(0)
        return StreamingResponse(
            bio,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=messages_{session_id}.zip"},
        )

    to_export = filtered.head(max_messages)
    with zipfile.ZipFile(bio, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for idx, (_, row) in enumerate(to_export.iterrows(), start=1):
            service = str(row.get("service") or "rabbit").replace(" ", "_")
            filename = f"message_{idx}_{service}.txt"

            try:
                timestamp = row.get("timestamp").strftime("%Y-%m-%dT%H:%M:%SZ") if row.get("timestamp") is not None else ""
            except Exception:
                timestamp = str(row.get("timestamp"))

            meta = {
                "timestamp": timestamp,
                "service": row.get("service"),
                "host": row.get("host"),
                "logger": row.get("logger"),
                "location": row.get("location"),
                "method": row.get("method"),
                "status_code": row.get("status_code"),
                "exception_type": row.get("exception_type"),
            }

            content = "METADATA:\n" + json.dumps(meta, ensure_ascii=False, indent=2) + "\n\nMESSAGE:\n" + str(row.get("message") or "")
            zf.writestr(filename, content)

    bio.seek(0)
    return StreamingResponse(
        bio,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=messages_{session_id}.zip"},
    )
