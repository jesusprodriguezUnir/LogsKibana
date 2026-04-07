import pandas as pd
import pytest

from services.csv_processor import CSVValidationError, normalize_dataframe, parse_csv_text


CSV_OK = """timestamp,level,service,host,message
2026-04-01T10:00:00Z,ERROR,api,host-1,Fallo controlado
2026-04-01T10:01:00Z,INFO,api,host-1,Inicio
"""

CSV_KIBANA_MIN = '"@timestamp",message\n"Mar 31, 2026 @ 09:37:18.780","Error con el Servicio de Evaluaciones : https://evaluaciones.unir.net/api/v1/recurso"\n'


def test_parse_csv_text_happy_path() -> None:
    df = parse_csv_text(CSV_OK)
    assert len(df) == 2
    assert {"timestamp", "level", "service", "host", "message", "date"}.issubset(df.columns)
    assert str(df.iloc[0]["level"]) == "error"


def test_normalize_dataframe_missing_columns() -> None:
    raw = pd.DataFrame({"timestamp": ["2026-04-01T10:00:00Z"], "level": ["INFO"]})
    with pytest.raises(CSVValidationError):
        normalize_dataframe(raw)


def test_parse_kibana_export_with_only_timestamp_and_message() -> None:
    df = parse_csv_text(CSV_KIBANA_MIN)
    assert len(df) == 1
    assert str(df.iloc[0]["level"]) == "error"
    assert str(df.iloc[0]["service"]) == "evaluaciones"
    assert str(df.iloc[0]["host"]) == "evaluaciones.unir.net"
    assert str(df.iloc[0]["location"]) == "/api/v1/recurso"
    assert str(df.iloc[0]["logger"]) == "unknown"
    assert str(df.iloc[0]["method"]) == "unknown"


def test_parse_exception_message_extracts_logger_and_location() -> None:
    csv_text = '"@timestamp",message\n"Mar 31, 2026 @ 09:39:40.196","Ocurrió una Excepción del tipo: System.AggregateException\n   at Unir.Expedientes.WebUi.Subscriptions.NotaFinalGeneradaSubscriptor.HandleAsync(MessageContext`1 message) in /src/Web/Subscriptions/NotaFinalGeneradaSubscriptor.cs:line 22\nRabbitMQ message End on: d06ad03eddcc, Method: Unir.Expedientes.Application.NotaFinalGenerada.NotaFinalGeneradaCommand"\n'
    df = parse_csv_text(csv_text)
    assert len(df) == 1
    assert str(df.iloc[0]["logger"]) == "Unir.Expedientes.Application.NotaFinalGenerada.NotaFinalGeneradaCommand"
    assert str(df.iloc[0]["location"]) == "/src/Web/Subscriptions/NotaFinalGeneradaSubscriptor.cs"
    assert str(df.iloc[0]["exception_type"]) == "System.AggregateException"
