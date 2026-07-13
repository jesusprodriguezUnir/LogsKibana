"""Verifica que la lista de colas del backend y las definiciones del broker
coincidan, evitando la deriva entre las distintas fuentes de verdad (ver
MEJORAS.md §4). Si divergen, este test falla en CI antes de desplegar."""
import json
from pathlib import Path

from services.rabbit_init import RABBIT_QUEUES

DEFINITIONS = (
    Path(__file__).resolve().parents[2].parent / "infra" / "docker" / "rabbitmq_definitions.json"
)


def test_rabbit_queues_match_broker_definitions() -> None:
    data = json.loads(DEFINITIONS.read_text(encoding="utf-8"))
    defined = {q["name"] for q in data["queues"]}
    declared = set(RABBIT_QUEUES)

    assert declared == defined, (
        "Desincronización de colas Rabbit.\n"
        f"Solo en RABBIT_QUEUES (rabbit_init.py): {sorted(declared - defined)}\n"
        f"Solo en rabbitmq_definitions.json: {sorted(defined - declared)}"
    )


def test_rabbit_queues_have_no_duplicates() -> None:
    assert len(RABBIT_QUEUES) == len(set(RABBIT_QUEUES))
