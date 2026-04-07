from typing import Any

import pandas as pd

GROUPABLE_FIELDS = [
    "date",
    "level",
    "service",
    "host",
    "logger",
    "location",
    "method",
    "status_code",
    "exception_type",
]

SORTABLE_FIELDS = [
    "timestamp",
    "level",
    "service",
    "host",
    "logger",
    "location",
    "method",
    "status_code",
]

FILTER_OPTION_FIELDS = ["logger", "location", "status_code"]


def apply_filters(
    df: pd.DataFrame,
    text: str | None = None,
    level: str | None = None,
    service: str | None = None,
    host: str | None = None,
    logger: str | None = None,
    location: str | None = None,
    status_code: str | None = None,
    message_text: str | None = None,
    logger_text: str | None = None,
    location_text: str | None = None,
) -> pd.DataFrame:
    result = df

    if text:
        mask = result["message"].str.contains(text, case=False, na=False)
        result = result[mask]
    if message_text:
        result = result[result["message"].str.contains(message_text, case=False, na=False)]
    if level:
        result = result[result["level"] == level.lower()]
    if service:
        result = result[result["service"] == service]
    if host:
        result = result[result["host"] == host]
    if logger:
        result = result[result["logger"] == logger]
    if location:
        result = result[result["location"] == location]
    if status_code:
        result = result[result["status_code"].str.lower() == status_code.lower()]
    if logger_text:
        result = result[result["logger"].str.contains(logger_text, case=False, na=False)]
    if location_text:
        result = result[result["location"].str.contains(location_text, case=False, na=False)]

    return result


def paginate(df: pd.DataFrame, page: int = 1, page_size: int = 50) -> tuple[pd.DataFrame, int]:
    page = max(page, 1)
    page_size = max(min(page_size, 500), 1)
    total = len(df)
    start = (page - 1) * page_size
    end = start + page_size
    return df.iloc[start:end], total


def sort_dataframe(df: pd.DataFrame, sort_by: str | None = None, sort_order: str = "desc") -> pd.DataFrame:
    if not sort_by or sort_by not in SORTABLE_FIELDS or sort_by not in df.columns:
        return df.sort_values(by="timestamp", ascending=False)

    ascending = sort_order.lower() == "asc"
    return df.sort_values(by=sort_by, ascending=ascending, na_position="last")


def filter_options(df: pd.DataFrame) -> dict[str, list[str]]:
    options: dict[str, list[str]] = {}
    for field in FILTER_OPTION_FIELDS:
        if field not in df.columns:
            options[field] = []
            continue

        counts = (
            df[field]
            .fillna("unknown")
            .astype(str)
            .value_counts()
            .head(200)
            .index
            .tolist()
        )
        options[field] = counts

    return options


def diagnostic_top_errors(df: pd.DataFrame) -> list[dict[str, Any]]:
    if len(df) == 0:
        return []

    error_rows = df[df["level"].isin(["error", "exception", "fatal"])]
    if len(error_rows) == 0:
        error_rows = df

    grouped = (
        error_rows.groupby(["service", "status_code", "logger"], dropna=False)
        .size()
        .reset_index(name="count")
        .sort_values(by="count", ascending=False)
        .head(10)
    )

    grouped = grouped.fillna("unknown")
    return grouped.to_dict(orient="records")


def grouping_summary(df: pd.DataFrame, group_fields: list[str] | None = None) -> dict[str, Any]:
    selected_fields = group_fields or ["level", "service", "host", "logger", "location"]
    groups: dict[str, dict[str, int]] = {}

    for field in selected_fields:
        if field not in df.columns or field not in GROUPABLE_FIELDS:
            continue

        series = df[field].fillna("unknown")
        counts = series.groupby(series).size()
        if field == "date":
            groups[field] = counts.sort_index().head(50).to_dict()
        else:
            groups[field] = counts.sort_values(ascending=False).head(20).to_dict()

    return {
        "total_rows": int(len(df)),
        "available_group_fields": GROUPABLE_FIELDS,
        "selected_group_fields": [field for field in selected_fields if field in groups],
        "filter_options": filter_options(df),
        "diagnostics": diagnostic_top_errors(df),
        "groups": groups,
    }


def records(df: pd.DataFrame) -> list[dict[str, Any]]:
    columns = ["timestamp", "level", "service", "host", "logger", "location", "method", "status_code", "message"]
    out = df[columns].copy()
    out["timestamp"] = out["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return out.to_dict(orient="records")
