"""Registro declarativo de esquemas de evento RabbitMQ.

Sustituye el bloque `if/elif` incrustado en `csv_processor` por una definición
declarativa: añadir un evento nuevo es añadir una entrada en `EVENT_SCHEMAS`,
sin tocar el pipeline de normalización. Es, además, la fuente de verdad de los
campos por evento en el backend (el frontend replica su equivalente en
`config/rabbitFields.ts`; ver `MEJORAS.md` §4 sobre la unificación pendiente).

Modelo:
  - `FieldSpec` describe una columna destino `payload_*`, las claves candidatas
    en el payload (admite PascalCase y camelCase) y cómo castear el valor.
  - `EventSchema` asocia un marcador de texto con una lista de `FieldSpec` y un
    post-procesador opcional para estructuras anidadas (listas / dicts).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import pandas as pd

# Modos de casteo soportados.
CAST_GET = "get"            # primer valor presente (conserva 0 y "")
CAST_INT = "int"            # int(v) si truthy, si no None (compat. comportamiento previo)
CAST_DATETIME = "datetime"  # pandas datetime UTC, None si no parseable


@dataclass(frozen=True)
class FieldSpec:
    dest: str
    keys: tuple[str, ...]
    cast: str = CAST_GET


@dataclass(frozen=True)
class EventSchema:
    marker: str
    fields: tuple[FieldSpec, ...]
    post: Callable[[dict[str, Any], dict[str, Any]], None] | None = None


def _first_present(parsed: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if parsed.get(key) is not None:
            return parsed[key]
    return None


def _first_truthy(parsed: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if parsed.get(key):
            return parsed[key]
    return None


def _cast_value(parsed: dict[str, Any], spec: FieldSpec) -> Any:
    if spec.cast == CAST_INT:
        val = _first_truthy(parsed, spec.keys)
        return int(val) if val else None
    if spec.cast == CAST_DATETIME:
        val = _first_truthy(parsed, spec.keys)
        if val is None:
            return None
        return pd.to_datetime(val, errors="coerce", utc=True)
    return _first_present(parsed, spec.keys)


# ─── Post-procesadores para estructuras anidadas ─────────────────────────────

def _post_nota_final(parsed: dict[str, Any], out: dict[str, Any]) -> None:
    notas = parsed.get("Notas", [])
    if isinstance(notas, list):
        out["payload_Notas_IdAlumno"] = ",".join(
            str(n.get("IdAlumno", "")) for n in notas if n.get("IdAlumno") is not None
        )
        out["payload_Notas_Convocatoria"] = ",".join(
            str(n.get("Convocatoria", "")) for n in notas if n.get("Convocatoria") is not None
        )


def _post_diligencia_cerrada(parsed: dict[str, Any], out: dict[str, Any]) -> None:
    nat = parsed.get("NaturalezaDiligencia")
    if isinstance(nat, dict):
        out["payload_NaturalezaDiligencia_Id"] = nat.get("Id")
        out["payload_NaturalezaDiligencia_Descripcion"] = nat.get("Descripcion")


# ─── Registro de esquemas ─────────────────────────────────────────────────────

EVENT_SCHEMAS: tuple[EventSchema, ...] = (
    EventSchema(
        marker="ActaArchivada",
        fields=(
            FieldSpec("payload_IdActa", ("IdActa", "idActa"), CAST_INT),
            FieldSpec("payload_Fecha", ("Fecha", "fecha"), CAST_DATETIME),
            FieldSpec("payload_IdClase", ("IdClase", "idClase"), CAST_INT),
            FieldSpec("payload_TipoEvaluacion", ("TipoEvaluacion", "tipoEvaluacion")),
            FieldSpec("payload_IdAlumnoIntegracion", ("IdAlumnoIntegracion", "idAlumnoIntegracion")),
            FieldSpec("payload_OrigenActa", ("OrigenActa", "origenActa")),
        ),
    ),
    EventSchema(
        marker="NotaFinalGenerada",
        fields=(
            FieldSpec("payload_Plataforma", ("Plataforma",)),
            FieldSpec("payload_Provisional", ("Provisional",)),
            FieldSpec("payload_IdCurso", ("IdCurso",)),
            FieldSpec("payload_IdUsuarioPublicadorConfirmador", ("IdUsuarioPublicadorConfirmador",)),
            FieldSpec("payload_IdActa", ("IdActa",)),
        ),
        post=_post_nota_final,
    ),
    EventSchema(
        marker="DiligenciaCerrada",
        fields=(
            FieldSpec("payload_IdActa", ("IdActa",)),
            FieldSpec("payload_IdDiligencia", ("IdDiligencia",)),
            FieldSpec("payload_FechaCierre", ("FechaCierre",)),
        ),
        post=_post_diligencia_cerrada,
    ),
    EventSchema(
        marker="NotaDesglosadaModificada",
        fields=(
            FieldSpec("payload_IdAlumno", ("IdAlumno",)),
            FieldSpec("payload_IdEstudio", ("IdEstudio",)),
            FieldSpec("payload_IdAsignatura", ("IdAsignatura",)),
            FieldSpec("payload_IdCurso", ("IdCurso",)),
            FieldSpec("payload_AnyoAcademico", ("AnyoAcademico",)),
        ),
    ),
    EventSchema(
        marker="MatriculaRealizada",
        fields=(
            FieldSpec("payload_UniversidadIdIntegracion", ("UniversidadIdIntegracion",)),
            FieldSpec("payload_MatriculaIdIntegracion", ("MatriculaIdIntegracion",)),
            FieldSpec("payload_EsMatriculaNuevoIngreso", ("EsMatriculaNuevoIngreso",)),
            FieldSpec("payload_AlumnoIdIntegracion", ("AlumnoIdIntegracion",)),
            FieldSpec("payload_NumeroDocumento", ("NumeroDocumento",)),
            FieldSpec("payload_IdPlanOfertado", ("IdPlanOfertado",)),
            FieldSpec("payload_IdViaAcceso", ("IdViaAcceso",)),
            FieldSpec("payload_OperacionVentaIdIntegracion", ("OperacionVentaIdIntegracion",)),
        ),
    ),
)


def extract_event_fields(message: str, parsed: dict[str, Any]) -> dict[str, Any]:
    """Devuelve las columnas `payload_*` para el primer evento cuyo marcador
    aparezca en el mensaje. Diccionario vacío si ningún esquema coincide."""
    for schema in EVENT_SCHEMAS:
        if schema.marker in message:
            out: dict[str, Any] = {}
            for spec in schema.fields:
                out[spec.dest] = _cast_value(parsed, spec)
            if schema.post is not None:
                schema.post(parsed, out)
            return out
    return {}
