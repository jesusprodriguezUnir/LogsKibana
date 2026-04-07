from pathlib import Path
from collections.abc import MutableMapping

import pandas as pd


class SessionStore:
    def __init__(self, storage_dir: Path | None = None) -> None:
        self._data: MutableMapping[str, pd.DataFrame] = {}
        self._storage_dir = storage_dir or Path(__file__).resolve().parents[2] / ".session_store"
        self._storage_dir.mkdir(parents=True, exist_ok=True)

    def _session_path(self, session_id: str) -> Path:
        return self._storage_dir / f"{session_id}.pkl"

    def save(self, session_id: str, dataframe: pd.DataFrame) -> None:
        self._data[session_id] = dataframe
        dataframe.to_pickle(self._session_path(session_id))

    def get(self, session_id: str) -> pd.DataFrame | None:
        in_memory = self._data.get(session_id)
        if in_memory is not None:
            return in_memory

        session_file = self._session_path(session_id)
        if not session_file.exists():
            return None

        loaded = pd.read_pickle(session_file)
        self._data[session_id] = loaded
        return loaded


store = SessionStore()
