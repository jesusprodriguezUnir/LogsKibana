# Backend API

## Run local

```bash
pip install -e .[dev]
uvicorn api.main:app --reload --app-dir src
```

### RabbitMQ (opcional en local)

- El backend arranca aunque RabbitMQ no este disponible.
- Si RabbitMQ no esta activo, los endpoints `/api/publish` y `/api/queues` responden `503` (modo degradado), pero el resto de la API sigue operativa.
- Variables de entorno utiles:
	- `RABBITMQ_ENABLED=true|false`
	- `RABBITMQ_URL=amqp://devuser:devpassword@127.0.0.1:5672/`
	- `RABBITMQ_RETRIES=5`
	- `RABBITMQ_RETRY_DELAY=5`

## Test

```bash
pytest
```
