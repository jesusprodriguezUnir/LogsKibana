import pandas as pd

from services.query_engine import apply_filters, grouping_summary, paginate, sort_dataframe


def _sample_df() -> pd.DataFrame:
    df = pd.DataFrame(
        [
            {"timestamp": "2026-04-01T10:00:00Z", "level": "error", "service": "api", "host": "h1", "logger": "LoggerA", "location": "/src/A.cs", "method": "POST", "status_code": "BadRequest", "message": "error db"},
            {"timestamp": "2026-04-01T10:01:00Z", "level": "info", "service": "api", "host": "h1", "logger": "LoggerA", "location": "/src/A.cs", "method": "GET", "status_code": "Ok", "message": "started"},
            {"timestamp": "2026-04-02T10:00:00Z", "level": "error", "service": "worker", "host": "h2", "logger": "LoggerB", "location": "/src/B.cs", "method": "POST", "status_code": "BadRequest", "message": "error queue"},
        ]
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["date"] = df["timestamp"].dt.strftime("%Y-%m-%d")
    return df


def test_apply_filters_text_and_level() -> None:
    df = _sample_df()
    filtered = apply_filters(df, text="error", level="error")
    assert len(filtered) == 2


def test_apply_filters_specific_columns() -> None:
    df = _sample_df()
    filtered = apply_filters(df, logger="LoggerA", location="/src/A.cs", status_code="Ok")
    assert len(filtered) == 1
    assert filtered.iloc[0]["method"] == "GET"


def test_apply_filters_column_search() -> None:
    df = _sample_df()
    filtered = apply_filters(df, logger_text="loggerb", location_text="/src/b", message_text="queue")
    assert len(filtered) == 1
    assert filtered.iloc[0]["service"] == "worker"


def test_paginate() -> None:
    df = _sample_df()
    page_df, total = paginate(df, page=2, page_size=2)
    assert total == 3
    assert len(page_df) == 1


def test_grouping_summary() -> None:
    df = _sample_df()
    summary = grouping_summary(df, group_fields=["level", "logger", "location"])
    assert summary["total_rows"] == 3
    assert summary["groups"]["level"]["error"] == 2
    assert summary["groups"]["logger"]["LoggerA"] == 2
    assert summary["groups"]["location"]["/src/A.cs"] == 2
    assert "LoggerA" in summary["filter_options"]["logger"]
    assert summary["diagnostics"][0]["count"] >= 1


def test_sort_dataframe() -> None:
    df = _sample_df()
    sorted_df = sort_dataframe(df, sort_by="service", sort_order="asc")
    assert list(sorted_df["service"])[:2] == ["api", "api"]
