"""Tests de integración HTTP para los endpoints de la API."""
import io
import zipfile
from uuid import uuid4

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from api.main import app
from services.store import store


def make_sample_df() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "timestamp": pd.to_datetime("2026-04-01T10:00:00Z", utc=True),
                "level": "error",
                "service": "api",
                "host": "host-1",
                "logger": "Unir.Api.Controller",
                "location": "/src/Api/Controller.cs",
                "method": "POST",
                "status_code": "BadRequest",
                "message": "Exception caught: System.NullReferenceException RabbitMQ message End on: abc",
                "exception_type": "System.NullReferenceException",
                "date": "2026-04-01",
            },
            {
                "timestamp": pd.to_datetime("2026-04-01T10:01:00Z", utc=True),
                "level": "info",
                "service": "worker",
                "host": "host-2",
                "logger": "Unir.Worker.Handler",
                "location": "/src/Worker/Handler.cs",
                "method": "GET",
                "status_code": "Ok",
                "message": "Todo bien",
                "exception_type": "unknown",
                "date": "2026-04-01",
            },
        ]
    )


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def session(client: TestClient):
    """Crea una sesión de prueba y devuelve su ID."""
    session_id = str(uuid4())
    store.save(session_id, make_sample_df())
    return session_id


# ─── /health ─────────────────────────────────────────────────────────────────

def test_health(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ─── /api/upload ─────────────────────────────────────────────────────────────

def test_upload_valid_csv(client: TestClient) -> None:
    csv = "timestamp,level,service,host,message\n2026-04-01T10:00:00Z,ERROR,api,host-1,Fallo\n"
    resp = client.post("/api/upload", files={"file": ("logs.csv", csv.encode(), "text/csv")})
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert data["rows"] == 1


def test_upload_rejects_non_csv(client: TestClient) -> None:
    resp = client.post("/api/upload", files={"file": ("logs.txt", b"hola", "text/plain")})
    assert resp.status_code == 400


def test_upload_rejects_invalid_csv(client: TestClient) -> None:
    csv = "color,size\nrojo,grande\n"
    resp = client.post("/api/upload", files={"file": ("logs.csv", csv.encode(), "text/csv")})
    assert resp.status_code == 400


# ─── /api/search ─────────────────────────────────────────────────────────────

def test_search_returns_all_rows(client: TestClient, session: str) -> None:
    resp = client.get(f"/api/search?session_id={session}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


def test_search_filter_by_level(client: TestClient, session: str) -> None:
    resp = client.get(f"/api/search?session_id={session}&level=error")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["level"] == "error"


def test_search_filter_by_service(client: TestClient, session: str) -> None:
    resp = client.get(f"/api/search?session_id={session}&service=worker")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


def test_search_pagination(client: TestClient, session: str) -> None:
    resp = client.get(f"/api/search?session_id={session}&page=1&page_size=1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 1


def test_search_unknown_session(client: TestClient) -> None:
    resp = client.get("/api/search?session_id=does-not-exist")
    assert resp.status_code == 404


# ─── /api/group ──────────────────────────────────────────────────────────────

def test_group_returns_summary(client: TestClient, session: str) -> None:
    resp = client.get(f"/api/group?session_id={session}&group_by=level")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_rows" in data
    assert data["total_rows"] == 2
    assert "groups" in data
    assert "error" in data["groups"]["level"]


# ─── /api/export ─────────────────────────────────────────────────────────────

def test_export_csv_returns_csv(client: TestClient, session: str) -> None:
    resp = client.get(f"/api/export?session_id={session}")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers.get("content-type", "")
    lines = resp.text.strip().split("\n")
    assert len(lines) == 3  # header + 2 rows


def test_export_csv_filtered(client: TestClient, session: str) -> None:
    resp = client.get(f"/api/export?session_id={session}&level=error")
    assert resp.status_code == 200
    lines = resp.text.strip().split("\n")
    assert len(lines) == 2  # header + 1 row


# ─── /api/export_zip ─────────────────────────────────────────────────────────

def test_export_zip_returns_zip(client: TestClient, session: str) -> None:
    resp = client.get(f"/api/export_zip?session_id={session}")
    assert resp.status_code == 200
    assert "zip" in resp.headers.get("content-type", "")
    bio = io.BytesIO(resp.content)
    with zipfile.ZipFile(bio, "r") as zf:
        names = zf.namelist()
        assert len(names) == 2
        for name in names:
            content = zf.read(name).decode("utf-8")
            assert "METADATA:" in content
            assert "MESSAGE:" in content


def test_export_zip_empty_session(client: TestClient, session: str) -> None:
    resp = client.get(f"/api/export_zip?session_id={session}&level=fatal")
    assert resp.status_code == 200
    bio = io.BytesIO(resp.content)
    with zipfile.ZipFile(bio, "r") as zf:
        assert len(zf.namelist()) == 0
