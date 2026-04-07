# Backend API

## Run local

```bash
pip install -e .[dev]
uvicorn api.main:app --reload --app-dir src
```

## Test

```bash
pytest
```
