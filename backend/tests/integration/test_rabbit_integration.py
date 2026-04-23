import pytest
from httpx import AsyncClient, ASGITransport
import asyncio
from api.main import app

@pytest.mark.asyncio
async def test_publish_and_queues():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # test queues endpoint
        resp = await ac.get("/api/queues")
        # En modo degradado (sin Rabbit disponible) responde 503 sin tumbar la API.
        assert resp.status_code in (200, 503), f"Respuesta inesperada en /api/queues: {resp.text}"
        if resp.status_code == 200:
            data = resp.json()
            assert "queues" in data
        
        # test publish endpoint
        publish_payload = {
            "rabbit_name": "MatriculaRealizada",
            "payload": {"Test": "Data"}
        }
        res_pub = await ac.post("/api/publish", json=publish_payload)
        
        # Si RabbitMQ no está disponible, /api/publish retorna 503 en modo degradado.
        if res_pub.status_code == 200:
            assert res_pub.json()["status"] == "ok"
        else:
            assert res_pub.status_code == 503
