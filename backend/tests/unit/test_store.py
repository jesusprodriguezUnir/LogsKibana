from pathlib import Path

import pandas as pd

from services.store import SessionStore


def test_store_persists_session_to_disk(tmp_path: Path) -> None:
    store_a = SessionStore(storage_dir=tmp_path)
    session_id = "session-123"
    df = pd.DataFrame(
        [{"timestamp": "2026-04-01T10:00:00Z", "message": "error", "level": "error", "service": "api", "host": "h1", "date": "2026-04-01"}]
    )

    store_a.save(session_id, df)

    # Simula recarga de proceso creando una nueva instancia del store.
    store_b = SessionStore(storage_dir=tmp_path)
    loaded = store_b.get(session_id)

    assert loaded is not None
    assert len(loaded) == 1
    assert loaded.iloc[0]["service"] == "api"
