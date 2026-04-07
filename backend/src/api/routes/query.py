from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse

from services.query_engine import GROUPABLE_FIELDS, apply_filters, grouping_summary, paginate, records, sort_dataframe
from services.store import store

router = APIRouter()
SESSION_NOT_FOUND = "session_id no encontrado"


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
) -> FilterParams:
    return FilterParams(
        text=text,
        level=level,
        service=service,
        host=host,
        logger=logger,
        location=location,
        status_code=status_code,
        message_text=message_text,
        logger_text=logger_text,
        location_text=location_text,
    )


def get_search_table_params(
    sort_by: Annotated[str | None, Query()] = None,
    sort_order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 50,
) -> SearchTableParams:
    return SearchTableParams(sort_by=sort_by, sort_order=sort_order, page=page, page_size=page_size)


@router.get("/search", responses={404: {"description": "Sesión no encontrada"}})
def search(
    session_id: str,
    filters: Annotated[FilterParams, Depends(get_filter_params)],
    table: Annotated[SearchTableParams, Depends(get_search_table_params)],
) -> dict[str, object]:
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)

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
    )
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
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)

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
    )
    requested_fields = [field.strip() for field in (group_by or "").split(",") if field.strip()]
    valid_fields = [field for field in requested_fields if field in GROUPABLE_FIELDS]
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
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)

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
    )
    cols = ["timestamp", "level", "service", "host", "logger", "location", "method", "status_code", "message"]
    out = filtered[cols].copy()
    out["timestamp"] = out["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return out.to_csv(index=False)
