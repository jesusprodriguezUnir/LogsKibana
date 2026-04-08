import io
import zipfile
from uuid import uuid4

import pandas as pd
from fastapi.testclient import TestClient

from api.main import app
from services.store import store


def make_df():
    data = {
        "timestamp": [pd.to_datetime("2026-04-01T10:00:00Z", utc=True), pd.to_datetime("2026-04-01T10:01:00Z", utc=True)],
        "level": ["error", "info"],
        "service": ["svc1", "svc2"],
        "host": ["host-1", "host-2"],
        "logger": ["logger1", "logger2"],
        "location": ["/path/one", "/path/two"],
        "method": ["GET", "POST"],
        "status_code": ["500", "200"],
        "message": ["TestMessage RabbitNameX payload", "OtherMessage RabbitNameY payload"],
        "exception_type": ["System.Exception", ""],
    }
    return pd.DataFrame(data)


def test_export_zip_contains_files():
    client = TestClient(app)
    session_id = str(uuid4())
    df = make_df()
    store.save(session_id, df)

    # request zip filtered by message_text that matches both rows via regex
    resp = client.get(f"/api/export_zip?session_id={session_id}&message_text=RabbitName")
    assert resp.status_code == 200
    assert resp.headers.get("content-type") in ("application/zip", "application/octet-stream")

    bio = io.BytesIO(resp.content)
    with zipfile.ZipFile(bio, "r") as zf:
        names = zf.namelist()
        assert len(names) == 2
        for name in names:
            with zf.open(name) as f:
                content = f.read().decode("utf-8")
                assert "METADATA:" in content
                assert "MESSAGE:" in content