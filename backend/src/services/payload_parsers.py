import json
import re
from typing import Any, Dict

def _extract_balanced_json(text: str) -> str | None:
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                return text[start : i + 1]
            if depth < 0:
                return None
    return None


def _decode_escaped_message(s: str) -> str:
    return (
        s.replace("\\/", "/")
        .replace("\\u0022", '"')
        .replace("\\u002c", ",")
        .replace("\\u003a", ":")
    )


def extract_json_payload(text: str) -> Dict[str, Any] | None:
    """Intentar extraer el JSON de un mensaje Rabbit y devolver un dict con campos.

    Devuelve None si no se encuentra JSON parseable.
    """
    # Primero, buscar un campo "Message" que contenga JSON codificado como string
    m = re.search(r'"Message"\s*:\s*"([^"]+)"', text)
    candidate = None
    if m:
        decoded = _decode_escaped_message(m.group(1))
        candidate = decoded
    else:
        # intentar extraer bloque JSON balanceado
        block = _extract_balanced_json(text)
        if block:
            candidate = block

    if not candidate:
        return None

    try:
        payload = json.loads(candidate)
        # Normalizar claves: admitir PascalCase o camelCase
        normalized = {}
        for k, v in payload.items():
            normalized[k] = v
        return normalized
    except Exception:
        return None
